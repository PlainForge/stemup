import { initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDVhkl9H-gUhI6r_nwSWTiMprLrpPrbayk",
  authDomain: "stempower-fellowship.firebaseapp.com",
  projectId: "stempower-fellowship",
  storageBucket: "stempower-fellowship.firebasestorage.app",
  messagingSenderId: "137488563400",
  appId: "1:137488563400:web:78b39c9ce50df57cc079fd",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const logout = () => signOut(auth);
setPersistence(auth, browserLocalPersistence);