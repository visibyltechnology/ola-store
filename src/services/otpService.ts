import { db } from "@/integrations/firebase/client";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { sendRegistrationOTPEmail } from "./emailService";

// ─── Constants ────────────────────────────────────────────────────────────────
const OTP_EXPIRATION_MINUTES = 10;
const OTP_COLLECTION = "otp_codes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a random 6-digit OTP */
export const generateOTP = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();

/** SHA-256 hash an OTP using the Web Crypto API */
export const hashOTP = async (otp: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

/** Verify a plain OTP against its stored SHA-256 hash */
export const verifyOTPHash = async (
  otp: string,
  hash: string
): Promise<boolean> => {
  const computed = await hashOTP(otp);
  return computed === hash;
};

// ─── Registration / Password Reset OTP ───────────────────────────────────────

/**
 * Generate, hash, store in Firestore, and send OTP via EmailJS.
 * Returns the plain OTP (used internally; already sent to user's email).
 */
export const storeOTP = async (
  email: string,
  name: string,
  type: "registration" | "password_reset" | "email_verification" = "registration"
): Promise<string> => {
  const otp = generateOTP();
  const hashedOTP = await hashOTP(otp);
  const expiresAt = new Date(
    Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000
  ).toISOString();

  // Store hashed OTP in Firestore (keyed by email + type)
  const docId = `${email}_${type}`.replace(/[^a-zA-Z0-9_]/g, "_");
  await setDoc(doc(db, OTP_COLLECTION, docId), {
    email,
    type,
    otp_hash: hashedOTP,
    expires_at: expiresAt,
    attempts: 0,
    created_at: new Date().toISOString(),
  });

  // Send OTP email
  await sendRegistrationOTPEmail(email, name, otp);

  return otp;
};

/**
 * Verify a registration or password-reset OTP.
 * Checks the hash, expiry, and attempt count.
 * Deletes the record on success.
 */
export const verifyOTP = async (
  email: string,
  otp: string,
  type: "registration" | "password_reset" | "email_verification" = "registration"
): Promise<boolean> => {
  const docId = `${email}_${type}`.replace(/[^a-zA-Z0-9_]/g, "_");
  const docRef = doc(db, OTP_COLLECTION, docId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) throw new Error("OTP not found. Please request a new code.");

  const data = snap.data();

  // Check attempts
  if ((data.attempts ?? 0) >= 5) {
    throw new Error("Too many failed attempts. Please request a new code.");
  }

  // Check expiry
  if (new Date(data.expires_at) < new Date()) {
    await deleteDoc(docRef);
    throw new Error("OTP has expired. Please request a new code.");
  }

  // Verify hash
  const isValid = await verifyOTPHash(otp, data.otp_hash);

  if (!isValid) {
    // Increment attempts
    await setDoc(docRef, { attempts: (data.attempts ?? 0) + 1 }, { merge: true });
    throw new Error("Invalid code. Please try again.");
  }

  // Success — clean up
  await deleteDoc(docRef);
  return true;
};

// ─── Delivery OTP ─────────────────────────────────────────────────────────────

/**
 * Generate and store a delivery verification OTP for an order.
 * Returns the plain OTP for emailing to the customer.
 */
export const generateDeliveryOTP = async (
  orderId: string,
  deliveryEmail: string
): Promise<string> => {
  const otp = generateOTP();
  const hashedOTP = await hashOTP(otp);
  const expiresAt = new Date(
    Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000
  ).toISOString();

  const docId = `delivery_${orderId}`;
  await setDoc(doc(db, OTP_COLLECTION, docId), {
    email: deliveryEmail,
    order_id: orderId,
    type: "delivery_verification",
    otp_hash: hashedOTP,
    expires_at: expiresAt,
    attempts: 0,
    created_at: new Date().toISOString(),
  });

  return otp;
};

/**
 * Verify a delivery OTP for a specific order.
 */
export const verifyDeliveryOTP = async (
  orderId: string,
  otp: string
): Promise<boolean> => {
  const docId = `delivery_${orderId}`;
  const docRef = doc(db, OTP_COLLECTION, docId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) throw new Error("OTP not found or already used.");

  const data = snap.data();

  if ((data.attempts ?? 0) >= 5) {
    throw new Error("Too many failed attempts. Please contact support.");
  }

  if (new Date(data.expires_at) < new Date()) {
    await deleteDoc(docRef);
    throw new Error("OTP has expired.");
  }

  const isValid = await verifyOTPHash(otp, data.otp_hash);

  if (!isValid) {
    await setDoc(docRef, { attempts: (data.attempts ?? 0) + 1 }, { merge: true });
    throw new Error("Invalid OTP. Please try again.");
  }

  await deleteDoc(docRef);
  return true;
};

export default {
  OTP_EXPIRATION_MINUTES,
  generateOTP,
  hashOTP,
  verifyOTPHash,
  storeOTP,
  verifyOTP,
  generateDeliveryOTP,
  verifyDeliveryOTP,
};
