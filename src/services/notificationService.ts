import { db } from "@/integrations/firebase/client";
import { collection, query, where, orderBy, limit as firestoreLimit, addDoc, updateDoc, doc, getDocs, getCountFromServer, onSnapshot } from "firebase/firestore";

// ─── Notification Types ───────────────────────────────────────────────────────
export const NOTIFICATION_TYPES = {
  PAYMENT_SUCCESS: "PAYMENT_SUCCESS",
  ORDER_OTP: "ORDER_OTP",
  TRACKING_UPDATE: "TRACKING_UPDATE",
  ORDER_PLACED: "ORDER_PLACED",
  GENERAL: "GENERAL",
  STOCK_ALERT: "STOCK_ALERT",
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType | string;
  title: string;
  message: string;
  status: "read" | "unread";
  metadata: Record<string, unknown>;
  is_deleted: boolean;
  read_at: string | null;
  created_at: string;
}

// ─── Core CRUD ────────────────────────────────────────────────────────────────

/**
 * Create an in-app notification.
 * Can be called from client for logged-in user's own notifications.
 */
export const createNotification = async (
  userId: string,
  type: string,
  data: { title: string; message: string; metadata?: Record<string, unknown> }
): Promise<string | null> => {
  try {
    const docRef = await addDoc(collection(db, "notifications"), {
      user_id: userId,
      type,
      title: data.title,
      message: data.message,
      metadata: data.metadata ?? {},
      status: "unread",
      is_deleted: false,
      created_at: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error) {
    console.error("[notificationService] createNotification error:", error);
    return null;
  }
};

/** Mark a single notification as read */
export const markAsRead = async (notificationId: string): Promise<void> => {
  const docRef = doc(db, "notifications", notificationId);
  await updateDoc(docRef, { status: "read", read_at: new Date().toISOString() });
};

/** Mark ALL of a user's notifications as read */
export const markAllAsRead = async (userId: string): Promise<void> => {
  const q = query(
    collection(db, "notifications"),
    where("user_id", "==", userId),
    where("status", "==", "unread")
  );
  const snapshot = await getDocs(q);
  const updatePromises = snapshot.docs.map(docSnap => 
    updateDoc(docSnap.ref, { status: "read", read_at: new Date().toISOString() })
  );
  await Promise.all(updatePromises);
};

/** Soft-delete a notification */
export const deleteNotification = async (notificationId: string): Promise<void> => {
  const docRef = doc(db, "notifications", notificationId);
  await updateDoc(docRef, { is_deleted: true });
};

// ─── Fetching ─────────────────────────────────────────────────────────────────

/** Fetch user's notifications (most recent first, not deleted) */
export const getUserNotifications = async (
  userId: string,
  limitNum = 30
): Promise<Notification[]> => {
  try {
    const q = query(
      collection(db, "notifications"),
      where("user_id", "==", userId),
      where("is_deleted", "==", false),
      orderBy("created_at", "desc"),
      firestoreLimit(limitNum)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as Notification[];
  } catch (error) {
    console.error("[notificationService] getUserNotifications error:", error);
    return [];
  }
};

/** Get count of unread notifications for a user */
export const getUnreadCount = async (userId: string): Promise<number> => {
  try {
    const q = query(
      collection(db, "notifications"),
      where("user_id", "==", userId),
      where("status", "==", "unread"),
      where("is_deleted", "==", false)
    );
    
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  } catch (error) {
    return 0;
  }
};

// ─── Real-time ────────────────────────────────────────────────────────────────

/**
 * Subscribe to all notifications for a user in real-time via Supabase channel.
 * Returns an unsubscribe function — call it on component unmount.
 */
export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: Notification[]) => void
): (() => void) => {
  const q = query(
    collection(db, "notifications"),
    where("user_id", "==", userId),
    where("is_deleted", "==", false),
    orderBy("created_at", "desc"),
    firestoreLimit(30)
  );

  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })) as Notification[];
    callback(notifications);
  }, (error) => {
    console.error("[notificationService] subscribeToNotifications error:", error);
  });
};

