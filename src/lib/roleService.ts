// Roles, instructors and the requests admins approve.
//
// Access levels: User < Instructor < Admin.
// - Instructors are listed in admins/instructors (ids), set by admins.
// - Admins are listed in admins/all-perms (ids), set by a developer only.
// - A role's instructors (roles/{id}.instructors) run it; they're also members,
//   but leaderboards leave them out, the same way they leave out admins.
// - Requests (instructor access, a new role, a role reset) live in `requests`
//   until an admin approves or declines them.
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import type { Role, StemRequest, UserData, UserRoleData } from "../myDataTypes";

const instructorsRef = () => doc(db, "admins", "instructors");
const NO_REWARD = "No reward set";

/** True when uid can run the role: admins always, instructors for roles they were added to. */
export function canManageRole(role: Pick<Role, "instructors"> | null | undefined, uid: string | undefined, admins: string[], instructors: string[]) {
    if (!role || !uid) return false;
    if (admins.includes(uid)) return true;
    return instructors.includes(uid) && (role.instructors ?? []).includes(uid);
}

/**
 * People who aren't ranked or given tasks in a role: admins and the role's own
 * instructors. Instructors who don't run the role take part like anyone else.
 */
export function isRoleStaff(role: Pick<Role, "instructors"> | null | undefined, uid: string, admins: string[]) {
    return admins.includes(uid) || (role?.instructors ?? []).includes(uid);
}

async function adminIds(): Promise<string[]> {
    return (await getDoc(doc(db, "admins", "all-perms"))).data()?.ids ?? [];
}


/** Adds the role to a user's roles list if it isn't there yet (arrayUnion can't dedupe on id alone). */
async function addRoleToUser(uid: string, role: { id: string; name: string }) {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const roles: UserRoleData[] = Array.isArray(snap.data().roles) ? snap.data().roles : [];
    if (roles.some(r => r.id === role.id)) return;
    await updateDoc(ref, { roles: arrayUnion({ id: role.id, name: role.name, points: 0, taskCompleted: 0 }) });
}

async function removeRoleFromUser(uid: string, roleId: string) {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const roles: UserRoleData[] = Array.isArray(data.roles) ? data.roles : [];
    await updateDoc(ref, {
        roles: roles.filter(r => r.id !== roleId),
        ...(data.currentRole === roleId ? { currentRole: "" } : {}),
    });
}

