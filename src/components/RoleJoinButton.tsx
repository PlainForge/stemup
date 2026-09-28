import { useContext, useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { arrayUnion, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
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
    const admins = context?.admins ?? [];
    const isAdmin = !!user && admins.includes(user.uid);

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

    // Admins can join any role directly, no approval needed
    const joinAsAdmin = async () => {
        if (!user) return;
        await setDoc(doc(db, "roles", role.id), {
            members: arrayUnion(user.uid)
        }, { merge: true });
        await updateDoc(doc(db, "users", user.uid), {
            roles: arrayUnion({ id: role.id, name: role.name, points: 0, taskCompleted: 0 })
        });
    }

    if (isMember) {
        return (
            <LinkButton onClick={() => navigate(`/roles/${role.id}`)} moreClass="font-medium">Enter</LinkButton>
        )
    }

    if (isAdmin) {
        return (
            <LinkButton onClick={joinAsAdmin}>Join</LinkButton>
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