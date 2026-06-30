import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { initializeFirestore, getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCsB1Gyhf0GTP60IOInILXG8eg7r-IcO5U",
  authDomain: "olasandbselectronics-959c7.firebaseapp.com",
  projectId: "olasandbselectronics-959c7",
  storageBucket: "olasandbselectronics-959c7.firebasestorage.app",
  messagingSenderId: "258031638602",
  appId: "1:258031638602:web:8e2751634dd46ad032eeb3",
  measurementId: "G-GZTYHTTF5J"
};

export const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
export const auth = getAuth(app);

// Force long-polling to avoid ERR_CONNECTION_CLOSED / QUIC errors on unstable networks
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export const functions = getFunctions(app, "us-central1");
export const storage = getStorage(app);
