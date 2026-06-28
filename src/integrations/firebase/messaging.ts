import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { app } from "./client";

// FCM requires a service worker and HTTPS. These functions fail gracefully
// when those conditions aren't met (e.g. during local dev on HTTP).

const getMessagingSafe = () => {
  try {
    return getMessaging(app);
  } catch {
    return null;
  }
};

export const requestNotificationPermission = async (): Promise<string | null> => {
  try {
    // FCM only works in secure contexts (HTTPS or localhost with SW)
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      return null;
    }

    const messaging = getMessagingSafe();
    if (!messaging) return null;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const currentToken = await getToken(messaging);
    return currentToken || null;
  } catch (err) {
    // Silently fail — push notifications are non-critical
    console.warn("[FCM] Could not get notification token:", err);
    return null;
  }
};

export const onMessageListener = () =>
  new Promise((resolve, reject) => {
    try {
      const messaging = getMessagingSafe();
      if (!messaging) { reject(new Error("Messaging not available")); return; }
      onMessage(messaging, (payload) => resolve(payload));
    } catch (err) {
      reject(err);
    }
  });
