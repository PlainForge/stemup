import  { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState, type ComponentState } from "react";
import { auth, db } from "../firebase";
import { arrayUnion, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { motion } from "motion/react";
import type { RoleUserData } from "../myDataTypes";
import '../styles/global.css'

interface JoinProps {
    role: {name: string, id: string}
    toPage: ComponentState,
    setRole: ComponentState
}

function JoinButton({ role, toPage, setRole } : JoinProps) {
    const [user, setUser] = useState<User | null>(null);
    const [hasRequested, setHasRequested] = useState(false);
    const [isMember, setIsMember] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });

        return () => unsub();
    }, []);

    useEffect(() => {
        if (!user) return;

        const roleRef = doc(db, "roles", role.id);

        const unsub = onSnapshot(roleRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();

            setHasRequested(data.pendingRequests?.includes(user.uid) || false);

            const isInMembers = data.members?.some((m: RoleUserData) => m.id === user.uid);
            setIsMember(isInMembers)
        }
    });
        return () => unsub();
    }, [role, user]);

    const requestRole = async (roleId: string) => {
        if (!user) return;

        const roleRef = doc(db, "roles", roleId);
        await updateDoc(roleRef, {
            pendingRequests: arrayUnion(user.uid)
        })
    }

    if (!user) {
        return <h1>Loading...</h1>
    }

    if (isMember) {
        return <motion.button 
                    whileHover={{ scale: 1.1}} 
                    key={role.id + role.id} 
                    className="button"
                    onClick={() => {
                        setRole(role)
                        toPage("rolepage")
                    }}
                >Join</motion.button>
    }

    if (hasRequested) {
        return <p>Requested</p>
    }

    return (
        <motion.button 
            whileHover={{cursor: 'pointer', scale: 1.1}} 
            onClick={() => requestRole(role.id)}
        >Request to join</motion.button>
    )
}

export default JoinButton