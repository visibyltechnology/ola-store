import { db } from "@/integrations/firebase/client";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { generateDeliveryOTP } from "./otpService";
import {
  createTrackingUpdateNotification,
  createOrderOTPNotification,
} from "./notificationService";

// ─── Order Status Constants ───────────────────────────────────────────────────
export const ORDER_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  SHIPPED: "shipped",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a unique delivery token for rider portal links */
export const generateDeliveryToken = (orderId: string): string => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 11);
  return `${orderId.substring(0, 8)}_${timestamp}_${randomStr}`;
};

// ─── Order Status Updates ─────────────────────────────────────────────────────

/**
 * Update an order's tracking status and append to status_history.
 * Calls the Supabase RPC for atomic append.
 * Also creates a user notification for the status change.
 */
export const updateOrderStatus = async (
  orderId: string,
  newStatus: OrderStatus,
  notes = ""
): Promise<void> => {
  const validStatuses = Object.values(ORDER_STATUS);
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid order status: ${newStatus}`);
  }

  // Use Firestore arrayUnion to append history
  const orderRef = doc(db, "orders", orderId);
  try {
    await updateDoc(orderRef, {
      status: newStatus,
      tracking_status: newStatus,
      updated_at: new Date().toISOString(),
      status_history: arrayUnion({
        status: newStatus,
        notes,
        created_at: new Date().toISOString()
      })
    });
  } catch (error) {
    throw new Error("Failed to update order status: " + (error as Error).message);
  }

  // Non-blocking: notify the user
  try {
    const orderSnap = await getDoc(orderRef);
    const orderData = orderSnap.data();
    if (orderData?.user_id) {
      await createTrackingUpdateNotification(orderData.user_id, orderId, newStatus, notes);
    }
  } catch (notifErr) {
    console.error("[orderTrackingService] notification error:", notifErr);
  }
};

/**
 * Ship an order: advance status to SHIPPED, generate delivery OTP,
 * store the delivery token, and notify the customer.
 */
export const shipOrder = async (
  orderId: string,
  deliveryEmail: string
): Promise<string> => {
  // Generate delivery OTP (stored securely via edge function)
  const otp = await generateDeliveryOTP(orderId, deliveryEmail);
  const token = generateDeliveryToken(orderId);

  const orderRef = doc(db, "orders", orderId);
  try {
    // Update order with ship status + token and append history
    await updateDoc(orderRef, {
      tracking_status: ORDER_STATUS.SHIPPED,
      status: ORDER_STATUS.SHIPPED,
      delivery_token: token,
      updated_at: new Date().toISOString(),
      status_history: arrayUnion({
        status: ORDER_STATUS.SHIPPED,
        notes: `Order shipped. Delivery OTP sent to ${deliveryEmail}`,
        created_at: new Date().toISOString()
      })
    });
  } catch (error) {
    throw new Error("Failed to ship order: " + (error as Error).message);
  }

  // Notify user with OTP
  try {
    const orderSnap = await getDoc(orderRef);
    const orderData = orderSnap.data();
    if (orderData?.user_id) {
      await createOrderOTPNotification(orderData.user_id, orderId, otp);
    }
  } catch (notifErr) {
    console.error("[orderTrackingService] OTP notification error:", notifErr);
  }

  return otp;
};

/**
 * Confirm delivery and upload proof image.
 * Advances status to DELIVERED.
 */
export const confirmDelivery = async (
  orderId: string,
  proofUrl: string | null,
  confirmedBy: string
): Promise<void> => {
  const orderRef = doc(db, "orders", orderId);
  try {
    await updateDoc(orderRef, {
      tracking_status: ORDER_STATUS.DELIVERED,
      proof_of_delivery_url: proofUrl,
      delivery_confirmed_at: new Date().toISOString(),
      delivery_confirmed_by: confirmedBy,
      status: ORDER_STATUS.DELIVERED,
      updated_at: new Date().toISOString(),
      status_history: arrayUnion({
        status: ORDER_STATUS.DELIVERED,
        notes: "Delivery confirmed",
        created_at: new Date().toISOString()
      })
    });
  } catch (error) {
    throw new Error("Failed to confirm delivery: " + (error as Error).message);
  }
};

/**
 * Fetch an order with full tracking info (status_history included).
 */
export const getOrderTracking = async (orderId: string) => {
  const orderRef = doc(db, "orders", orderId);
  const orderSnap = await getDoc(orderRef);
  
  if (!orderSnap.exists()) throw new Error("Order not found");
  return { id: orderSnap.id, ...orderSnap.data() };
};

/**
 * Validate a delivery token for the rider portal.
 */
export const validateDeliveryToken = async (
  orderId: string,
  token: string
): Promise<boolean> => {
  const orderRef = doc(db, "orders", orderId);
  const orderSnap = await getDoc(orderRef);
  const data = orderSnap.data();

  return data?.delivery_token === token && data?.tracking_status === ORDER_STATUS.SHIPPED;
};

export default {
  ORDER_STATUS,
  generateDeliveryToken,
  updateOrderStatus,
  shipOrder,
  confirmDelivery,
  getOrderTracking,
  validateDeliveryToken,
};
