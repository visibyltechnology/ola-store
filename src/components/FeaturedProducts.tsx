import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/data/products";
import { db } from "@/integrations/firebase/client";
import { collection, query, where, getDocs } from "firebase/firestore";
import { isProductInStock } from "@/services/inventoryService";

interface DBProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  original_price?: number | null;
  badge?: string | null;
  images: string[] | null;
  available: boolean;
  inventory_status?: string;
  unlimited_stock?: boolean;
  stock_count?: number;
  created_at?: any;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 80, scale: 0.9 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.7, ease: [0.215, 0.61, 0.355, 1] as const },
  },
};

const BADGE_COLORS: Record<string, string> = {
  "Best Seller": "bg-amber-500 text-black",
  "New Arrival": "bg-green-500 text-white",
  "Hot Deal": "bg-red-500 text-white",
  "Top Rated": "bg-blue-500 text-white",
  "Trending": "bg-purple-500 text-white",
  "Clearance": "bg-orange-500 text-white",
  "Premium": "bg-yellow-600 text-white",
  "Limited": "bg-rose-600 text-white",
};

const SkeletonCard = () => (
  <div className="bg-card rounded-2xl overflow-hidden border border-border/50 animate-pulse">
    <div className="aspect-square bg-secondary/60" />
    <div className="p-5 space-y-3">
      <div className="h-3 bg-secondary rounded w-1/3" />
      <div className="h-4 bg-secondary rounded w-3/4" />
      <div className="h-4 bg-secondary rounded w-1/2" />
      <div className="flex justify-between items-center pt-1">
        <div className="h-5 bg-secondary rounded w-1/4" />
        <div className="h-8 w-8 bg-secondary rounded-full" />
      </div>
    </div>
  </div>
);

const FeaturedProducts = () => {
  const [products, setProducts] = useState<DBProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const q = query(
          collection(db, "products"),
          where("available", "==", true)
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const docs = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as DBProduct[];
          // Sort locally to avoid Firebase composite index requirement
          docs.sort((a, b) => {
            const timeA = a.created_at?.toMillis ? a.created_at.toMillis() : 0;
            const timeB = b.created_at?.toMillis ? b.created_at.toMillis() : 0;
            return timeB - timeA;
          });
          setProducts(docs.slice(0, 4));
        }
        // If empty — show nothing, not placeholders
      } catch (err) {
        console.warn("Failed to fetch featured products:", err);
        // On error/offline — show nothing, not placeholders
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  // Show skeleton while loading
  if (loading) {
    return (
      <section className="py-20 lg:py-28 bg-background overflow-hidden">
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-end justify-between mb-12">
            <div>
              <div className="h-4 w-20 bg-secondary rounded animate-pulse mb-3" />
              <div className="h-8 w-48 bg-secondary rounded animate-pulse" />
              <div className="h-1 w-16 bg-secondary rounded-full mt-3 animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
      </section>
    );
  }

  // Show nothing if no real products found
  if (products.length === 0) return null;

  return (
    <section className="py-20 lg:py-28 bg-background overflow-hidden">
      <div className="container mx-auto px-4 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="flex items-end justify-between mb-12"
        >
          <div>
            <span className="text-sm font-medium text-accent uppercase tracking-wider">Featured</span>
            <h2 className="text-3xl lg:text-4xl font-display font-bold text-foreground mt-2">
              Popular Products
            </h2>
            <motion.div
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="h-1 w-16 bg-gradient-gold rounded-full mt-3 origin-left"
            />
          </div>
          <Link to="/shop" className="hidden sm:flex items-center gap-2 text-accent font-medium group">
            <span>View All</span>
            <motion.div animate={{ x: [0, 5, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
              <ArrowRight className="w-4 h-4" />
            </motion.div>
          </Link>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6"
        >
          {products.map((product) => {
            const hasDiscount = product.original_price && product.original_price > product.price;
            const discountPct = hasDiscount
              ? Math.round(100 - (product.price / product.original_price!) * 100)
              : 0;
            const badgeColor = product.badge ? (BADGE_COLORS[product.badge] ?? "bg-accent text-accent-foreground") : null;

            return (
              <motion.div key={product.id} variants={cardVariants}>
                <Link to={`/product/${product.id}`} className="group block">
                  <motion.div
                    whileHover={{ y: -8 }}
                    transition={{ duration: 0.3 }}
                    className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300 border border-border/50 hover:border-accent/30"
                  >
                    <div className="relative aspect-square bg-secondary/50 p-6 overflow-hidden">
                      <motion.img
                        src={product.images?.[0] || ""}
                        alt={product.name}
                        className="w-full h-full object-contain"
                        whileHover={{ scale: 1.1, rotate: 2 }}
                        transition={{ duration: 0.5 }}
                        loading="lazy"
                        width={800}
                        height={800}
                      />
                      {/* Brand pill */}
                      <motion.span
                        initial={{ x: -60, opacity: 0 }}
                        whileInView={{ x: 0, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.3 }}
                        className="absolute top-4 left-4 px-3 py-1 bg-accent text-accent-foreground text-xs font-semibold rounded-full"
                      >
                        {product.brand}
                      </motion.span>

                      {/* Discount badge */}
                      {hasDiscount && (
                        <span className="absolute top-4 right-4 px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                          -{discountPct}% OFF
                        </span>
                      )}

                      {/* Product badge (Best Seller etc.) — only shown if no discount */}
                      {product.badge && badgeColor && !hasDiscount && (
                        <span className={`absolute top-4 right-4 px-2 py-0.5 text-[10px] font-bold rounded-full ${badgeColor}`}>
                          {product.badge}
                        </span>
                      )}

                      {/* Out of stock overlay */}
                      {!isProductInStock(product as any) && (
                        <span className="absolute bottom-4 right-4 px-3 py-1 bg-destructive text-destructive-foreground text-xs font-semibold rounded-full">
                          Out of Stock
                        </span>
                      )}
                    </div>
                    <div className="p-5">
                      <p className="text-xs text-muted-foreground mb-1">{product.category}</p>
                      <h3 className="font-display font-semibold text-foreground mb-3 line-clamp-2 group-hover:text-accent transition-colors">
                        {product.name}
                      </h3>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-lg font-bold text-foreground">{formatPrice(product.price)}</p>
                          {hasDiscount && (
                            <p className="text-xs text-muted-foreground line-through">{formatPrice(product.original_price!)}</p>
                          )}
                          <p className="text-xs text-accent font-medium">Save to Buy Available</p>
                        </div>
                        <motion.div
                          whileHover={isProductInStock(product as any) ? { scale: 1.2, rotate: 15 } : {}}
                          whileTap={isProductInStock(product as any) ? { scale: 0.9 } : {}}
                        >
                          <Button
                            size="icon"
                            disabled={!isProductInStock(product as any)}
                            className={`rounded-full shadow-sm flex-shrink-0 ${
                              isProductInStock(product as any)
                                ? "bg-accent text-accent-foreground hover:bg-accent/90"
                                : "bg-muted text-muted-foreground cursor-not-allowed"
                            }`}
                          >
                            <ShoppingBag className="w-4 h-4" />
                          </Button>
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        <div className="sm:hidden mt-8 text-center">
          <Link to="/shop">
            <Button variant="outline" className="border-accent text-accent">
              View All Products <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
