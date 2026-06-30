import { db } from "@/integrations/firebase/client";
import { doc, getDoc, updateDoc, increment, runTransaction } from "firebase/firestore";

// ─── Inventory Status Constants ───────────────────────────────────────────────
export const INVENTORY_STATUS = {
  IN_STOCK: "in_stock",
  OUT_OF_STOCK: "out_of_stock",
  DISCONTINUED: "discontinued",
} as const;

export type InventoryStatus = typeof INVENTORY_STATUS[keyof typeof INVENTORY_STATUS];

export interface ProductInventory {
  id: string;
  stock_count: number;
  unlimited_stock: boolean;
  inventory_status: InventoryStatus | string;
  available: boolean;
  name?: string;
}

// ─── Pure Helpers (no DB calls) ───────────────────────────────────────────────

/**
 * Check if a product is in stock given its inventory fields.
 * Safe to call with partial product objects (defaults to in-stock if fields missing).
 */
export const isProductInStock = (product: Partial<ProductInventory>): boolean => {
  const status = product?.inventory_status ?? INVENTORY_STATUS.IN_STOCK;
  const unlimited = product?.unlimited_stock ?? true;
  const itemsLeft = product?.stock_count ?? 1;
  const available = product?.available ?? true;

  return (
    available &&
    status === INVENTORY_STATUS.IN_STOCK &&
    (unlimited || itemsLeft > 0)
  );
};

/**
 * Get a human-readable stock status string.
 * Examples: "In Stock", "In Stock (3)", "Out of Stock"
 */
export const getStockDisplayText = (product: Partial<ProductInventory>): string => {
  if (!isProductInStock(product)) return "Out of Stock";
  if (product?.unlimited_stock) return "In Stock";
  const count = product?.stock_count ?? 0;
  if (count <= 5 && count > 0) return `Only ${count} left!`;
  return `In Stock (${count})`;
};

/**
 * Check if a product is available for purchase (not hidden, not discontinued).
 */
export const isProductAvailable = (product: Partial<ProductInventory>): boolean =>
  product?.available !== false &&
  product?.inventory_status !== INVENTORY_STATUS.DISCONTINUED;

// ─── Firebase DB Operations ───────────────────────────────────────────────────

/**
 * Atomically decrease stock via Firebase Firestore transaction.
 * Throws if insufficient stock (prevents race conditions).
 */
export const decreaseInventory = async (
  productId: string,
  quantity = 1
): Promise<void> => {
  // Only applies to DB products (UUIDs), not static products
  if (!productId || productId.length < 10) return;

  const productRef = doc(db, "products", productId);
  try {
    await runTransaction(db, async (transaction) => {
      const pDoc = await transaction.get(productRef);
      if (!pDoc.exists()) throw new Error("Product not found");
      const data = pDoc.data();
      if (data.unlimited_stock) return; // do nothing
      if (data.stock_count < quantity) throw new Error("Insufficient stock. Please contact us.");
      transaction.update(productRef, { stock_count: increment(-quantity) });
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Insufficient stock")) {
      throw error;
    }
    console.warn("[inventoryService] decrement_stock:", error);
  }
};

/**
 * Increase stock (e.g. when an order is cancelled).
 */
export const increaseInventory = async (
  productId: string,
  quantity = 1
): Promise<void> => {
  if (!productId || productId.length < 10) return;

  const productRef = doc(db, "products", productId);
  try {
    await runTransaction(db, async (transaction) => {
      const pDoc = await transaction.get(productRef);
      if (!pDoc.exists()) return;
      if (pDoc.data().unlimited_stock) return;
      transaction.update(productRef, { stock_count: increment(quantity) });
    });
  } catch (error) {
    console.warn("[inventoryService] increment_stock:", error);
  }
};

/**
 * Directly set stock count and status for a product (admin use).
 */
export const setInventory = async (
  productId: string,
  stockCount: number,
  unlimitedStock = false
): Promise<void> => {
  const inventoryStatus =
    !unlimitedStock && stockCount <= 0
      ? INVENTORY_STATUS.OUT_OF_STOCK
      : INVENTORY_STATUS.IN_STOCK;

  try {
    const productRef = doc(db, "products", productId);
    await updateDoc(productRef, {
      stock_count: stockCount,
      unlimited_stock: unlimitedStock,
      inventory_status: inventoryStatus,
    });
  } catch (error) {
    throw new Error("Failed to update inventory: " + (error as Error).message);
  }
};

/**
 * Fetch inventory info for a product.
 */
export const getProductInventory = async (
  productId: string
): Promise<ProductInventory | null> => {
  try {
    const productRef = doc(db, "products", productId);
    const snap = await getDoc(productRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as ProductInventory;
  } catch (error) {
    return null;
  }
};

export default {
  INVENTORY_STATUS,
  isProductInStock,
  isProductAvailable,
  getStockDisplayText,
  decreaseInventory,
  increaseInventory,
  setInventory,
  getProductInventory,
};
