import { onAuthStateChanged, type User } from "firebase/auth"
import { useEffect, useState } from "react"
import { auth } from "../firebase";

export default function useUser(): [User | null, boolean] {
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