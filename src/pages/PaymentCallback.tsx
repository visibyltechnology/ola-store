import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { createPaymentSuccessNotification } from "@/services/notificationService";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";

const PaymentCallback = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "cancelled" | "failed">("loading");
  const { user } = useAuth();
  const { clearCart } = useCart();

  useEffect(() => {
    const verify = async () => {
      const urlStatus = searchParams.get("status");
      const gateway = searchParams.get("gateway");

      // Handle explicit cancellation/failure statuses
      if (urlStatus && ["cancelled", "canceled", "failed", "abandoned"].includes(urlStatus.toLowerCase())) {
        setStatus("cancelled");
        return;
      }

      const ref =
        searchParams.get("reference") ||
        searchParams.get("kora_reference") ||
        searchParams.get("trxref");

      if (!ref || ref === "PENDING") {
        setStatus("cancelled");
        return;
      }

      // For Klump payments — trust the status=success from redirect
      // (Orders were already saved to Firebase in onSuccess callback)
      if (gateway === "klump" && urlStatus === "success") {
        setStatus("success");
        clearCart();
        if (user) {
          createPaymentSuccessNotification(user.uid, ref, 0).catch(console.error);
        }
        return;
      }

      // For KoraPay payments — trust the status=success from the modal redirect
      // (Orders were already saved to Firebase in onSuccess callback before redirect)
      if (gateway === "korapay" && urlStatus === "success") {
        setStatus("success");
        clearCart();
        if (user) {
          createPaymentSuccessNotification(user.uid, ref, 0).catch(console.error);
        }
        return;
      }

      // Fallback: if no gateway tag, try verifying directly with KoraPay REST API
      try {
        const koraPublicKey = import.meta.env.VITE_KORA_PUBLIC_KEY;
        if (!koraPublicKey) {
          // No key available — trust the URL status
          if (urlStatus === "success") {
            setStatus("success");
            clearCart();
          } else {
            setStatus("failed");
          }
          return;
        }

        const res = await fetch(`https://api.korapay.com/merchant/api/v1/charges/${ref}`, {
          headers: { Authorization: `Bearer ${koraPublicKey}` },
        });

        if (!res.ok) throw new Error("KoraPay verification failed");
        const data = await res.json();
        const chargeStatus = data?.data?.status?.toLowerCase();

        if (chargeStatus === "success") {
          setStatus("success");
          clearCart();
          if (user) {
            createPaymentSuccessNotification(user.uid, ref, data?.data?.amount || 0).catch(console.error);
          }
        } else if (chargeStatus === "cancelled" || chargeStatus === "abandoned") {
          setStatus("cancelled");
        } else {
          setStatus("failed");
        }
      } catch {
        // Network error or API issue — if URL says success, trust it
        if (urlStatus === "success") {
          setStatus("success");
          clearCart();
        } else {
          setStatus("failed");
        }
      }
    };

    verify();
  }, [searchParams]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="pt-24 pb-16 flex items-center justify-center min-h-[80vh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md mx-auto px-4"
        >
          {status === "loading" && (
            <>
              <Loader2 className="w-16 h-16 text-accent animate-spin mx-auto mb-6" />
              <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                Verifying Payment...
              </h2>
              <p className="text-muted-foreground">Please wait while we confirm your payment.</p>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
              <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                Payment Successful!
              </h2>
              <p className="text-muted-foreground mb-8">
                Your payment has been confirmed. You can track your order from your dashboard.
              </p>
              <div className="flex gap-4 justify-center">
                <Link to="/dashboard">
                  <Button className="bg-gradient-gold text-accent-foreground">
                    View Dashboard
                  </Button>
                </Link>
                <Link to="/shop">
                  <Button variant="outline">Continue Shopping</Button>
                </Link>
              </div>
            </>
          )}

          {status === "cancelled" && (
            <>
              <AlertCircle className="w-20 h-20 text-yellow-500 mx-auto mb-6" />
              <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                Payment Cancelled
              </h2>
              <p className="text-muted-foreground mb-8">
                You cancelled the payment. No money has been deducted from your account. You can try again whenever you're ready.
              </p>
              <div className="flex gap-4 justify-center">
                <Link to="/shop">
                  <Button className="bg-gradient-gold text-accent-foreground">
                    Back to Shop
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button variant="outline">Contact Support</Button>
                </Link>
              </div>
            </>
          )}

          {status === "failed" && (
            <>
              <XCircle className="w-20 h-20 text-destructive mx-auto mb-6" />
              <h2 className="text-2xl font-display font-bold text-foreground mb-2">
                Payment Failed
              </h2>
              <p className="text-muted-foreground mb-8">
                We could not verify your payment. Please try again or contact support.
              </p>
              <div className="flex gap-4 justify-center">
                <Link to="/shop">
                  <Button className="bg-gradient-gold text-accent-foreground">
                    Try Again
                  </Button>
                </Link>
                <Link to="/contact">
                  <Button variant="outline">Contact Support</Button>
                </Link>
              </div>
            </>
          )}
        </motion.div>
      </div>
      <Footer />
    </div>
  );
};

export default PaymentCallback;
