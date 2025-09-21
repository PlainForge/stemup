import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState, useRef } from "react";
import { auth, db } from "../firebase";
import type { UserData } from "../myDataTypes";
import { doc, onSnapshot, getDoc } from "firebase/firestore";

export default function useUser(): [User | null, UserData | null, boolean] {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  const unsubRef = useRef<() => void | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      // Unsubscribe previous snapshot immediately
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }

      setAuthUser(currentUser);

      if (currentUser) {
        try {
          const userRef = doc(db, "users", currentUser.uid);
          const snap = await getDoc(userRef);

          if (snap.exists()) {
            // Only subscribe if the doc exists
            unsubRef.current = onSnapshot(
              userRef,
              (s) => setUserData(s.data() as UserData),
              (error) => {
                console.warn("Firestore snapshot error:", error);
                setUserData(null);
              }
            );
          } else {
            setUserData(null);
          }
        } catch (err) {
          console.warn("Error fetching user doc:", err);
          setUserData(null);
        }
      } else {
        setUserData(null); // Clear on logout
      }

      setLoading(false);
    });

    return () => {
      unsubAuth();
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  // No second useEffect needed — subscription is handled after auth state change

  return [authUser, userData, loading];
}
