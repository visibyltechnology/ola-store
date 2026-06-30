import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ShoppingBag, CreditCard, Check, Loader2, ShoppingCart, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { products as staticProducts, formatPrice, calculateInstallment } from "@/data/products";
import { Slider } from "@/components/ui/slider";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/integrations/firebase/client";
import { doc, getDoc } from "firebase/firestore";
import { toast } from "sonner";
import { isProductInStock } from "@/services/inventoryService";

interface ProductData {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  description: string;
  image: string;
  features: string[];
  minDeposit: number;
  maxInstallmentMonths: number;
  inStock: boolean;
}

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart, items } = useCart();
  const { user } = useAuth();
  const [product, setProduct] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState(0);

  // Check if this product is already in cart
  const inCartFull = items.some((i) => i.id === (id ?? "") && i.paymentMode === "full");
  const inCartInstallment = items.some((i) => i.id === (id ?? "") && i.paymentMode === "installment");

  useEffect(() => {
    const load = async () => {
      // First check static products (IDs: "1","2","3","4")
      const staticMatch = staticProducts.find((p) => p.id === id);
      if (staticMatch) {
        setProduct({
          id: staticMatch.id,
          name: staticMatch.name,
          brand: staticMatch.brand,
          category: staticMatch.category,
          price: staticMatch.price,
          description: staticMatch.description,
          image: staticMatch.image,
          features: staticMatch.features,
          minDeposit: staticMatch.minDeposit,
          maxInstallmentMonths: staticMatch.maxInstallmentMonths,
          inStock: true,
        });
        setDepositAmount(staticMatch.minDeposit);
        setLoading(false);
        return;
      }

      // Otherwise fetch from Firestore by UUID (admin-added products)
      if (id) {
        try {
          const docRef = doc(db, "products", id);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            const minDep = data.min_deposit || Math.round(data.price * 0.2);
            setProduct({
              id: docSnap.id,
              name: data.name,
              brand: data.brand || "Olas & Bs",
              category: data.category || "Electronics",
              price: data.price,
              description: data.description || "",
              image: data.images?.[0] || "",
              features: data.features || [],
              minDeposit: minDep,
              maxInstallmentMonths: data.max_installment_months || 6,
              inStock: isProductInStock(data as any),
            });
            setDepositAmount(minDep);
          }
        } catch (error) {
          console.error("Error fetching product:", error);
        }
      }
      setLoading(false);
    };
    load();
  }, [id]);

  const installment = product ? calculateInstallment(product.price, depositAmount) : null;

  const handleAddToCart = () => {
    if (!product) return;
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      brand: product.brand,
      paymentMode: "full",
    });
  };

  const handleAddInstallmentToCart = () => {
    if (!product) return;
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      brand: product.brand,
      paymentMode: "installment",
      depositAmount: depositAmount,
      minDeposit: product.minDeposit,
      maxInstallmentMonths: product.maxInstallmentMonths,
    });
  };

  const handleBuyNow = () => {
    if (!product) return;
    if (!inCartFull) {
      addToCart({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        brand: product.brand,
        paymentMode: "full",
      });
    }
    navigate("/checkout");
  };

  const handlePayDepositNow = () => {
    if (!product) return;
    if (!inCartInstallment) {
      addToCart({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        brand: product.brand,
        paymentMode: "installment",
        depositAmount: depositAmount,
        minDeposit: product.minDeposit,
        maxInstallmentMonths: product.maxInstallmentMonths,
      });
    }
    navigate("/checkout");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <ShoppingBag className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
          <h2 className="text-2xl font-display font-bold text-foreground mb-2">Product not found</h2>
          <p className="text-muted-foreground mb-6">This product may have been removed or is no longer available.</p>
          <Link to="/shop">
            <Button className="bg-gradient-gold text-accent-foreground">Back to Shop</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 lg:px-8">
          <Link to="/shop" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Shop
          </Link>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Image */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              className="relative bg-secondary/50 rounded-3xl p-8 lg:p-12 aspect-square flex items-center justify-center"
            >
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.name}
                  className="max-w-full max-h-full object-contain"
                  width={800}
                  height={800}
                />
              ) : (
                <ShoppingBag className="w-32 h-32 text-muted-foreground/30" />
              )}
              {!product.inStock && (
                <div className="absolute top-8 right-8 px-4 py-2 bg-destructive text-destructive-foreground text-sm font-bold rounded-full shadow-lg">
                  Out of Stock
                </div>
              )}
            </motion.div>

            {/* Details */}
            <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}>
              <span className="inline-block px-3 py-1 bg-accent/10 text-accent text-sm font-medium rounded-full mb-4">
                {product.brand}
              </span>
              <h1 className="text-3xl lg:text-4xl font-display font-bold text-foreground mb-4">
                {product.name}
              </h1>
              {product.description && (
                <p className="text-muted-foreground mb-6">{product.description}</p>
              )}

              {/* Features */}
              {product.features.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-8">
                  {product.features.map((feat) => (
                    <span key={feat} className="flex items-center gap-1 px-3 py-1.5 bg-secondary rounded-full text-xs font-medium text-foreground">
                      <Check className="w-3 h-3 text-accent" />
                      {feat}
                    </span>
                  ))}
                </div>
              )}

              <div className="text-3xl font-display font-bold text-foreground mb-8">
                {formatPrice(product.price)}
              </div>

              {/* Purchase Options */}
              <div className="space-y-4 mb-8">

                {/* Add to Cart — Full Purchase */}
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      onClick={handleAddToCart}
                      disabled={!product.inStock}
                      variant="outline"
                      className="flex-1 border-accent text-accent hover:bg-accent hover:text-accent-foreground py-6 rounded-xl disabled:opacity-50"
                    >
                      <ShoppingCart className="mr-2 w-5 h-5" />
                      {inCartFull ? "In Cart ✓" : "Add to Cart"}
                    </Button>
                    <Button
                      onClick={handleBuyNow}
                      disabled={!product.inStock}
                      className="flex-1 bg-gradient-gold text-accent-foreground font-semibold py-6 rounded-xl hover:opacity-90 shadow-gold disabled:opacity-50 disabled:shadow-none whitespace-normal h-auto min-h-[3rem]"
                    >
                      <Zap className="mr-2 w-5 h-5 flex-shrink-0" />
                      <span>Buy Now – {formatPrice(product.price)}</span>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center px-2">
                    Want it now but pay later? Choose <strong>Klump</strong> at checkout to split this into 4 payments and get your item immediately!
                  </p>
                </div>

                {/* Installment Panel */}
                <div className="bg-card border border-border rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard className="w-5 h-5 text-accent" />
                    <h3 className="font-display font-semibold text-foreground">Save to Buy (Layaway)</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    Pay a deposit today to lock in the price. Pay the rest at your own pace. Your item ships once fully paid.
                  </p>

                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Deposit Amount</span>
                      <span className="font-semibold text-foreground">{formatPrice(depositAmount)}</span>
                    </div>
                    <Slider
                      value={[depositAmount]}
                      onValueChange={([val]) => setDepositAmount(val)}
                      min={product.minDeposit}
                      max={product.price}
                      step={5000}
                      className="mb-4"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Min: {formatPrice(product.minDeposit)}</span>
                      <span>Full: {formatPrice(product.price)}</span>
                    </div>
                  </div>

                  {installment && (
                    <div className="bg-secondary/50 rounded-xl p-4 space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Product Price</span>
                        <span className="text-foreground">{formatPrice(product.price)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold border-t border-border pt-2">
                        <span className="text-foreground">Total Payable</span>
                        <span className="text-foreground">{formatPrice(installment.totalPayable)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Your Deposit</span>
                        <span className="text-accent font-medium">{formatPrice(depositAmount)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold">
                        <span className="text-foreground">Remaining Balance</span>
                        <span className="text-destructive">{formatPrice(installment.balance)}</span>
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={handleAddInstallmentToCart}
                    disabled={!product.inStock}
                    variant="outline"
                    className="w-full border-border text-foreground hover:bg-secondary py-4 rounded-xl mb-2 disabled:opacity-50 whitespace-normal h-auto min-h-[3rem]"
                  >
                    <ShoppingCart className="mr-2 w-4 h-4 flex-shrink-0" />
                    <span>{inCartInstallment ? "Deposit in Cart ✓" : `Add Deposit to Cart – ${formatPrice(depositAmount)}`}</span>
                  </Button>
                  <Button
                    onClick={handlePayDepositNow}
                    disabled={!product.inStock}
                    className="w-full bg-gradient-gold text-accent-foreground font-semibold py-5 rounded-xl hover:opacity-90 shadow-gold disabled:opacity-50 disabled:shadow-none whitespace-normal h-auto min-h-[3rem]"
                  >
                    <CreditCard className="mr-2 w-5 h-5 flex-shrink-0" />
                    <span>Checkout Deposit – {formatPrice(depositAmount)}</span>
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ProductDetail;
