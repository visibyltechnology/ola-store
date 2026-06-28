import React, { createContext, useContext, useState, useEffect } from "react";
import { toast } from "sonner";

export interface CartItem {
  id: string; // product id
  name: string;
  price: number;
  image: string;
  quantity: number;
  brand: string;
  paymentMode: "full" | "installment";
  depositAmount?: number;  // only for installment
  minDeposit?: number;
  maxInstallmentMonths?: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: Omit<CartItem, "quantity">) => void;
  removeFromCart: (id: string, paymentMode: "full" | "installment") => void;
  updateQuantity: (id: string, paymentMode: "full" | "installment", quantity: number) => void;
  updateDepositAmount: (id: string, deposit: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartTotal: number;
  isCartOpen: boolean;
  setIsCartOpen: (isOpen: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem("cart");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(items));
  }, [items]);

  const addToCart = (product: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.id === product.id && item.paymentMode === product.paymentMode);
      if (existing) {
        toast.success(`Increased quantity of ${product.name}`);
        return prev.map((item) =>
          item.id === product.id && item.paymentMode === product.paymentMode
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      const label = product.paymentMode === "installment" ? "Added to cart (Installment)" : `Added ${product.name} to cart`;
      toast.success(label);
      return [...prev, { ...product, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (id: string, paymentMode: "full" | "installment") => {
    setItems((prev) => prev.filter((item) => !(item.id === id && item.paymentMode === paymentMode)));
  };

  const updateQuantity = (id: string, paymentMode: "full" | "installment", quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id, paymentMode);
      return;
    }
    setItems((prev) =>
      prev.map((item) => (item.id === id && item.paymentMode === paymentMode ? { ...item, quantity } : item))
    );
  };

  const updateDepositAmount = (id: string, deposit: number) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id && item.paymentMode === "installment" ? { ...item, depositAmount: deposit } : item))
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const cartCount = items.reduce((acc, item) => acc + item.quantity, 0);
  // For installment items, use depositAmount in the total; for full items use price
  const cartTotal = items.reduce((acc, item) => {
    const unitCost = item.paymentMode === "installment" ? (item.depositAmount ?? item.price) : item.price;
    return acc + unitCost * item.quantity;
  }, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        updateDepositAmount,
        clearCart,
        cartCount,
        cartTotal,
        isCartOpen,
        setIsCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};
