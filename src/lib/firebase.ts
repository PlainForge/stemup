import { initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, initializeAuth, setPersistence, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Capacitor } from "@capacitor/core";

const firebaseConfig = {
  apiKey: "AIzaSyDVhkl9H-gUhI6r_nwSWTiMprLrpPrbayk",
  authDomain: "stempower-fellowship.firebaseapp.com",
  projectId: "stempower-fellowship",
  storageBucket: "stempower-fellowship.firebasestorage.app",
  messagingSenderId: "137488563400",
  appId: "1:137488563400:web:78b39c9ce50df57cc079fd",
};

const app = initializeApp(firebaseConfig);

// On iOS/Android, getAuth()'s default popup/redirect resolver tries to load an
// authDomain iframe that never resolves under Capacitor's local origin, which
// hangs onAuthStateChanged forever (stuck loading screen). initializeAuth with
// no resolver avoids that; the web build keeps the normal getAuth() behavior.
export const auth = Capacitor.isNativePlatform()
  ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
  : getAuth(app);

export const db = getFirestore(app);
export const storage = getStorage(app);

export const logout = () => signOut(auth);

if (!Capacitor.isNativePlatform()) {
  setPersistence(auth, browserLocalPersistence);
}