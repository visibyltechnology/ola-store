import { Link } from "react-router-dom";
import { ShoppingBag, CreditCard, ShieldCheck, Zap, BadgeDollarSign, AlertCircle, CheckCircle2, Loader2, Info } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useCart, CartItem } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatPrice } from "@/data/products";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { db } from "@/integrations/firebase/client";
import { supabase } from "@/integrations/supabase/client";
import { collection, addDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";

// ─── Payment Method Types ────────────────────────────────────────────
type PaymentMethod = "korapay_full" | "klump_bnpl" | "korapay_deposit";

interface MethodConfig {
  id: PaymentMethod;
  title: string;
  subtitle: string;
  description: string;
  badge?: string;
  icon: React.ReactNode;
  accentClass: string;
  borderClass: string;
  bgClass: string;
  available: boolean;
  unavailableReason?: string;
}

// ─── Helper: load Klump script ───────────────────────────────────────
function loadKlumpScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptId = "klump-js-script";
    if (document.getElementById(scriptId)) {
      setTimeout(resolve, 100);
      return;
    }
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://js.useklump.com/klump.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Klump script"));
    document.body.appendChild(script);
  });
}

// ─── Helper: load KoraPay script ─────────────────────────────────────
function loadKorapayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Korapay) { resolve(); return; }
    const scriptId = "korapay-js-script";
    if (document.getElementById(scriptId)) {
      setTimeout(resolve, 100);
      return;
    }
    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://korablobstorage.blob.core.windows.net/modal-bucket/korapay-collections.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load KoraPay script"));
    document.body.appendChild(script);
  });
}

