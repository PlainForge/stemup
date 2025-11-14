import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react"
import { db } from "../firebase";

/*
    Get/Update all admins from the firestore
*/
export default function useAdmin(): string[] {
    const [admins, setAdmins] = useState<string[]>([]);

    useEffect(() => {
        const adminRef = doc(db, "admins", "all-perms");
        const unsub = onSnapshot(adminRef, (snap) => {
            if (snap.exists()) {
                setAdmins(snap.data().ids || [])
            }
        })

        return () => unsub();
    }, [])

    return admins
}