/**
 * Subscribe to just the unread count in real-time.
 * Returns an unsubscribe function.
 */
export const subscribeToUnreadCount = (
  userId: string,
  callback: (count: number) => void
): (() => void) => {
  const q = query(
    collection(db, "notifications"),
    where("user_id", "==", userId),
    where("status", "==", "unread"),
    where("is_deleted", "==", false)
  );

  return onSnapshot(q, (snapshot) => {
    callback(snapshot.size); // count of returned docs
  }, (error) => {
    console.error("[notificationService] subscribeToUnreadCount error:", error);
  });
};

// ─── Named notification creators ─────────────────────────────────────────────

export const createPaymentSuccessNotification = async (
  userId: string,
  orderId: string,
  amount: number,
  orderData: { itemCount?: number; remainingBalance?: number } = {}
): Promise<string | null> => {
  const roundedAmount = Math.ceil(amount);
  const itemsInfo = orderData.itemCount
    ? `${orderData.itemCount} item${orderData.itemCount > 1 ? "s" : ""}`
    : "your order";
  const remainingText =
    (orderData.remainingBalance ?? 0) > 0
      ? `\nRemaining balance: ₦${Math.ceil(orderData.remainingBalance!).toLocaleString()}`
      : "\n✓ Order fully paid";

  return createNotification(userId, NOTIFICATION_TYPES.PAYMENT_SUCCESS, {
    title: "Payment Confirmed! 💳",
    message: `Payment of ₦${roundedAmount.toLocaleString()} received for ${itemsInfo}.${remainingText}`,
    metadata: {
      order_id: orderId,
      amount: roundedAmount,
      remaining_balance: orderData.remainingBalance ?? 0,
      timestamp: new Date().toISOString(),
    },
  });
};

export const createOrderPlacedNotification = async (
  userId: string,
  orderId: string,
  itemCount: number
): Promise<string | null> => {
  return createNotification(userId, NOTIFICATION_TYPES.ORDER_PLACED, {
    title: "Order Placed Successfully! ✅",
    message: `Your order with ${itemCount} item${itemCount > 1 ? "s" : ""} has been received and is awaiting payment confirmation.`,
    metadata: { order_id: orderId, item_count: itemCount, timestamp: new Date().toISOString() },
  });
};

export const createTrackingUpdateNotification = async (
  userId: string,
  orderId: string,
  status: string,
  notes?: string
): Promise<string | null> => {
  const statusLabels: Record<string, string> = {
    pending: "Order Placed",
    processing: "Being Processed",
    shipped: "Package Shipped 📦",
    out_for_delivery: "Out for Delivery 🚚",
    delivered: "Delivered 🎉",
    cancelled: "Cancelled",
  };
  const label = statusLabels[status] ?? status;
  return createNotification(userId, NOTIFICATION_TYPES.TRACKING_UPDATE, {
    title: `Order Update: ${label}`,
    message: notes || `Your order status has been updated to: ${label}`,
    metadata: { order_id: orderId, tracking_status: status, timestamp: new Date().toISOString() },
  });
};

export const createOrderOTPNotification = async (
  userId: string,
  orderId: string,
  otpCode: string
): Promise<string | null> => {
  return createNotification(userId, NOTIFICATION_TYPES.ORDER_OTP, {
    title: "Your Package is Out for Delivery! 🚚",
    message: `Your order is on its way. Share this OTP with your dispatch rider: ${otpCode}`,
    metadata: { order_id: orderId, otp_code: otpCode, timestamp: new Date().toISOString() },
  });
};

export default {
  NOTIFICATION_TYPES,
  createNotification,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUserNotifications,
  getUnreadCount,
  subscribeToNotifications,
  subscribeToUnreadCount,
  createPaymentSuccessNotification,
  createOrderPlacedNotification,
  createTrackingUpdateNotification,
  createOrderOTPNotification,
};
