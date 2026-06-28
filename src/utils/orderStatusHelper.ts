import { Clock, DollarSign, ShoppingBag, CheckCircle, Truck, XCircle } from "lucide-react";

export const ORDER_STATUSES = {
  PENDING: "pending",
  DEPOSIT_PAID: "deposit_paid",
  IN_PROGRESS: "in_progress",
  FULLY_PAID: "fully_paid",
  READY_FOR_DELIVERY: "ready_for_delivery",
  DELIVERED: "delivered",
  CANCELLED: "cancelled"
} as const;

export type OrderStatusType = typeof ORDER_STATUSES[keyof typeof ORDER_STATUSES];

export const ORDER_STATUS_CONFIG: Record<string, {
  step: number;
  label: string;
  colorClass: string;
  badgeClass: string;
  icon: any;
  description: string;
}> = {
  [ORDER_STATUSES.PENDING]: {
    step: 1,
    label: "Order Placed",
    colorClass: "text-yellow-600 bg-yellow-100",
    badgeClass: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: Clock,
    description: "Your order has been received and is awaiting payment"
  },
  [ORDER_STATUSES.DEPOSIT_PAID]: {
    step: 2,
    label: "Deposit Paid",
    colorClass: "text-blue-600 bg-blue-100",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
    icon: DollarSign,
    description: "Deposit received. Installment plan active."
  },
  [ORDER_STATUSES.IN_PROGRESS]: {
    step: 3,
    label: "Processing",
    colorClass: "text-purple-600 bg-purple-100",
    badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
    icon: ShoppingBag,
    description: "Your order is being processed."
  },
  [ORDER_STATUSES.FULLY_PAID]: {
    step: 4,
    label: "Fully Paid",
    colorClass: "text-green-600 bg-green-100",
    badgeClass: "bg-green-100 text-green-800 border-green-200",
    icon: CheckCircle,
    description: "Payment complete. Your package is being prepared."
  },
  [ORDER_STATUSES.READY_FOR_DELIVERY]: {
    step: 5,
    label: "Ready for Delivery",
    colorClass: "text-orange-600 bg-orange-100",
    badgeClass: "bg-orange-100 text-orange-800 border-orange-200",
    icon: Truck,
    description: "Your package is on its way to you."
  },
  [ORDER_STATUSES.DELIVERED]: {
    step: 6,
    label: "Delivered",
    colorClass: "text-emerald-600 bg-emerald-100",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: CheckCircle,
    description: "Your order has been successfully delivered."
  },
  [ORDER_STATUSES.CANCELLED]: {
    step: 0,
    label: "Cancelled",
    colorClass: "text-red-600 bg-red-100",
    badgeClass: "bg-red-100 text-red-800 border-red-200",
    icon: XCircle,
    description: "Your order has been cancelled."
  }
};

export const getOrderStatusConfig = (status: string) => {
  return ORDER_STATUS_CONFIG[status] || ORDER_STATUS_CONFIG[ORDER_STATUSES.PENDING];
};

export const getStepFromStatus = (status: string) => {
  return getOrderStatusConfig(status).step;
};

export const isTerminalStatus = (status: string) => {
  return status === ORDER_STATUSES.DELIVERED || status === ORDER_STATUSES.CANCELLED;
};

export const getStatusColorClass = (status: string) => {
  return getOrderStatusConfig(status).colorClass;
};

export const getStatusBadgeClass = (status: string) => {
  return getOrderStatusConfig(status).badgeClass;
};

export const formatOrderId = (orderId: string) => {
  if (!orderId) return "N/A";
  if (orderId.startsWith("ORD-")) return orderId;
  return `ORD-${orderId.substring(0, 8).toUpperCase()}`;
};

export const formatTimestamp = (timestampStr: string | null) => {
  if (!timestampStr) return "N/A";
  const date = new Date(timestampStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return `Today at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  } else if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
};
