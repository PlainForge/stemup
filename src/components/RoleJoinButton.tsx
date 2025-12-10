import { useContext, useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { arrayUnion, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { motion } from "motion/react";
import { MainContext } from "../context/MainContext";
import { useNavigate } from "react-router-dom";
import LinkButton from "./LinkButton";

interface JoinProps {
    role: {name: string, id: string}
}

export default function JoinButton({ role } : JoinProps) {
    const context = useContext(MainContext);
    const [hasRequested, setHasRequested] = useState(false);
    const [isMember, setIsMember] = useState(false);
    const navigate = useNavigate?.();

    const user = context?.user ?? null;
    const userData = context?.userData ?? null;
    const loading = context?.loading ?? true;

    useEffect(() => {
        if (!user) return;

        const roleRef = doc(db, "roles", role.id);

        const unsub = onSnapshot(roleRef, (snap) => {
            if (!snap.exists()) return;

            const data = snap.data();

            setHasRequested((data.pendingRequests || []).includes(user.uid));

            const isInMembers = data.members.includes(user.uid);
            setIsMember(isInMembers);
        });
        return () => unsub();
    }, [role, user]);

    if (!user || !userData || loading) {
        return "Loading...";
    }

    const requestRole = async (roleId: string) => {
        if (!user) return;

        const roleRef = doc(db, "roles", roleId);
        await updateDoc(roleRef, {
            pendingRequests: arrayUnion(user.uid)
        })
    }

    if (isMember) {
        return (
            <motion.button
                whileHover={{cursor: 'pointer', y: -4, scale: 1.02}} 
                key={role.id + role.id} 
                className="join-button-container"
            >
                <LinkButton onClick={() => navigate(`/roles/${role.id}`)}>Join</LinkButton>
            </motion.button>
        )
    }

    if (hasRequested) {
        return <p>Requested</p>
    }

    return (
        <LinkButton 
            onClick={() => requestRole(role.id)}
        >
            Request to join
        </LinkButton>
    )
}