// Roles, instructors and the requests admins approve.
//
// Access levels: User < Instructor < Admin.
// - Instructors are listed in admins/instructors (ids), set by admins.
// - Admins are listed in admins/all-perms (ids), set by a developer only.
// - A role's instructors (roles/{id}.instructors) run it; they're also members,
//   but leaderboards leave them out, the same way they leave out admins.
// - A role's owner (roles/{id}.owner, chosen by admins) is one of its instructors.
//   The others ask the owner to rename or reset the role, edit a member's stats,
//   kick someone or change the rewards title. Tasks, join requests and prizes
//   they handle themselves.
// - Requests live in `requests` until approved or declined: Instructor access
//   and new roles by an admin, role changes by the role's owner (or an admin
//   when the role has no owner).
import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { firebaseAuthService } from "./firebaseService";
import { ROLE_CHANGE_TYPES, type Role, type RoleChangeType, type StemRequest, type UserData, type UserRoleData } from "../myDataTypes";

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

/** The role's owner: `owner`, or for older roles the instructor who created it. "" when it has none. */
export function roleOwner(role: Pick<Role, "owner" | "createdBy" | "instructors"> | null | undefined): string {
    if (!role) return "";
    const owner = role.owner ?? role.createdBy ?? "";
    // An owner who no longer runs the role doesn't count
    return owner && (role.instructors ?? []).includes(owner) ? owner : "";
}

/** True when uid can make the bigger changes to a role without asking: admins and the role's owner. */
export function canChangeRole(role: Pick<Role, "owner" | "createdBy" | "instructors"> | null | undefined, uid: string | undefined, admins: string[]) {
    if (!role || !uid) return false;
    return admins.includes(uid) || roleOwner(role) === uid;
}

export function isRoleChange(type: StemRequest["type"]): type is RoleChangeType {
    return (ROLE_CHANGE_TYPES as readonly string[]).includes(type);
}

/** What a role change request asks for, e.g. `rename Robotics to "Drones"` */
function roleChangeAction(req: StemRequest): string {
    const roleName = req.roleName || "this role";
    switch (req.type) {
        case "resetRole": return `reset ${roleName}, saving its data as "${req.saveName}"`;
        case "renameRole": return `rename ${roleName} to "${req.newName}"`;
        case "editStats": return `set ${req.targetName || "a member"}'s stats to ${req.points ?? 0} pts and ${req.taskCompleted ?? 0} tasks`;
        case "kickMember": return `remove ${req.targetName || "a member"} from ${roleName}`;
        case "rewardsTitle": return req.title ? `change the rewards title to "${req.title}"` : "set the rewards title back to the current month";
        default: return "make a change";
    }
}

/** The request in a sentence, from the approver's side ("Sam wants to ...") or the sender's ("You asked to ...") */
export function describeRoleChange(req: StemRequest, mine = false): string {
    return mine ? `You asked to ${roleChangeAction(req)}` : `${req.userName || "An instructor"} wants to ${roleChangeAction(req)}`;
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
        await this.requestRoleChange("resetRole", uid, userName, role, { saveName: saveName.trim() });
    },

    /** Asks the role's owner (or an admin, when it has none) to make a change to the role. */
    async requestRoleChange(
        type: RoleChangeType,
        uid: string,
        userName: string,
        role: { id: string; name: string },
        details: Pick<StemRequest, "saveName" | "newName" | "title" | "targetUid" | "targetName" | "points" | "taskCompleted">,
    ) {
        const clean = Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined));
        await addDoc(collection(db, "requests"), {
            type, uid, userName, roleId: role.id, roleName: role.name, ...clean, createdAt: Timestamp.now(),
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
            default:
                if (isRoleChange(req.type)) await this.applyRoleChange(req);
        }
        await this.settleRequest(req.id, "approved");
    },

    /** Carries out a role change request (by the role's owner or an admin). */
    async applyRoleChange(req: StemRequest) {
        if (!req.roleId) return;
        const roleSnap = await getDoc(doc(db, "roles", req.roleId));
        // The role may have been deleted since the request was made
        if (!roleSnap.exists()) return;
        const members: string[] = roleSnap.data().members ?? [];
        switch (req.type) {
            case "resetRole":
                await this.resetRole(req.roleId, req.saveName || "Saved Data");
                break;
            case "renameRole":
                if (req.newName?.trim()) await this.renameRole(req.roleId, req.newName);
                break;
            case "rewardsTitle":
                await this.setRewardsTitle(req.roleId, req.title ?? "");
                break;
            case "editStats":
                // Only while they're still in the role
                if (req.targetUid && members.includes(req.targetUid)) {
                    await this.setMemberRoleStats(req.targetUid, req.roleId, req.points ?? 0, req.taskCompleted ?? 0);
                }
                break;
            case "kickMember":
                if (req.targetUid && members.includes(req.targetUid)) {
                    await firebaseAuthService.kickUserFromRole(req.roleId, req.targetUid);
                }
                break;
        }
    },

    /** Sets a member's points and tasks completed in one role (their global totals are untouched). */
    async setMemberRoleStats(uid: string, roleId: string, points: number, taskCompleted: number) {
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        const roles: UserRoleData[] = Array.isArray(snap.data().roles) ? snap.data().roles : [];
        await updateDoc(ref, {
            roles: roles.map(r => r.id === roleId ? { ...r, points: Math.max(0, points), taskCompleted: Math.max(0, taskCompleted) } : r),
        });
    },

    async renameRole(roleId: string, name: string) {
        await updateDoc(doc(db, "roles", roleId), { name: name.trim() });
    },

    /** Makes one of the role's instructors its owner; "" leaves it with none. Admin-only in the rules. */
    async setRoleOwner(roleId: string, uid: string) {
        await updateDoc(doc(db, "roles", roleId), { owner: uid });
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
        // Roles they owned are left without an owner
        await Promise.all(led.docs.map(d => updateDoc(d.ref, {
            instructors: arrayRemove(uid),
            ...(roleOwner({ id: d.id, ...d.data() } as Role) === uid ? { owner: "" } : {}),
        })));
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
            // The instructor who asked for it owns it
            owner: ownerUid && !admins.includes(ownerUid) ? ownerUid : "",
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

    /** Stops an instructor running this role; they stay a member. Removing the owner leaves the role without one. */
    async removeRoleInstructor(role: Pick<Role, "id" | "owner" | "createdBy" | "instructors">, uid: string) {
        await updateDoc(doc(db, "roles", role.id), {
            instructors: arrayRemove(uid),
            ...(roleOwner(role) === uid ? { owner: "" } : {}),
        });
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
