import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import type { Role, UserData, UserRoleData } from "../myDataTypes";

/**
 * Live role doc plus its members' profiles, with each member's points and
 * taskCompleted swapped for their stats in this role.
 * `role` is undefined while loading and null if the role doesn't exist.
 */
export function useRole(roleId: string | undefined, enabled = true) {
    const [role, setRole] = useState<Role | null | undefined>(undefined);
    const [membersWithData, setMembersWithData] = useState<UserData[]>([]);
    const members = role?.members;
    const membersKey = (members ?? []).join(",");

    useEffect(() => {
        if (!roleId || !enabled) return;
        return onSnapshot(doc(db, "roles", roleId), (snap) => {
            setRole(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Role, "id">) } : null);
        }, (err) => {
            console.error("Error loading role:", err);
            setRole(null);
        });
    }, [roleId, enabled]);

    useEffect(() => {
        const uids = membersKey ? membersKey.split(",") : [];
        setMembersWithData(prev => prev.filter(m => uids.includes(m.uid)));
        if (!roleId || uids.length === 0) return;

        const unsubs = uids.map(uid => onSnapshot(doc(db, "users", uid), (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            const roleData: Partial<UserRoleData> = Array.isArray(data.roles)
                ? data.roles.find((r: UserRoleData) => r.id === roleId) ?? {}
                : {};
            setMembersWithData(prev => [
                ...prev.filter(m => m.uid !== uid),
                {
                    id: uid,
                    uid,
                    name: data.name || "Unknown User",
                    roles: data.roles || [],
                    points: roleData.points || 0,
                    taskCompleted: roleData.taskCompleted || 0,
                    photoURL: data.photoURL || "",
                    currentRole: data.currentRole || "",
                },
            ]);
        }));
        return () => unsubs.forEach(u => u());
    }, [membersKey, roleId]);

    return { role, membersWithData, requested: role?.pendingRequests ?? [] };
}
