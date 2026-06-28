import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { products as staticProducts, formatPrice } from "@/data/products";
import { db } from "@/integrations/firebase/client";
import { collection, query, where, getDocs } from "firebase/firestore";
import { isProductInStock } from "@/services/inventoryService";

interface DisplayProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  original_price?: number | null;
  badge?: string | null;
  imageUrl: string;
  inStock: boolean;
}



const Shop = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const categoryParam = searchParams.get("category");
  const searchQuery = searchParams.get("search")?.toLowerCase() || "";
  const { addToCart } = useCart();

  const [products, setProducts] = useState<DisplayProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Available categories for the filter chips
  const categoriesList = ["All", "Televisions", "Refrigerators", "Air Conditioners", "Generators", "Washing Machines", "Microwaves"];

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Simple single-field query — no composite index needed
        const q = query(collection(db, "products"), where("available", "==", true));
        const snapshot = await getDocs(q);

        let fetchedProducts: DisplayProduct[] = [];
        if (!snapshot.empty) {
          fetchedProducts = snapshot.docs.map((docSnap) => {
            const p = docSnap.data();
            return {
              id: docSnap.id,
              name: p.name || "Unknown Product",
              brand: p.brand || "Olas & Bs",
              category: p.category || "Electronics",
              price: p.price,
              original_price: p.original_price ?? null,
              badge: p.badge ?? null,
              imageUrl: p.images?.[0] || p.image || "",
              inStock: isProductInStock(p as any),
              created_at: p.created_at || "",
            } as DisplayProduct;
          });

          // Sort newest first — client-side to avoid composite index
          fetchedProducts.sort((a, b) => {
            const ta = (a as any).created_at || "";
            const tb = (b as any).created_at || "";
            return tb.localeCompare(ta);
          });
        }

        // Filter by category client-side
        if (categoryParam && categoryParam !== "All") {
          fetchedProducts = fetchedProducts.filter(p => p.category === categoryParam);
        }

        // Filter by search query client-side
        if (searchQuery) {
          fetchedProducts = fetchedProducts.filter(
            p => (p.name || "").toLowerCase().includes(searchQuery) ||
                 (p.brand || "").toLowerCase().includes(searchQuery) ||
                 (p.category || "").toLowerCase().includes(searchQuery)
          );
        }

        setProducts(fetchedProducts);
      } catch (err) {
        console.error("Shop fetch error:", err);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [categoryParam, searchQuery]);

  const handleCategorySelect = (cat: string) => {
    if (cat === "All") {
      searchParams.delete("category");
    } else {
      searchParams.set("category", cat);
    }
    setSearchParams(searchParams);
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-3xl lg:text-5xl font-display font-bold text-foreground">
              {searchQuery ? `Search: ${searchQuery}` : (categoryParam && categoryParam !== "All" ? `${categoryParam} Products` : "Our Products")}
            </h1>
            <p className="text-muted-foreground mt-2">
              Premium electronics for your home
            </p>
          </motion.div>

          {/* Category Chips */}
          <div className="flex flex-wrap gap-2 mb-8">
            {categoriesList.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategorySelect(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  (categoryParam === cat) || (!categoryParam && cat === "All")
                    ? "bg-accent text-accent-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {(searchQuery || categoryParam) && (
            <div className="mb-6">
              <Link to="/shop" className="text-sm text-accent hover:underline">
                Clear Filters
              </Link>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-accent border-t-transparent rounded-full" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 bg-secondary/20 rounded-2xl">
              <h3 className="text-xl font-bold mb-2">No products found</h3>
              <p className="text-muted-foreground">Try adjusting your category or search term.</p>
              <button onClick={() => navigate("/shop")} className="mt-4 text-accent hover:underline">View all products</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
              >
                <Link to={`/product/${product.id}`} className="group block">
                  <div className="bg-card rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-300 border border-border/50">
                    <div className="relative aspect-square bg-secondary/50 p-6 overflow-hidden">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingBag className="w-20 h-20 text-muted-foreground/20" />
                        </div>
                      )}
                      <span className="absolute top-4 left-4 px-3 py-1 bg-accent text-accent-foreground text-xs font-semibold rounded-full">
                        {product.brand}
                      </span>
                      {/* Discount badge */}
                      {product.original_price && product.original_price > product.price && (
                        <span className="absolute top-4 right-4 px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                          -{Math.round(100 - (product.price / product.original_price) * 100)}% OFF
                        </span>
                      )}
                      {/* Product badge (Best Seller etc.) — only if no discount */}
                      {product.badge && !(product.original_price && product.original_price > product.price) && (
                        <span className="absolute top-4 right-4 px-2 py-0.5 bg-amber-500 text-black text-[10px] font-bold rounded-full">
                          {product.badge}
                        </span>
                      )}
                      {!product.inStock && (
                        <span className="absolute bottom-4 right-4 px-3 py-1 bg-destructive text-destructive-foreground text-xs font-semibold rounded-full">
                          Out of Stock
                        </span>
                      )}
                    </div>
                    <div className="p-5">
                      <p className="text-xs text-muted-foreground mb-1">
                        {product.category}
                      </p>
                      <h3 className="font-display font-semibold text-foreground mb-3 line-clamp-2 group-hover:text-accent transition-colors">
                        {product.name}
                      </h3>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-lg font-bold text-foreground">
                            {formatPrice(product.price)}
                          </p>
                          {product.original_price && product.original_price > product.price && (
                            <p className="text-xs text-muted-foreground line-through">{formatPrice(product.original_price)}</p>
                          )}
                          <p className="text-xs text-accent font-medium">
                            Save to Buy Available
                          </p>
                        </div>
                        <Button
                          size="icon"
                          disabled={!product.inStock}
                          onClick={(e) => {
                            e.preventDefault();
                            if (!product.inStock) return;
                            addToCart({
                              id: product.id,
                              name: product.name,
                              price: product.price,
                              image: product.imageUrl,
                              brand: product.brand,
                              paymentMode: "full",
                            });
                          }}
                          className={`rounded-full shadow-sm flex-shrink-0 ${
                            product.inStock 
                              ? "bg-accent text-accent-foreground hover:bg-accent/90" 
                              : "bg-muted text-muted-foreground cursor-not-allowed"
                          }`}
                        >
                          <ShoppingBag className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Shop;