// ─── Component ───────────────────────────────────────────────────────
const Checkout = () => {
  const { items, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(false);

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 px-4">
            <ShieldCheck className="w-16 h-16 mx-auto text-muted-foreground/40" />
            <h2 className="text-xl font-semibold text-foreground">Login Required</h2>
            <p className="text-muted-foreground">You need to be logged in to checkout.</p>
            <Button className="bg-gradient-gold text-accent-foreground" onClick={() => navigate("/login")}>
              Sign In
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // ─── Cart analysis ─────────────────────────────────────────────
  const fullItems = items.filter((i) => i.paymentMode === "full");
  const installmentItems = items.filter((i) => i.paymentMode === "installment");
  const hasInstallmentItems = installmentItems.length > 0;
  const hasMixedCart = fullItems.length > 0 && installmentItems.length > 0;

  // Total if user pays everything in full (all items at full price)
  const fullCartTotal = items.reduce((a, i) => a + i.price * i.quantity, 0);

  // Mixed cart deposit calculation (deposit for installment, full for full)
  const mixedDepositTotal = installmentItems.reduce((a, i) => a + (i.depositAmount ?? i.price) * i.quantity, 0);
  const mixedFullTotal = fullItems.reduce((a, i) => a + i.price * i.quantity, 0);
  const mixedAmountDue = mixedDepositTotal + mixedFullTotal;
  const mixedBalance = installmentItems.reduce((a, i) => a + (i.price - (i.depositAmount ?? i.price)) * i.quantity, 0);

  // All-installment calculation (if they have no installment items but want to pay deposit)
  const allInstallmentDepositTotal = items.reduce((a, i) => a + Math.round(i.price * 0.3) * i.quantity, 0);
  const allInstallmentBalance = items.reduce((a, i) => a + (i.price - Math.round(i.price * 0.3)) * i.quantity, 0);

  // Decide what "Pay Deposit Only" actually charges
  const depositMethodDue = hasInstallmentItems ? mixedAmountDue : allInstallmentDepositTotal;
  const depositMethodBalance = hasInstallmentItems ? mixedBalance : allInstallmentBalance;

  // Delivery Fee Logic
  const DELIVERY_FEE = 5000;
  // If Save to Buy is selected on a mixed cart, they get 2 shipments (immediate for full, later for deposit)
  const isSplitDelivery = selectedMethod === "korapay_deposit" && hasMixedCart;
  const totalDeliveryFee = isSplitDelivery ? DELIVERY_FEE * 2 : DELIVERY_FEE;
  
  // The upfront delivery fee to pay today
  const upfrontDeliveryFee = DELIVERY_FEE; 
  // The future delivery fee to add to balance
  const futureDeliveryFee = isSplitDelivery ? DELIVERY_FEE : 0;

  // Amount due today depending on selected method
  const amountDueNow = (selectedMethod === "korapay_deposit" ? depositMethodDue : fullCartTotal) + upfrontDeliveryFee;

  // Mismatched Installments Check
  const installmentMonths = [...new Set(installmentItems.map(i => i.maxInstallmentMonths ?? 6))];
  const hasMismatchedInstallments = installmentMonths.length > 1;

  // ─── Payment method configs ────────────────────────────────────
  const paymentMethods: MethodConfig[] = [
    {
      id: "korapay_full",
      title: "Pay in Full",
      subtitle: "KoraPay — Card, Bank Transfer, USSD",
      description: "Pay the complete amount for all items right now. No installments, no interest. Item(s) will be prepared for delivery immediately.",
      badge: "Instant",
      icon: <Zap className="w-5 h-5" />,
      accentClass: "text-green-600 dark:text-green-400",
      borderClass: "border-green-500/60",
      bgClass: "bg-green-500/5",
      available: true,
    },
    {
      id: "klump_bnpl",
      title: "Klump Installment Plan",
      subtitle: "Buy Now, Pay Later with Klump",
      description: "Pay for everything in easy installments managed by Klump. Your order ships and Klump handles your repayment schedule.",
      badge: "Recommended",
      icon: <BadgeDollarSign className="w-5 h-5" />,
      accentClass: "text-accent",
      borderClass: "border-accent/60",
      bgClass: "bg-accent/5",
      available: true,
    },
    {
      id: "korapay_deposit",
      title: "Pay Deposit Only (Save to Buy)",
      subtitle: "KoraPay — Secure your item with a deposit",
      description: hasInstallmentItems
        ? `Pay deposits for your installment item(s) and full price for regular items. The remaining ${formatPrice(depositMethodBalance)} is settled later.`
        : `Convert your cart to Save to Buy. Pay a deposit now and the remaining ${formatPrice(depositMethodBalance)} is settled later.`,
      icon: <CreditCard className="w-5 h-5" />,
      accentClass: "text-purple-600 dark:text-purple-400",
      borderClass: "border-purple-500/60",
      bgClass: "bg-purple-500/5",
      available: true,
    },
  ];

  // ─── KoraPay full payment ──────────────────────────────────────
  const handleKoraPayFull = async () => {
    setLoading(true);
    try {
      await loadKorapayScript();
      const KorapayCtor = (window as any).Korapay;
      if (!KorapayCtor) throw new Error("KoraPay service unavailable. Check your connection.");

      const koraKey = import.meta.env.VITE_KORA_PUBLIC_KEY || "pk_test_PRPabwReqFtVxH472nitLVfuUbFskvZQBxsmAaiA";
      const paymentRef = `OLA_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const totalAmount = fullCartTotal + totalDeliveryFee;

      KorapayCtor.initialize({
        key: koraKey,
        reference: paymentRef,
        amount: totalAmount,
        currency: "NGN",
        customer: {
          name: user.displayName || user.email?.split("@")[0] || "Guest",
          email: user.email || "guest@example.com",
        },
        onLoad: () => {
          setLoading(false);
        },
        onSuccess: async function (response: any) {
          setLoading(true);
          toast.loading("Processing your order...", { id: "checkout" });
          
          try {
            // Save orders to Firebase AFTER successful payment
            const orderInserts = items.map((item) => ({
              user_id: user.uid,
              product_id: item.id.length === 36 ? item.id : undefined,
              product_name: item.name,
              product_price: item.price,
              payment_type: "full_payment" as const,
              deposit_amount: item.price,
              interest_rate: 0,
              total_payable: item.price * item.quantity,
              remaining_balance: 0,
              total_paid: item.price * item.quantity, // Mark as paid!
              installment_months: 0,
              status: "processing", // Instantly processing since they paid
              payment_reference: response.reference || paymentRef,
              created_at: new Date().toISOString()
            }));

            const insertResults = await Promise.all(
              orderInserts.map(async (order) => {
                const docRef = await addDoc(collection(db, "orders"), order);
                return { id: docRef.id };
              })
            );

            // Also create a payment record for completeness
            await addDoc(collection(db, "payments"), {
              order_id: insertResults[0].id,
              user_id: user.uid,
              amount: totalAmount,
              status: "success",
              payment_gateway: "korapay",
              payment_reference: response.reference || paymentRef,
              created_at: new Date().toISOString()
            });

            toast.success("Order placed successfully!", { id: "checkout" });
            navigate(`/payment/callback?reference=${response.reference || paymentRef}&status=success`);
          } catch (error) {
            console.error("Order creation error:", error);
            toast.error("Payment successful but failed to save order. Support has been notified.", { id: "checkout" });
            navigate(`/payment/callback?reference=${response.reference || paymentRef}&status=success`);
          }
        },
        onClose: function () {
          setLoading(false);
          toast.error("Payment was cancelled.");
        },
        onFailed: function () {
          setLoading(false);
          toast.error("Payment failed. Please try again.");
        },
      });
    } catch (err: any) {
      toast.error(err.message || "KoraPay payment failed to initialize. Please try again.");
      setLoading(false);
    }
  };

  // ─── KoraPay deposit payment ───────────────────────────────────
  const handleKoraPayDeposit = async () => {
    if (items.length === 0) return;
    setLoading(true);
    try {
      const totalDueNow = depositMethodDue + upfrontDeliveryFee;

      await loadKorapayScript();
      const KorapayCtor = (window as any).Korapay;
      if (!KorapayCtor) throw new Error("KoraPay service unavailable. Check your connection.");

      const koraKey = import.meta.env.VITE_KORA_PUBLIC_KEY || "pk_test_PRPabwReqFtVxH472nitLVfuUbFskvZQBxsmAaiA";
      const paymentRef = `OLA_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      KorapayCtor.initialize({
        key: koraKey,
        reference: paymentRef,
        amount: totalDueNow,
        currency: "NGN",
        customer: {
          name: user.displayName || user.email?.split("@")[0] || "Guest",
          email: user.email || "guest@example.com",
        },
        onLoad: () => {
          setLoading(false);
        },
        onSuccess: async function (response: any) {
          setLoading(true);
          toast.loading("Processing your deposit...", { id: "checkout" });

          try {
            const useMixedLogic = hasInstallmentItems;
            
            // Save orders to Firebase AFTER successful payment
            const allOrders = items.map((item) => {
              const isInstallment = useMixedLogic ? item.paymentMode === "installment" : true;
              const depAmt = isInstallment 
                ? (item.paymentMode === "installment" ? (item.depositAmount ?? item.price) : Math.round(item.price * 0.3))
                : item.price;
              const maxMonths = item.maxInstallmentMonths ?? 6;

              return {
                user_id: user.uid,
                product_id: item.id.length === 36 ? item.id : undefined,
                product_name: item.name,
                product_price: item.price,
                payment_type: (isInstallment ? "deposit" : "full_payment") as "deposit" | "full_payment",
                deposit_amount: depAmt,
                interest_rate: 0,
                total_payable: (item.price * item.quantity) + (isInstallment ? futureDeliveryFee : upfrontDeliveryFee),
                remaining_balance: ((item.price - depAmt) * item.quantity) + (isInstallment ? futureDeliveryFee : 0),
                total_paid: depAmt * item.quantity, // Mark deposit as paid!
                installment_months: isInstallment ? maxMonths : 0,
                status: "deposit_paid", // Instantly mark deposit_paid
                payment_reference: response.reference || paymentRef,
                created_at: new Date().toISOString(),
                next_payment_due: isInstallment ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
              };
            });

            const insertResults = await Promise.all(
              allOrders.map(async (order) => {
                const docRef = await addDoc(collection(db, "orders"), order);
                return { id: docRef.id };
              })
            );

            // Create payment record
            await addDoc(collection(db, "payments"), {
              order_id: insertResults[0].id,
              user_id: user.uid,
              amount: totalDueNow,
              status: "success",
              payment_gateway: "korapay",
              payment_reference: response.reference || paymentRef,
              created_at: new Date().toISOString()
            });

            toast.success("Deposit paid successfully!", { id: "checkout" });
            navigate(`/payment/callback?reference=${response.reference || paymentRef}&status=success`);
          } catch (error) {
            console.error("Order creation error:", error);
            toast.error("Payment successful but failed to save order. Support has been notified.", { id: "checkout" });
            navigate(`/payment/callback?reference=${response.reference || paymentRef}&status=success`);
          }
        },
        onClose: function () {
          setLoading(false);
          toast.error("Payment was cancelled.");
        },
        onFailed: function () {
          setLoading(false);
          toast.error("Payment failed. Please try again.");
        },
      });
    } catch (err: any) {
      toast.error(err.message || "Payment failed to initialize. Please try again.");
      setLoading(false);
    }
  };

  // ─── Klump BNPL ────────────────────────────────────────────────
  const handleKlump = async () => {
    setLoading(true);
    try {
      await loadKlumpScript();
      const KlumpCtor = (window as any).Klump;
      if (!KlumpCtor) throw new Error("Klump payment service unavailable. Check your connection.");

      new KlumpCtor({
        publicKey: import.meta.env.VITE_KLUMP_PUBLIC_KEY || "klp_pk_test_08ba948c602348a09f9f6d924c2292c3f24cc2e7b514412c8c19868305b5820b",
        data: {
          amount: fullCartTotal,
          shipping_fee: 0,
          currency: "NGN",
          redirect_url: `${window.location.origin}/payment/callback`,
          merchant_reference: `klp-${Date.now()}`,
          meta_data: {
            customer: user.displayName || user.email || "Guest",
            email: user.email || "",
          },
          items: items.map((i) => ({
            image_url: i.image || "",
            item_url: `${window.location.origin}/product/${i.id}`,
            name: i.name,
            unit_price: i.price,
            quantity: i.quantity,
          })),
        },
        onSuccess: async (data: any) => {
          setLoading(true);
          toast.loading("Processing your Klump order...", { id: "checkout" });

          try {
            const klumpRef = data?.data?.reference || `klp-${Date.now()}`;
            
            // Save orders to Firebase
            const orderInserts = items.map((item) => ({
              user_id: user.uid,
              product_id: item.id.length === 36 ? item.id : undefined,
              product_name: item.name,
              product_price: item.price,
              payment_type: "installment" as const,
              deposit_amount: Math.round(item.price * 0.25), // Klump usually does 4 payments (25% deposit)
              interest_rate: 0,
              total_payable: item.price * item.quantity,
              remaining_balance: (item.price - Math.round(item.price * 0.25)) * item.quantity,
              total_paid: Math.round(item.price * 0.25) * item.quantity,
              installment_months: 4,
              status: "deposit_paid",
              payment_reference: klumpRef,
              created_at: new Date().toISOString(),
              next_payment_due: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            }));

            const insertResults = await Promise.all(
              orderInserts.map(async (order) => {
                const docRef = await addDoc(collection(db, "orders"), order);
                return { id: docRef.id };
              })
            );

            // Create payment record
            await addDoc(collection(db, "payments"), {
              order_id: insertResults[0].id,
              user_id: user.uid,
              amount: fullCartTotal,
              status: "success",
              payment_gateway: "klump",
              payment_reference: klumpRef,
              created_at: new Date().toISOString()
            });

            toast.success("Order placed successfully via Klump!", { id: "checkout" });
            navigate(`/payment/callback?reference=${klumpRef}&status=success`);
          } catch (error) {
            console.error("Order creation error:", error);
            toast.error("Payment successful but failed to save order. Support has been notified.", { id: "checkout" });
            const klumpRef = data?.data?.reference || `klp-${Date.now()}`;
            navigate(`/payment/callback?reference=${klumpRef}&status=success`);
          }
        },
        onError: () => {
          toast.error("Klump payment failed or was declined. Please try another method.");
          setLoading(false);
        },
        onLoad: () => setLoading(false),
        onClose: () => setLoading(false),
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to load Klump. Please check your internet connection.");
      setLoading(false);
    }
  };

  // ─── Pay button handler ────────────────────────────────────────
  const handlePay = () => {
    if (!selectedMethod) {
      toast.error("Please select a payment method to continue.");
      return;
    }
    if (selectedMethod === "korapay_full") return handleKoraPayFull();
    if (selectedMethod === "klump_bnpl") return handleKlump();
    if (selectedMethod === "korapay_deposit") return handleKoraPayDeposit();
  };

  // ─── Empty cart ────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 px-4">
            <ShoppingBag className="w-16 h-16 mx-auto text-muted-foreground/40" />
            <h2 className="text-xl font-semibold text-foreground">Your cart is empty</h2>
            <p className="text-muted-foreground">Add some products before checking out.</p>
            <Link to="/shop">
              <Button className="bg-gradient-gold text-accent-foreground">Continue Shopping</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-4 lg:px-8 max-w-6xl">

          {/* Header */}
          <div className="mb-10">
            <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground mb-1">Checkout</h1>
            <p className="text-muted-foreground">Review your order and choose how you'd like to pay.</p>
          </div>

          {/* Mixed cart notice */}
          {hasMixedCart && (
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-2xl p-4 mb-8 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold mb-0.5">You have mixed cart items</p>
                <p className="text-xs opacity-90">
                  Your cart has both standard items and Save-to-Buy (deposit) items.
                  All payment methods below handle your full cart correctly. The amount shown reflects your selected method.
                </p>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-5 gap-10">

            {/* LEFT — Order Summary */}
            <div className="lg:col-span-3 space-y-6">
              <h2 className="font-display font-semibold text-lg text-foreground">Order Summary</h2>

              {/* Full payment items */}
              {fullItems.length > 0 && (
                <div>
                  {hasMixedCart && (
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Standard Items</p>
                  )}
                  <div className="space-y-3">
                    {fullItems.map((item) => (
                      <OrderItemRow key={`${item.id}-full`} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* Installment items */}
              {installmentItems.length > 0 && (
                <div>
                  {hasMixedCart && (
                    <p className="text-xs font-semibold text-accent uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <CreditCard className="w-3 h-3" /> Save to Buy Items
                    </p>
                  )}
                  <div className="space-y-3">
                    {installmentItems.map((item) => (
                      <InstallmentItemRow key={`${item.id}-inst`} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* Order totals breakdown */}
              <div className="bg-secondary/30 rounded-2xl p-5 space-y-2 text-sm border border-border/40">
                {mixedFullTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Items subtotal</span>
                    <span>{formatPrice(mixedFullTotal)}</span>
                  </div>
                )}
                {hasInstallmentItems && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Save-to-Buy subtotal</span>
                      <span>{formatPrice(installmentItems.reduce((a, i) => a + i.price * i.quantity, 0))}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground/70">
                      <span>↳ Deposits only</span>
                      <span className="text-accent">{formatPrice(mixedDepositTotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground/70">
                      <span>↳ Balances (pay later)</span>
                      <span className="text-destructive">{formatPrice(mixedBalance)}</span>
                    </div>
                  </>
                )}
                
                <div className="border-t border-border/40 my-2 pt-2 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery Fee (Immediate)</span>
                    <span>{formatPrice(upfrontDeliveryFee)}</span>
                  </div>
                  {isSplitDelivery && (
                    <div className="flex justify-between text-xs text-muted-foreground/70">
                      <span>Delivery Fee (Future Shipment)</span>
                      <span>{formatPrice(futureDeliveryFee)} <span className="text-[10px] opacity-70">(added to balance)</span></span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between font-bold text-base border-t border-border pt-3 mt-1">
                  <span>Total Due Today</span>
                  <span>{formatPrice(amountDueNow)}</span>
                </div>
              </div>

              {hasMismatchedInstallments && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-500 rounded-xl p-4 text-sm flex items-start gap-3"
                >
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>
                    <strong>Mismatched Delivery Dates:</strong> Your Save to Buy items have different payment durations. 
                    As each item is fully paid off, you can either wait for <strong>all</strong> items to be completed for a single combined delivery, 
                    or pay a separate delivery fee for each item to have them delivered individually upon completion.
                  </p>
                </motion.div>
              )}

              {isSplitDelivery && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-accent/10 border border-accent/20 text-accent-foreground rounded-xl p-4 text-sm flex items-start gap-3"
                >
                  <Info className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>
                    <strong>Split Deliveries:</strong> You have chosen to receive your fully paid standard items immediately. 
                    A separate delivery fee applies to the future shipment of your Save to Buy items.
                  </p>
                </motion.div>
              )}
            </div>

            {/* RIGHT — Payment selection */}
            <div className="lg:col-span-2">
              <div className="sticky top-24 space-y-4">
                <h2 className="font-display font-semibold text-lg text-foreground">Choose Payment Method</h2>

                <div className="space-y-3">
                  {paymentMethods.map((method) => {
                    const isSelected = selectedMethod === method.id;
                    const isDisabled = !method.available;
                    return (
                      <button
                        key={method.id}
                        onClick={() => !isDisabled && setSelectedMethod(method.id)}
                        disabled={isDisabled}
                        className={`w-full text-left rounded-2xl border-2 p-4 transition-all duration-200 ${
                          isDisabled
                            ? "opacity-40 cursor-not-allowed border-border bg-secondary/20"
                            : isSelected
                            ? `${method.borderClass} ${method.bgClass} shadow-sm`
                            : "border-border/60 bg-card hover:border-accent/40 hover:bg-secondary/30 cursor-pointer"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Radio indicator */}
                          <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                            isSelected ? `${method.borderClass} ${method.bgClass}` : "border-muted-foreground/40"
                          }`}>
                            {isSelected && <div className={`w-2.5 h-2.5 rounded-full ${method.accentClass} bg-current`} />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`${isSelected ? method.accentClass : "text-foreground"} font-semibold text-sm flex items-center gap-1.5`}>
                                {method.icon}
                                {method.title}
                              </span>
                              {method.badge && (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  method.badge === "Recommended"
                                    ? "bg-accent/20 text-accent"
                                    : "bg-green-500/20 text-green-600 dark:text-green-400"
                                }`}>
                                  {method.badge}
                                </span>
                              )}
                            </div>
                            <p className={`text-xs mt-0.5 ${isSelected ? method.accentClass : "text-muted-foreground"} opacity-80`}>
                              {method.subtitle}
                            </p>

                            <AnimatePresence>
                              {isSelected && (
                                <motion.p
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="text-xs text-muted-foreground mt-2 leading-relaxed"
                                >
                                  {method.description}
                                </motion.p>
                              )}
                            </AnimatePresence>

                            {isDisabled && method.unavailableReason && (
                              <p className="text-xs text-muted-foreground/60 mt-1 flex items-center gap-1">
                                <Info className="w-3 h-3" /> {method.unavailableReason}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Amount due summary */}
                <AnimatePresence>
                  {selectedMethod && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="bg-card border border-border rounded-2xl p-5 space-y-3 text-sm"
                    >
                      <p className="font-semibold text-foreground text-sm uppercase tracking-wider">Payment Summary</p>

                      {selectedMethod === "korapay_full" && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">You pay today</span>
                            <span className="font-bold text-lg text-foreground">{formatPrice(fullCartTotal)}</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Balance remaining after payment</span>
                            <span className="text-green-600 dark:text-green-400 font-medium">₦0.00</span>
                          </div>
                        </>
                      )}

                      {selectedMethod === "klump_bnpl" && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Total order value</span>
                            <span className="font-bold text-lg text-foreground">{formatPrice(fullCartTotal)}</span>
                          </div>
                          <div className="flex items-start gap-2 bg-accent/5 border border-accent/20 rounded-xl p-3 text-xs text-muted-foreground">
                            <Info className="w-3 h-3 mt-0.5 text-accent flex-shrink-0" />
                            <span>Klump will show your installment plan (first payment + schedule) after you click "Pay with Klump" below.</span>
                          </div>
                        </>
                      )}

                      {selectedMethod === "korapay_deposit" && (
                        <>
                          {mixedFullTotal > 0 && hasInstallmentItems && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Standard items</span>
                              <span>{formatPrice(mixedFullTotal)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Deposits (Save to Buy)</span>
                            <span>{formatPrice(depositMethodDue - (hasInstallmentItems ? mixedFullTotal : 0))}</span>
                          </div>
                          <div className="flex justify-between font-bold border-t border-border pt-2">
                            <span>You pay today</span>
                            <span className="text-purple-600 dark:text-purple-400 text-lg">{formatPrice(amountDueNow)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Balance to settle later</span>
                            <span className="text-destructive font-medium">{formatPrice(depositMethodBalance)}</span>
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Pay button */}
                <Button
                  onClick={handlePay}
                  disabled={!selectedMethod || loading}
                  className={`w-full font-semibold py-6 rounded-xl transition-all text-base whitespace-normal h-auto min-h-[3.5rem] ${
                    selectedMethod
                      ? "bg-gradient-gold text-accent-foreground hover:opacity-90 shadow-gold"
                      : "bg-secondary text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 w-5 h-5 animate-spin" />
                      Processing…
                    </>
                  ) : !selectedMethod ? (
                    "Select a payment method above"
                  ) : selectedMethod === "korapay_full" ? (
                    <>
                      <CheckCircle2 className="mr-2 w-5 h-5" />
                      Pay {formatPrice(fullCartTotal)} via KoraPay
                    </>
                  ) : selectedMethod === "klump_bnpl" ? (
                    <>
                      <BadgeDollarSign className="mr-2 w-5 h-5" />
                      Pay with Klump — Buy Now, Pay Later
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 w-5 h-5" />
                      Pay Deposit {formatPrice(amountDueNow)}
                    </>
                  )}
                </Button>

                {/* Trust badges */}
                <div className="flex items-center justify-center gap-4 pt-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                    KoraPay Secured
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                    Klump Verified
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────
const OrderItemRow = ({ item }: { item: CartItem }) => (
  <div className="flex gap-4 items-center bg-secondary/30 rounded-2xl p-4">
    <div className="w-16 h-16 bg-secondary rounded-xl p-2 flex-shrink-0">
      {item.image
        ? <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
        : <ShoppingBag className="w-full h-full text-muted-foreground/30 p-2" />
      }
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-medium text-sm text-foreground line-clamp-2">{item.name}</p>
      <p className="text-xs text-muted-foreground">{item.brand}</p>
      <p className="text-xs text-muted-foreground mt-0.5">Qty: {item.quantity}</p>
    </div>
    <span className="font-bold text-sm whitespace-nowrap">{formatPrice(item.price * item.quantity)}</span>
  </div>
);

const InstallmentItemRow = ({ item }: { item: CartItem }) => (
  <div className="bg-accent/5 border border-accent/20 rounded-2xl p-4">
    <div className="flex gap-4 items-center mb-3">
      <div className="w-16 h-16 bg-secondary rounded-xl p-2 flex-shrink-0">
        {item.image
          ? <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
          : <ShoppingBag className="w-full h-full text-muted-foreground/30 p-2" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground line-clamp-2">{item.name}</p>
        <p className="text-xs text-muted-foreground">{item.brand} · Qty: {item.quantity}</p>
        <span className="inline-block mt-1 text-[10px] font-semibold bg-accent/20 text-accent px-2 py-0.5 rounded-full">Save to Buy</span>
      </div>
    </div>
    <div className="grid grid-cols-3 gap-2 text-xs text-center">
      <div className="bg-background/60 rounded-xl p-2">
        <p className="text-muted-foreground">Full Price</p>
        <p className="font-semibold text-foreground line-through">{formatPrice(item.price)}</p>
      </div>
      <div className="bg-accent/10 rounded-xl p-2">
        <p className="text-accent">Deposit</p>
        <p className="font-bold text-accent">{formatPrice(item.depositAmount ?? item.price)}</p>
      </div>
      <div className="bg-destructive/5 rounded-xl p-2">
        <p className="text-muted-foreground">Balance</p>
        <p className="font-semibold text-destructive">{formatPrice(item.price - (item.depositAmount ?? item.price))}</p>
      </div>
    </div>
  </div>
);

export default Checkout;
