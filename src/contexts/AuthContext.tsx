import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as firebaseSignOut, updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc, addDoc, collection } from "firebase/firestore";
import { auth, db } from "@/integrations/firebase/client";
import { requestNotificationPermission } from "@/integrations/firebase/messaging";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isDeliveryRider: boolean;
  role: "admin" | "delivery_rider" | "customer";
  signUp: (email: string, password: string, fullName: string, phone?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const logActivity = async (
  eventType: string,
  userId: string | null,
  email: string | null,
  metadata: Record<string, unknown> = {}
) => {
  try {
    await addDoc(collection(db, "activity_logs"), {
      user_id: userId,
      event_type: eventType,
      email,
      user_agent: navigator.userAgent.slice(0, 200),
      metadata,
      created_at: new Date().toISOString()
    });
  } catch {
    // Silently fail — logging should never break the auth flow
  }
};

const registerFcmToken = async (userId: string) => {
  try {
    const token = await requestNotificationPermission();
    if (token) {
      await setDoc(doc(db, "user_fcm_tokens", userId), {
        user_id: userId,
        fcm_token: token,
        device_type: navigator.userAgent.slice(0, 100),
        updated_at: new Date().toISOString()
      }, { merge: true });
    }
  } catch (error) {
    console.warn("FCM Registration failed", error);
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDeliveryRider, setIsDeliveryRider] = useState(false);
  const [role, setRole] = useState<"admin" | "delivery_rider" | "customer">("customer");

  const checkUserRole = async (userId: string) => {
    try {
      const profileDoc = await getDoc(doc(db, "profiles", userId));
      if (profileDoc.exists()) {
        const data = profileDoc.data();
        const adminStatus = data.isAdmin === true;
        
        setIsAdmin(adminStatus);
        setRole(adminStatus ? "admin" : "customer");
        setIsDeliveryRider(data.isDeliveryRider === true);
      } else {
        setRole("customer");
        setIsAdmin(false);
        setIsDeliveryRider(false);
      }
    } catch {
      setRole("customer");
      setIsAdmin(false);
      setIsDeliveryRider(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        checkUserRole(currentUser.uid);
        setTimeout(() => logActivity("login", currentUser.uid, currentUser.email ?? null, {
          provider: currentUser.providerData[0]?.providerId ?? "email",
        }), 0);
        setTimeout(() => registerFcmToken(currentUser.uid), 1000); // slight delay
      } else {
        setIsAdmin(false);
        setIsDeliveryRider(false);
        setRole("customer");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string, phone?: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;
      
      await updateProfile(newUser, { displayName: fullName });
      
      // Store in profiles collection
      await setDoc(doc(db, "profiles", newUser.uid), {
        user_id: newUser.uid,
        full_name: fullName,
        phone: phone || "",
        created_at: new Date().toISOString()
      });

      await logActivity("signup", newUser.uid, email, { full_name: fullName, phone: phone ?? "" });
      return { error: null };
    } catch (error) {
      await logActivity("signup_failed", null, email, { reason: (error as Error).message });
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (error) {
      await logActivity("login_failed", null, email, { reason: (error as Error).message });
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    if (user) {
      await logActivity("logout", user.uid, user.email ?? null, {});
    }
    await firebaseSignOut(auth);
    setIsAdmin(false);
    setIsDeliveryRider(false);
    setRole("customer");
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isDeliveryRider, role, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
