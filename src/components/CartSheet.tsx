import { useNavigate } from "react-router-dom";
import { Minus, Plus, ShoppingBag, Trash2, CreditCard } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { formatPrice } from "@/data/products";
import { ScrollArea } from "@/components/ui/scroll-area";

const CartSheet = () => {
  const {
    items,
    removeFromCart,
    updateQuantity,
    cartTotal,
    isCartOpen,
    setIsCartOpen,
  } = useCart();
  const navigate = useNavigate();

  const handleCheckout = () => {
    setIsCartOpen(false);
    navigate("/checkout");
  };

  // Separate full and installment items for totals display
  const fullItems = items.filter((i) => i.paymentMode === "full");
  const installmentItems = items.filter((i) => i.paymentMode === "installment");

  return (
    <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-6 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2 font-display">
            <ShoppingBag className="w-5 h-5" />
            Your Cart
            {items.length > 0 && (
              <span className="ml-1 bg-accent text-accent-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                {items.reduce((a, i) => a + i.quantity, 0)}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-hidden">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center">
                <ShoppingBag className="w-10 h-10 text-muted-foreground/50" />
              </div>
              <p className="text-muted-foreground">Your cart is empty</p>
              <Button
                variant="outline"
                onClick={() => {
                  setIsCartOpen(false);
                  navigate("/shop");
                }}
              >
                Continue Shopping
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4">
                {/* Full Payment Items */}
                {fullItems.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
                      Full Payment
                    </p>
                    <div className="space-y-4">
                      {fullItems.map((item) => (
                        <div key={`${item.id}-full`} className="flex gap-4 items-start bg-secondary/30 rounded-xl p-3">
                          <div className="w-16 h-16 bg-secondary rounded-xl p-2 flex-shrink-0">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                            ) : (
                              <ShoppingBag className="w-full h-full text-muted-foreground/30 p-2" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-display font-medium text-sm text-foreground line-clamp-2">{item.name}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5 mb-2">{item.brand}</p>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm">{formatPrice(item.price)}</span>
                              <div className="flex items-center gap-1 bg-background rounded-lg p-1 border border-border/50">
                                <button
                                  onClick={() => updateQuantity(item.id, item.paymentMode, item.quantity - 1)}
                                  className="p-1 hover:bg-secondary rounded-md transition-colors"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-xs font-medium w-5 text-center">{item.quantity}</span>
                                <button
                                  onClick={() => updateQuantity(item.id, item.paymentMode, item.quantity + 1)}
                                  className="p-1 hover:bg-secondary rounded-md transition-colors"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.id, item.paymentMode)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1 mt-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Installment Items */}
                {installmentItems.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1 flex items-center gap-1.5">
                      <CreditCard className="w-3 h-3 text-accent" />
                      Save to Buy (Klump)
                    </p>
                    <div className="space-y-4">
                      {installmentItems.map((item) => (
                        <div key={`${item.id}-installment`} className="flex gap-4 items-start bg-accent/5 border border-accent/20 rounded-xl p-3">
                          <div className="w-16 h-16 bg-secondary rounded-xl p-2 flex-shrink-0">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                            ) : (
                              <ShoppingBag className="w-full h-full text-muted-foreground/30 p-2" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-display font-medium text-sm text-foreground line-clamp-2">{item.name}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.brand}</p>
                            <div className="mt-1.5 space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Full Price</span>
                                <span className="line-through text-muted-foreground">{formatPrice(item.price)}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-accent font-medium">Deposit Now</span>
                                <span className="text-accent font-semibold">{formatPrice(item.depositAmount ?? item.price)}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Balance</span>
                                <span className="text-destructive font-medium">{formatPrice(item.price - (item.depositAmount ?? item.price))}</span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.id, item.paymentMode)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1 mt-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-6 border-t border-border/50 bg-background/50 backdrop-blur-md">
            <div className="space-y-1.5 mb-4">
              {fullItems.length > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Full payment subtotal</span>
                  <span className="font-medium">{formatPrice(fullItems.reduce((a, i) => a + i.price * i.quantity, 0))}</span>
                </div>
              )}
              {installmentItems.length > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Deposits subtotal</span>
                  <span className="font-medium text-accent">{formatPrice(installmentItems.reduce((a, i) => a + (i.depositAmount ?? i.price) * i.quantity, 0))}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <span className="font-semibold">Total Due Now</span>
                <span className="text-xl font-display font-bold">{formatPrice(cartTotal)}</span>
              </div>
            </div>
            <Button
              className="w-full bg-gradient-gold text-accent-foreground font-semibold py-6 rounded-xl hover:opacity-90 shadow-gold"
              onClick={handleCheckout}
            >
              Proceed to Checkout
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default CartSheet;
