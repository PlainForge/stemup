import { useContext, useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { MainContext } from "../context/MainContext";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faHourglassHalf, faPaperPlane, faPlus, faSpinner, faXmark } from "@fortawesome/free-solid-svg-icons";
import { confirmDialog } from "../lib/confirm";

interface JoinProps {
    role: {name: string, id: string}
}

export default function JoinButton({ role } : JoinProps) {
    const context = useContext(MainContext);
    const [hasRequested, setHasRequested] = useState(false);
    const [isMember, setIsMember] = useState(false);
    const [busy, setBusy] = useState(false);
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
        return <span className="text-sm text-gray-400">Loading...</span>;
    }

    const run = async (action: () => Promise<unknown>) => {
        setBusy(true);
        try {
            await action();
        } catch (err) {
            console.error(err);
        } finally {
            setBusy(false);
        }
    };

    const requestRole = () => run(() => updateDoc(doc(db, "roles", role.id), { pendingRequests: arrayUnion(user.uid) }));

    // Taking back a request that hasn't been answered yet
    const withdraw = async () => {
        const ok = await confirmDialog(`Withdraw your request to join ${role.name}?`, { title: "Withdraw Request?", confirmLabel: "Withdraw", danger: true });
        if (ok) await run(() => updateDoc(doc(db, "roles", role.id), { pendingRequests: arrayRemove(user.uid) }));
    };

    // Admins can join any role directly, no approval needed
    const joinAsAdmin = () => run(async () => {
        await setDoc(doc(db, "roles", role.id), { members: arrayUnion(user.uid) }, { merge: true });
        await updateDoc(doc(db, "users", user.uid), {
            roles: arrayUnion({ id: role.id, name: role.name, points: 0, taskCompleted: 0 })
        });
    });

    const pill = "group/join inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition-all duration-200 hover:cursor-pointer disabled:opacity-60 disabled:cursor-wait active:scale-95";

    if (isMember) {
        return (
            <button type="button" onClick={() => navigate(`/roles/${role.id}`)} className={`${pill} bg-blue-50 text-blue-700 hover:bg-blue-100 dark:text-blue-300`}>
                Open
                <FontAwesomeIcon icon={faArrowRight} className="text-xs transition-transform group-hover/join:translate-x-0.5" />
            </button>
        );
    }

    if (isAdmin) {
        return (
            <button type="button" onClick={joinAsAdmin} disabled={busy} className={`${pill} bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:shadow`}>
                <FontAwesomeIcon icon={busy ? faSpinner : faPlus} className={`text-xs ${busy ? "animate-spin" : ""}`} />
                {busy ? "Joining..." : "Join"}
            </button>
        );
    }

    if (hasRequested) {
        return (
            <button
                type="button"
                onClick={withdraw}
                disabled={busy}
                title="Waiting for an instructor. Click to withdraw."
                className={`${pill} border border-amber-200 bg-amber-50 text-amber-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-red-500/15 dark:hover:text-red-300`}
            >
                <FontAwesomeIcon icon={faHourglassHalf} className="text-xs group-hover/join:hidden" />
                <FontAwesomeIcon icon={faXmark} className="text-xs hidden group-hover/join:inline" />
                <span className="group-hover/join:hidden">Requested</span>
                <span className="hidden group-hover/join:inline">Withdraw</span>
            </button>
        );
    }

    return (
        <button type="button" onClick={requestRole} disabled={busy} className={`${pill} bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:shadow`}>
            <FontAwesomeIcon icon={busy ? faSpinner : faPaperPlane} className={`text-xs ${busy ? "animate-spin" : ""}`} />
            {busy ? "Sending..." : "Request to Join"}
        </button>
    );
}
