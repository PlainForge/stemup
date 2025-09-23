import { useEffect, useState, type ComponentState } from "react";
import { db } from "../firebase";
import { arrayUnion, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { motion } from "motion/react";
import '../styles/global.css'
import useUser from "../hooks/user";

interface JoinProps {
    role: {name: string, id: string}
    toPage: ComponentState,
    setRole: ComponentState
}

function JoinButton({ role, toPage, setRole } : JoinProps) {
    const [user, userData, loading] = useUser();
    const [hasRequested, setHasRequested] = useState(false);
    const [isMember, setIsMember] = useState(false);

    useEffect(() => {
        if (!user || !userData) return;

        const roleRef = doc(db, "roles", role.id);

        const unsub = onSnapshot(roleRef, (snap) => {
            if (!snap.exists()) return;

            const data = snap.data();

            setHasRequested((data.pendingRequests || []).includes(user.uid));

            const isInMembers = data.members.includes(user.uid);
            setIsMember(isInMembers);
        });
        return () => unsub();
    }, [role, user, userData]);

    const requestRole = async (roleId: string) => {
        if (!user) return;

        const roleRef = doc(db, "roles", roleId);
        await updateDoc(roleRef, {
            pendingRequests: arrayUnion(user.uid)
        })
    }

    if (!user || !userData || loading) {
        return <h1>Loading...</h1>
    }

    if (isMember) {
        return (
            <motion.button 
                whileHover={{ scale: 1.1}} 
                key={role.id + role.id} 
                className="button"
                onClick={() => {
                    setRole(role)
                    toPage("rolepage")
                }}
                onTap={() => {
                    setRole(role)
                    toPage("rolepage")
                }}
            >Join</motion.button>
        )
    }

    if (hasRequested) {
        return <p>Requested</p>
    }

    return (
        <motion.button 
            whileHover={{cursor: 'pointer', scale: 1.1}} 
            onClick={() => requestRole(role.id)}
            onTap={() => requestRole(role.id)}
        >Request to join</motion.button>
    )
}

export default JoinButton