export const roleService = {
    // ── Requests ──────────────────────────────────────────────────────────

    async requestInstructor(uid: string, userName: string, reason: string) {
        await addDoc(collection(db, "requests"), { type: "instructor", uid, userName, reason: reason.trim(), createdAt: Timestamp.now() });
    },

    async requestRoleCreation(uid: string, userName: string, roleName: string, purpose: string) {
        await addDoc(collection(db, "requests"), {
            type: "createRole", uid, userName, roleName: roleName.trim(), purpose: purpose.trim(), createdAt: Timestamp.now(),
        });
    },

    async requestRoleReset(uid: string, userName: string, role: { id: string; name: string }, saveName: string) {
        await addDoc(collection(db, "requests"), {
            type: "resetRole", uid, userName, roleId: role.id, roleName: role.name, saveName: saveName.trim(), createdAt: Timestamp.now(),
        });
    },

    /** Withdraws your own request (no notification is sent). */
    async deleteRequest(id: string) {
        await deleteDoc(doc(db, "requests", id));
    },

    /**
     * Removes a request after recording the admin's decision on it, so the
     * notifyOnRequestDecision Cloud Function can tell the person.
     */
    async settleRequest(id: string, status: "approved" | "declined") {
        const ref = doc(db, "requests", id);
        await updateDoc(ref, { status }).catch(() => {});
        await deleteDoc(ref);
    },

    async declineRequest(id: string) {
        await this.settleRequest(id, "declined");
    },

    /** Carries out the request, then removes it. */
    async approveRequest(req: StemRequest) {
        switch (req.type) {
            case "instructor":
                await this.grantInstructor(req.uid);
                break;
            case "createRole":
                await this.createRole(req.roleName || "Untitled Role", req.purpose ?? "", req.uid);
                break;
            case "resetRole": {
                if (!req.roleId) break;
                const roleSnap = await getDoc(doc(db, "roles", req.roleId));
                // The role may have been deleted since the request was made
                if (roleSnap.exists()) await this.resetRole(req.roleId, req.saveName || "Saved Data");
                break;
            }
        }
        await this.settleRequest(req.id, "approved");
    },

    // ── Instructor access ────────────────────────────────────────────────

    async grantInstructor(uid: string) {
        await setDoc(instructorsRef(), { ids: arrayUnion(uid) }, { merge: true });
        // Any instructor request they had open is now settled
        const open = await getDocs(query(collection(db, "requests"), where("uid", "==", uid), where("type", "==", "instructor")));
        await Promise.all(open.docs.map(d => this.settleRequest(d.id, "approved")));
    },

    /** Takes Instructor access away. They stay a member of their roles, but no longer run them. */
    async revokeInstructor(uid: string) {
        await setDoc(instructorsRef(), { ids: arrayRemove(uid) }, { merge: true });
        const led = await getDocs(query(collection(db, "roles"), where("instructors", "array-contains", uid)));
        await Promise.all(led.docs.map(d => updateDoc(d.ref, { instructors: arrayRemove(uid) })));
    },

    /**
     * Clears what's left of someone who deleted their account but still shows up
     * (the purgeDeletedAccount function refuses if they can still sign in).
     */
    async purgeDeletedAccount(uid: string) {
        await httpsCallable(functions, "purgeDeletedAccount")({ uid });
    },

    /** Lets a User see the global leaderboard on Home (admins and instructors already can). Admin-only in the rules. */
    async setCanSeeGlobal(uid: string, on: boolean) {
        await updateDoc(doc(db, "users", uid), { canSeeGlobal: on });
    },

    // ── Roles ─────────────────────────────────────────────────────────────

    /**
     * Creates a role. Every admin joins it; [ownerUid] (the instructor who asked
     * for it) joins too and becomes its first instructor.
     */
    async createRole(name: string, purpose: string, ownerUid?: string) {
        const admins = await adminIds();
        const members = Array.from(new Set([...admins, ...(ownerUid ? [ownerUid] : [])]));
        const ref = await addDoc(collection(db, "roles"), {
            name,
            purpose,
            members,
            instructors: ownerUid && !admins.includes(ownerUid) ? [ownerUid] : [],
            createdBy: ownerUid ?? "",
            pendingRequests: [],
            createdAt: new Date(),
        });
        await setDoc(doc(db, "rewards", ref.id), { first: NO_REWARD, second: NO_REWARD, third: NO_REWARD });
        await Promise.all(members.map(uid => addRoleToUser(uid, { id: ref.id, name })));
        return ref.id;
    },

    /** Gives an instructor who is already a member of this role access to run it. */
    async addRoleInstructor(role: { id: string; members?: string[] }, uid: string) {
        if (!(role.members ?? []).includes(uid)) throw new Error("Only members of this role can be made its instructors");
        await updateDoc(doc(db, "roles", role.id), { instructors: arrayUnion(uid) });
    },

    /** Stops an instructor running this role; they stay a member. */
    async removeRoleInstructor(roleId: string, uid: string) {
        await updateDoc(doc(db, "roles", roleId), { instructors: arrayRemove(uid) });
    },

    /**
     * Saves the role's leaderboard under [saveName] (the Saved Data tab), then
     * clears its tasks, submissions and prizes and zeroes every member's points
     * and task count for it. Global totals are untouched.
     */
    async resetRole(roleId: string, saveName: string) {
        const [roleSnap, admins] = await Promise.all([getDoc(doc(db, "roles", roleId)), adminIds()]);
        if (!roleSnap.exists()) return;
        const role = { id: roleId, ...(roleSnap.data() as Omit<Role, "id">) };
        const memberIds = role.members ?? [];

        const memberSnaps = await Promise.all(memberIds.map(uid => getDoc(doc(db, "users", uid))));
        const ranked = memberSnaps
            .filter(s => s.exists() && !isRoleStaff(role, s.id, admins))
            .map(s => {
                const data = s.data() as UserData;
                const stats = (Array.isArray(data.roles) ? data.roles : []).find(r => r.id === roleId);
                return { uid: s.id, name: data.name ?? "Unknown User", photoURL: data.photoURL ?? "", points: stats?.points ?? 0, taskCompleted: stats?.taskCompleted ?? 0 };
            })
            .sort((a, b) => b.points - a.points);

        const now = Timestamp.now();
        await addDoc(collection(db, "leaderboardSnapshots"), {
            roleId,
            name: saveName,
            month: now.toDate().toLocaleString("en-US", { month: "long", year: "numeric" }),
            createdAt: now,
            entries: ranked.map((u, idx) => ({ ...u, rank: idx + 1 })),
        });

        const [tasksSnap, submittedSnap] = await Promise.all([
            getDocs(query(collection(db, "tasks"), where("roleId", "==", roleId))),
            getDocs(query(collection(db, "tasksSubmitted"), where("roleId", "==", roleId))),
        ]);
        const writes: Promise<unknown>[] = [
            ...tasksSnap.docs.map(d => deleteDoc(d.ref)),
            ...submittedSnap.docs.map(d => deleteDoc(d.ref)),
            setDoc(doc(db, "rewards", roleId), { first: NO_REWARD, second: NO_REWARD, third: NO_REWARD }, { merge: true }),
        ];
        memberSnaps.forEach(s => {
            if (!s.exists()) return;
            const roles: UserRoleData[] = Array.isArray(s.data().roles) ? s.data().roles : [];
            if (!roles.some(r => r.id === roleId)) return;
            writes.push(updateDoc(s.ref, { roles: roles.map(r => r.id === roleId ? { ...r, points: 0, taskCompleted: 0 } : r) }));
        });
        await Promise.all(writes);
    },

    /** Deletes a role with its tasks, submissions, prizes, saved data and open requests. */
    async deleteRole(roleId: string) {
        const roleSnap = await getDoc(doc(db, "roles", roleId));
        const memberIds: string[] = roleSnap.exists() ? (roleSnap.data().members ?? []) : [];
        const [tasksSnap, submittedSnap, savedSnap, requestsSnap] = await Promise.all([
            getDocs(query(collection(db, "tasks"), where("roleId", "==", roleId))),
            getDocs(query(collection(db, "tasksSubmitted"), where("roleId", "==", roleId))),
            getDocs(query(collection(db, "leaderboardSnapshots"), where("roleId", "==", roleId))),
            getDocs(query(collection(db, "requests"), where("roleId", "==", roleId))),
        ]);
        const batch = writeBatch(db);
        [...tasksSnap.docs, ...submittedSnap.docs, ...savedSnap.docs, ...requestsSnap.docs].forEach(d => batch.delete(d.ref));
        await Promise.all([batch.commit(), ...memberIds.map(uid => removeRoleFromUser(uid, roleId))]);
        await deleteDoc(doc(db, "rewards", roleId)).catch(() => {});
        await deleteDoc(doc(db, "roles", roleId));
    },

    async setRewardsTitle(roleId: string, title: string) {
        await updateDoc(doc(db, "roles", roleId), { rewardsTitle: title.trim() });
    },
};
