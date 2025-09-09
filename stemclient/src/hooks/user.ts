import { onAuthStateChanged, type User } from "firebase/auth"
import { useEffect, useState } from "react"
import { auth } from "../firebase";

/*
    Get/Update current user
*/
export default function useAdmins(): [User | null, boolean] {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    return [user, loading];
}