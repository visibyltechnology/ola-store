import emailjs from "@emailjs/browser";

// ─── EmailJS Configuration ────────────────────────────────────────────────────
const SERVICE_ID = "service_i43v8cs";
const PUBLIC_KEY = "oU2rutsKkdtYw8I-r";
const TEMPLATE_ID = "template_aou7vhl";

// Initialise EmailJS once (safe to call multiple times)
emailjs.init({ publicKey: PUBLIC_KEY });

// ─── Helper ───────────────────────────────────────────────────────────────────
const send = async (params: Record<string, string>) => {
  try {
    await emailjs.send(SERVICE_ID, TEMPLATE_ID, params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error("EmailJS send failed: " + message);
  }
};

// ─── Email Senders ────────────────────────────────────────────────────────────

/**
 * Send a registration / welcome OTP email.
 */
export const sendRegistrationOTPEmail = async (
  email: string,
  name: string,
  otp: string
) => {
  await send({
    to_name: name,
    to_email: email,
    email,           // matches {{email}} in current template
    subject: "Your Olas & Bs Verification Code",
    otp_code: otp,
    message: `Welcome to Olas & Bs Electronics, ${name}!\n\nYour verification code is:\n\n${otp}\n\nThis code expires in 10 minutes.`,
  });
};

/**
 * Send a forgot-password OTP email.
 */
export const sendForgotPasswordOTPEmail = async (
  email: string,
  name: string,
  otp: string
) => {
  await send({
    to_name: name,
    to_email: email,
    email,
    subject: "Reset Your Olas & Bs Password",
    otp_code: otp,
    message: `Hi ${name},\n\nYour password reset code is:\n\n${otp}\n\nThis code expires in 10 minutes. If you did not request this, please ignore this email.`,
  });
};

/**
 * Send a delivery OTP email to the customer.
 */
export const sendOrderOTPEmail = async (
  email: string,
  name: string,
  orderId: string,
  otp: string
) => {
  await send({
    to_name: name,
    to_email: email,
    email,
    subject: "Your Delivery OTP — Olas & Bs",
    otp_code: otp,
    order_id: orderId,
    message: `Hi ${name},\n\nYour order (${orderId}) is on its way!\n\nShare this OTP with your delivery rider to confirm receipt:\n\n${otp}\n\nDo not share this code with anyone else.`,
  });
};

/**
 * Send an order-tracking status update email.
 */
export const sendTrackingUpdateEmail = async (
  email: string,
  name: string,
  orderId: string,
  status: string,
  notes = ""
) => {
  const statusLabels: Record<string, string> = {
    pending: "Order Placed",
    processing: "Being Processed",
    shipped: "Package Shipped 📦",
    out_for_delivery: "Out for Delivery 🚚",
    delivered: "Delivered 🎉",
    cancelled: "Cancelled",
  };
  const label = statusLabels[status] ?? status;

  await send({
    to_name: name,
    to_email: email,
    email,
    subject: `Order Update: ${label} — Olas & Bs`,
    order_id: orderId,
    message:
      notes ||
      `Hi ${name},\n\nYour order (${orderId}) status has been updated to:\n\n${label}\n\nVisit your dashboard to track your order.`,
  });
};

export default {
  sendRegistrationOTPEmail,
  sendForgotPasswordOTPEmail,
  sendOrderOTPEmail,
  sendTrackingUpdateEmail,
};
