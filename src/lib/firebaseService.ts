import { createUserWithEmailAndPassword, deleteUser, EmailAuthProvider, GoogleAuthProvider, linkWithCredential, OAuthProvider, onAuthStateChanged, reauthenticateWithCredential, reauthenticateWithPopup, sendEmailVerification, sendPasswordResetEmail, signInWithCredential, signInWithEmailAndPassword, signInWithPopup, type User } from "firebase/auth";
import { auth, db, functions, storage } from "./firebase";
import { httpsCallable } from "firebase/functions";
import { arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, query, setDoc, Timestamp, updateDoc, where, writeBatch } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { FirebaseError } from "firebase/app";
import type { OAuthCredential } from "firebase/auth";
import type { Role, UserData, UserRoleData } from "../myDataTypes";
import { cleanName } from "./nameFilter";

const DEFAULT_AVATAR = "https://ui-avatars.com/api/?name=User&background=90caf9&color=fff";
export const GLOBAL_ROLE_ID = "r3wUbRSCX7cxwBYhtAdg";

type ResetUser = { id: string; name?: string; email?: string; roles?: UserRoleData[]; currentRole?: string; photoURL?: string; points?: number; taskCompleted?: number };

/**
 * Determines which users should be archived vs. kept for a semester reset.
 * A user is archived only if every non-global role they belong to is being removed;
 * admins are never touched. Every surviving user gets removed-role entries stripped
 * and all of their remaining points/taskCompleted (per-role and global) zeroed out
 * for the new semester.
 */
export function classifySemesterReset(users: ResetUser[], removeRoleIds: Set<string>, admins: string[]) {
    const usersToArchive: string[] = [];
    const usersToUpdate: { id: string; roles: UserRoleData[]; currentRole?: string; points: number; taskCompleted: number }[] = [];

    for (const u of users) {
        if (admins.includes(u.id)) continue;

        const roles = Array.isArray(u.roles) ? u.roles : [];
        const nonGlobalRoles = roles.filter(r => r.id !== GLOBAL_ROLE_ID);
        const remaining = nonGlobalRoles.filter(r => !removeRoleIds.has(r.id));

        if (nonGlobalRoles.length > 0 && remaining.length === 0) {
            usersToArchive.push(u.id);
            continue;
        }

        const survivingRoles = roles
            .filter(r => !removeRoleIds.has(r.id))
            .map(r => ({ ...r, points: 0, taskCompleted: 0 }));

        usersToUpdate.push({
            id: u.id,
            roles: survivingRoles,
            currentRole: u.currentRole && removeRoleIds.has(u.currentRole) ? "" : undefined,
            points: 0,
            taskCompleted: 0,
        });
    }

    return { usersToArchive, usersToUpdate };
}

/**
 * Creates the Firestore users/{uid} doc (and adds them to the global role) for a
 * first-time OAuth sign-in. No-op if the user already has a profile.
 * photoOverride lets callers pass a higher-res
 * photo URL than what's on the Auth user object (e.g. Google's upscaled photo).
 */
async function provisionOAuthUser(user: User, photoOverride?: string, name?: string) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) return;

    let photoURL = DEFAULT_AVATAR;
    const sourcePhoto = photoOverride ?? user.photoURL;
    if (sourcePhoto) {
        const response = await fetch(sourcePhoto);
        const blob = await response.blob();
        const storageRef = ref(storage, `profilePictures/${user.uid}`);
        await uploadBytes(storageRef, blob);
        photoURL = await getDownloadURL(storageRef);
    }

    await setDoc(userRef, {
        email: user.email,
        // Google/Apple names skip the sign-up form, so they're filtered here
        name: cleanName(name ?? user.displayName),
        roles: [{ id: GLOBAL_ROLE_ID, name: "global", points: 0, taskCompleted: 0 }],
        createdAt: new Date(),
        points: 0,
        taskCompleted: 0,
        photoURL,
        currentRole: "",
    });

    await updateDoc(doc(db, "roles", GLOBAL_ROLE_ID), {
        members: arrayUnion(user.uid),
    });
}

/** Name given to Apple accounts when Apple doesn't share one (same as the mobile app). */
export const APPLE_FALLBACK_NAME = "StemUp Member";

const appleProvider = () => {
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    return provider;
};

// ---- Linking Apple / Google / email accounts that share an email ----
// Firebase keeps one account per email, so signing in with a second provider
// fails with account-exists-with-different-credential. Hold on to that rejected
// credential and attach it once the person signs in the way they originally did.
let pendingCredential: OAuthCredential | null = null;
let pendingEmail: string | null = null;

function rememberForLinking(err: unknown, fromError: (e: FirebaseError) => OAuthCredential | null) {
    if (!(err instanceof FirebaseError) || err.code !== "auth/account-exists-with-different-credential") return;
    pendingCredential = fromError(err);
    const email = (err.customData as { email?: string } | undefined)?.email;
    pendingEmail = email ? email.toLowerCase() : null;
}

/** Links any held credential to the user when the emails match. Never throws. */
async function linkPending(user: User) {
    const pending = pendingCredential;
    if (!pending) return;
    if (pendingEmail && user.email?.toLowerCase() !== pendingEmail) return;
    pendingCredential = null;
    pendingEmail = null;
    try {
        await linkWithCredential(user, pending);
    } catch (err) {
        console.warn("Account link skipped:", err);
    }
}

/** The provider the person is being asked to link ("Apple" / "Google"), if any. */
export function pendingLinkProvider() {
    switch (pendingCredential?.providerId) {
        case "apple.com": return "Apple";
        case "google.com": return "Google";
        default: return null;
    }
}

/**
 * Maps a callable-function error onto the matching Auth error code so screens
 * can keep handling auth/too-many-requests and auth/invalid-email as before.
 * Returns null for errors that should fall back to Firebase's built-in email.
 */
function emailFunctionError(err: unknown): FirebaseError | null {
    if (!(err instanceof FirebaseError)) return null;
    if (err.code === "functions/resource-exhausted") return new FirebaseError("auth/too-many-requests", err.message);
    if (err.code === "functions/invalid-argument") return new FirebaseError("auth/invalid-email", err.message);
    return null;
}

/**
 * Sends the verification email from StemUp's Gmail (the sendVerificationEmail
 * function), which Yahoo and school inboxes accept. Falls back to Firebase's
 * built-in email if the function is unavailable.
 */
export async function sendVerification(user: User) {
    try {
        await httpsCallable(functions, "sendVerificationEmail")();
    } catch (err) {
        const mapped = emailFunctionError(err);
        if (mapped) throw mapped;
        console.warn("sendVerificationEmail function failed, using Firebase's email:", err);
        await sendEmailVerification(user);
    }
}

async function removeUserRole(userId: string, roleId: string) {
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);

  if (!snap.exists()) return;

  const data = snap.data();
  const roles = Array.isArray(data.roles) ? data.roles : [];

  const updatedRoles = roles.filter((r: Role) => r.id !== roleId);

  await updateDoc(userRef, {
    roles: updatedRoles,
    // Optional: clear currentRole if it matches
    ...(data.currentRole === roleId ? { currentRole: "" } : {})
  });
}

export const firebaseAuthService = {
    /**
     * Registers new user and add user to Firestore using email
     * @param email string
     * @param password string
     * @param name string
     * @returns 
     */
    async registerWithEmail(email: string, password: string, name: string) {
        if (!email || !password || !name) return null;

        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        // Send the verification email first, so a failed profile write below
        // can never leave a new user without their link. A failed send must not
        // stop sign-up either: they can use "Resend email" on the next screen.
        try {
            await sendVerification(userCred.user);
        } catch (err) {
            console.warn("Verification email not sent during sign-up:", err);
        }
        const userRef = doc(db, "users", userCred.user.uid);
        // Add starter data for new user
        await setDoc(userRef, {
            email: userCred.user.email,
            name: name,
            roles: [{id: 'r3wUbRSCX7cxwBYhtAdg', name: 'global', points: 0, taskCompleted: 0}],
            createdAt: new Date(),
            points: 0,
            taskCompleted: 0,
            photoURL: DEFAULT_AVATAR,
            currentRole: ""
        })
        // Add user to global role
        await updateDoc(doc(db, "roles", 'r3wUbRSCX7cxwBYhtAdg'), {
            members: arrayUnion(userCred.user.uid)
        })
    },

    /**
     * Login user using email
     * @param email string
     * @param password string
     * @returns 
     */
    async loginWithEmail(email: string, password: string) {
        if (!email || !password) return null;

        const cred = await signInWithEmailAndPassword(auth, email, password);
        await linkPending(cred.user);
    },

    /**
     * Emails a password-reset link. Firebase doesn't reveal whether the email has
     * an account, so the confirmation should be worded accordingly.
     */
    async sendPasswordReset(email: string) {
        try {
            await httpsCallable(functions, "sendPasswordResetEmail")({ email: email.trim() });
        } catch (err) {
            const mapped = emailFunctionError(err);
            if (mapped) throw mapped;
            console.warn("sendPasswordResetEmail function failed, using Firebase's email:", err);
            await sendPasswordResetEmail(auth, email.trim());
        }
    },

    /**
     * Sign In with Google. Popups don't work inside the native iOS/Android
     * WebView, so native platforms use the Capacitor Firebase Authentication
     * plugin's native Google flow instead, then sync the resulting credential
     * into the Firebase JS SDK so the rest of the app (Firestore, onAuthStateChanged)
     * keeps working exactly the same way.
     */
    async signInWithGoogle() {
        let userCred;
        try {
            if (Capacitor.isNativePlatform()) {
                const result = await FirebaseAuthentication.signInWithGoogle();
                const idToken = result.credential?.idToken;
                if (!idToken) throw new Error("No ID token returned from Google Sign-In");
                userCred = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
            } else {
                userCred = await signInWithPopup(auth, new GoogleAuthProvider());
            }
        } catch (err) {
            rememberForLinking(err, GoogleAuthProvider.credentialFromError);
            throw err;
        }
        const user = userCred.user;
        await linkPending(user);
        // Google's default is a 96px thumbnail; ask for a high-res copy to store
        const photoOverride = user.photoURL
            ? user.photoURL.replace(/=s\d+-c/, "=s400-c").replace(/=s\d+$/, "=s400")
            : undefined;
        await provisionOAuthUser(user, photoOverride);
    },

    /** Sign in with Apple uses a popup, so it's offered on the website only (not inside the Capacitor WebView). */
    appleSupported: !Capacitor.isNativePlatform(),

    async signInWithApple() {
        let userCred;
        try {
            userCred = await signInWithPopup(auth, appleProvider());
        } catch (err) {
            rememberForLinking(err, OAuthProvider.credentialFromError);
            throw err;
        }
        await linkPending(userCred.user);
        // Firebase copies Apple's name onto the user just after sign-in; re-read to pick it up
        await userCred.user.reload().catch(() => {});
        const user = auth.currentUser ?? userCred.user;
        const appleName = user.displayName?.trim();

        // Apple shares the name only the first time an Apple ID signs in, and
        // users can hide their email behind a relay address, so fall back to something readable
        const name = appleName
            || (user.email && !user.email.includes("privaterelay.appleid.com") ? user.email.split("@")[0] : APPLE_FALLBACK_NAME);
        await provisionOAuthUser(user, undefined, name);

        // Profiles created before the name came through got the placeholder; fix them up
        if (appleName) {
            const userRef = doc(db, "users", user.uid);
            const snap = await getDoc(userRef);
            if (snap.data()?.name === APPLE_FALLBACK_NAME) await updateDoc(userRef, { name: cleanName(appleName) });
        }
    },

    async setAccountInformation(name: string | undefined, file: File | null, user: User, userData: UserData) {
        let photoURL = userData.photoURL;
        
        try {
            // 1. If a new file was selected, replace the old file
            if (file) {
                // If user had a custom pic, delete it
                if (userData.photoURL && userData.photoURL !== DEFAULT_AVATAR) {
                    try {
                        const oldRef = ref(storage, `profilePictures/${user.uid}`);
                        await deleteObject(oldRef);
                    } catch (err) {
                        console.warn("Couldn't delete old picture:", err);
                    }
                }

                // Upload the new file
                const storageRef = ref(storage, `profilePictures/${user.uid}`);
                await uploadBytes(storageRef, file);
                photoURL = await getDownloadURL(storageRef);
            }

            // 2. Update Firestore (only changing name + photoURL if needed)
            await setDoc(
                doc(db, "users", user.uid),
                {
                    name: name,
                    photoURL: photoURL,
                },
                { merge: true }
            );
            return true;
        } catch (err) {
            console.log(err);
            return false;
        }
    },

    /**
     * Delete user account. askPassword is shown for email/password accounts.
     * Returns false if the person cancels; throws (with a readable message) if re-authentication or the
     * final Auth deletion fails. Data cleanup is best-effort so one rejected
     * write can't stop the account itself from being deleted.
     */
    async deleteAccount(user: User, userData: UserData, askPassword: () => Promise<string | null>) {
        const providerIds = user.providerData.map(p => p.providerId);
        try {
            if (providerIds.includes("google.com")) {
                await reauthenticateWithPopup(user, new GoogleAuthProvider());
            } else if (providerIds.includes("apple.com")) {
                await reauthenticateWithPopup(user, appleProvider());
            } else {
                const password = await askPassword();
                if (!password) return false;
                await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email!, password));
            }
        } catch (err) {
            const code = err instanceof FirebaseError ? err.code : "";
            if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return false;
            if (code === "auth/wrong-password" || code === "auth/invalid-credential") throw new Error("That password is incorrect.");
            if (code === "auth/too-many-requests") throw new Error("Too many attempts. Please wait a bit and try again.");
            console.error("Re-authentication failed:", err);
            throw new Error(`Couldn't confirm it's you (${code || "unknown error"}).`);
        }

        // Best-effort cleanup of the user's data; failures are logged, not fatal
        const cleanup: { label: string; run: () => Promise<unknown> }[] = [];
        const userRoles: { id: string }[] = Array.isArray(userData?.roles) ? userData.roles : [];
        userRoles.forEach(r => cleanup.push({
            label: `roles/${r.id} membership`,
            run: () => updateDoc(doc(db, "roles", r.id), { members: arrayRemove(user.uid) }),
        }));
        cleanup.push({
            label: "tasks",
            run: async () => {
                const [tasksSnap, submittedSnap] = await Promise.all([
                    getDocs(query(collection(db, "tasks"), where("assignedTo", "==", user.uid))),
                    getDocs(query(collection(db, "tasksSubmitted"), where("assignedTo", "==", user.uid))),
                ]);
                await Promise.all([
                    ...tasksSnap.docs.map(d => deleteDoc(d.ref)),
                    ...submittedSnap.docs.map(d => deleteDoc(d.ref)),
                ]);
            },
        });
        if (userData?.photoURL && userData.photoURL !== DEFAULT_AVATAR) {
            cleanup.push({ label: "profile picture", run: () => deleteObject(ref(storage, `profilePictures/${user.uid}`)) });
        }
        const results = await Promise.allSettled(cleanup.map(c => c.run()));
        results.forEach((r, i) => {
            if (r.status === "rejected") console.warn(`Couldn't delete ${cleanup[i].label}:`, r.reason);
        });
        // Profile doc last, so the membership/task cleanup above can still read it if rules need to
        await deleteDoc(doc(db, "users", user.uid)).catch(err => console.warn("Couldn't delete profile:", err));

        try {
            await deleteUser(user);
        } catch (err) {
            console.error("Error deleting account:", err);
            const code = err instanceof FirebaseError ? err.code : "unknown error";
            throw new Error(`Couldn't delete the account (${code}). Please try again.`);
        }
        return true;
    },

    /**
     * Get User's Data from Firestore
     * @param id string
     * @returns UserData | null
     */
    async getUserData(id: string) {
        const userRef = doc(db, "users", id);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            return userSnap;
        }
        return null;
    },

    async kickUserFromRole(roleId: string, targetUid: string) {
        // Admins always stay in every role
        const adminIds: string[] = (await getDoc(doc(db, "admins", "all-perms"))).data()?.ids ?? [];
        if (adminIds.includes(targetUid)) return;

        const batch = writeBatch(db);

        // 1. Remove from role members
        const roleRef = doc(db, "roles", roleId);
        batch.update(roleRef, {
            members: arrayRemove(targetUid),
            instructors: arrayRemove(targetUid),
        });

        await removeUserRole(targetUid, roleId);

        // 3. Delete assigned tasks
        const tasksSnap = await getDocs(
            query(
            collection(db, "tasks"),
            where("roleId", "==", roleId),
            where("assignedTo", "==", targetUid)
            )
        );

        tasksSnap.forEach((doc) => batch.delete(doc.ref));

        // 4. Delete submitted tasks
        const submittedSnap = await getDocs(
            query(
            collection(db, "tasksSubmitted"),
            where("roleId", "==", roleId),
            where("assignedTo", "==", targetUid)
            )
        );

        submittedSnap.forEach((doc) => batch.delete(doc.ref));

        await batch.commit();
    },

    /**
     * Preview the effect of a semester reset without writing anything.
     * @param removeRoleIds role ids the admin has marked for removal
     */
    async previewSemesterReset(removeRoleIds: string[]) {
        const admins = (await getDoc(doc(db, "admins", "all-perms"))).data()?.ids ?? [];
        const removeSet = new Set(removeRoleIds);

        const usersSnap = await getDocs(collection(db, "users"));
        const users: ResetUser[] = usersSnap.docs.map(d => ({ id: d.id, ...(d.data() as { name?: string; email?: string; roles?: UserRoleData[]; currentRole?: string; photoURL?: string; points?: number; taskCompleted?: number }) }));

        const { usersToArchive, usersToUpdate } = classifySemesterReset(users, removeSet, admins);

        const roleNames = await Promise.all(
            removeRoleIds.map(async (roleId) => {
                const snap = await getDoc(doc(db, "roles", roleId));
                return snap.exists() ? (snap.data().name as string) : roleId;
            })
        );

        return {
            roleNames,
            usersToArchive: usersToArchive.length,
            usersToUpdate: usersToUpdate.length,
        };
    },

    /**
     * Archives any user whose only roles are being removed into a new Alumni batch
     * (name, photo, global points/taskCompleted only — no roles or tasks), then
     * deletes the given roles and those users' live accounts (tasks/submissions/
     * role membership/profile — their Storage avatar is kept since the archive
     * still references it). Users who also belong to a kept role are preserved,
     * stripped of the removed role(s), and have their points/taskCompleted
     * (per-role and global) reset to 0 for the new semester. Admins are never
     * touched. Note: this cannot remove another user's Firebase Auth account
     * (client SDK limitation) — only their app data is archived/deleted/reset.
     * @param removeRoleIds role ids the admin has marked for removal
     * @param batchName display name for the new Alumni archive batch
     */
    async executeSemesterReset(removeRoleIds: string[], batchName: string) {
        const admins = (await getDoc(doc(db, "admins", "all-perms"))).data()?.ids ?? [];
        const removeSet = new Set(removeRoleIds);

        const usersSnap = await getDocs(collection(db, "users"));
        const users: ResetUser[] = usersSnap.docs.map(d => ({ id: d.id, ...(d.data() as { name?: string; email?: string; roles?: UserRoleData[]; currentRole?: string; photoURL?: string; points?: number; taskCompleted?: number }) }));

        const { usersToArchive, usersToUpdate } = classifySemesterReset(users, removeSet, admins);
        const usersById = new Map(users.map(u => [u.id, u]));

        const writes: Promise<unknown>[] = [];
        const batchRef = doc(collection(db, "alumni"));

        // Kept users: strip removed-role entries and reset points/taskCompleted for the new semester
        usersToUpdate.forEach(({ id, roles, currentRole, points, taskCompleted }) => {
            writes.push(
                updateDoc(doc(db, "users", id), {
                    roles,
                    points,
                    taskCompleted,
                    ...(currentRole !== undefined ? { currentRole } : {}),
                })
            );
        });

        // Archived users: snapshot into the Alumni batch, then clean up their role
        // membership, tasks, and live profile (their avatar is kept for the archive)
        for (const uid of usersToArchive) {
            const snapshot = usersById.get(uid);

            writes.push(
                setDoc(doc(db, "alumni", batchRef.id, "members", uid), {
                    uid,
                    name: snapshot?.name ?? "Unknown User",
                    email: snapshot?.email ?? "",
                    photoURL: snapshot?.photoURL ?? DEFAULT_AVATAR,
                    points: snapshot?.points ?? 0,
                    taskCompleted: snapshot?.taskCompleted ?? 0,
                })
            );

            const roles = snapshot?.roles ?? [];
            roles
                .filter(r => !removeSet.has(r.id))
                .forEach(r => {
                    writes.push(updateDoc(doc(db, "roles", r.id), { members: arrayRemove(uid) }));
                });

            const [tasksSnap, submittedSnap] = await Promise.all([
                getDocs(query(collection(db, "tasks"), where("assignedTo", "==", uid))),
                getDocs(query(collection(db, "tasksSubmitted"), where("assignedTo", "==", uid))),
            ]);
            tasksSnap.forEach(taskDoc => writes.push(deleteDoc(doc(db, "tasks", taskDoc.id))));
            submittedSnap.forEach(taskDoc => writes.push(deleteDoc(doc(db, "tasksSubmitted", taskDoc.id))));

            writes.push(deleteDoc(doc(db, "users", uid)));
        }

        // Removed roles: delete their tasks/submissions/rewards/role doc
        const roleNames: string[] = [];
        for (const roleId of removeRoleIds) {
            const [tasksSnap, submittedSnap, roleSnap] = await Promise.all([
                getDocs(query(collection(db, "tasks"), where("roleId", "==", roleId))),
                getDocs(query(collection(db, "tasksSubmitted"), where("roleId", "==", roleId))),
                getDoc(doc(db, "roles", roleId)),
            ]);
            tasksSnap.forEach(taskDoc => writes.push(deleteDoc(doc(db, "tasks", taskDoc.id))));
            submittedSnap.forEach(taskDoc => writes.push(deleteDoc(doc(db, "tasksSubmitted", taskDoc.id))));
            if (roleSnap.exists()) roleNames.push(roleSnap.data().name as string);

            const rewardSnap = await getDoc(doc(db, "rewards", roleId));
            if (rewardSnap.exists()) writes.push(deleteDoc(doc(db, "rewards", roleId)));

            writes.push(deleteDoc(doc(db, "roles", roleId)));
        }

        writes.push(
            setDoc(batchRef, {
                name: batchName,
                createdAt: Timestamp.now(),
                roleNames,
                memberCount: usersToArchive.length,
            })
        );

        await Promise.all(writes);

        return {
            archivedUsers: usersToArchive.length,
            updatedUsers: usersToUpdate.length,
            deletedRoles: removeRoleIds.length,
            batchId: batchRef.id,
            batchName,
        };
    },

    /**
     * Permanently deletes an Alumni archive batch and all of its member records.
     * @param batchId the alumni batch document id
     */
    async deleteAlumniBatch(batchId: string) {
        const membersSnap = await getDocs(collection(db, "alumni", batchId, "members"));
        const writes: Promise<unknown>[] = membersSnap.docs.map(m => deleteDoc(doc(db, "alumni", batchId, "members", m.id)));
        writes.push(deleteDoc(doc(db, "alumni", batchId)));
        await Promise.all(writes);
    },

    /**
     * Removes a live user from the global role/leaderboard. Their account, points,
     * tasks, and any other role memberships are untouched — this only affects
     * global membership, and can be undone with restoreLiveUserToGlobal.
     */
    async removeFromGlobalRole(uid: string) {
        // Admins and anyone who can see the global leaderboard (members of a role
        // with showInGlobalLeaderboard) must always stay in global
        const [adminsSnap, viewerRolesSnap] = await Promise.all([
            getDoc(doc(db, "admins", "all-perms")),
            getDocs(query(collection(db, "roles"), where("showInGlobalLeaderboard", "==", true))),
        ]);
        const admins: string[] = adminsSnap.data()?.ids ?? [];
        const isProtected = admins.includes(uid) ||
            viewerRolesSnap.docs.some(d => ((d.data().members as string[]) ?? []).includes(uid));
        if (isProtected) return false;

        const userRef = doc(db, "users", uid);
        const snap = await getDoc(userRef);
        const roles: UserRoleData[] = Array.isArray(snap.data()?.roles) ? snap.data()!.roles : [];
        const updatedRoles = roles.filter(r => r.id !== GLOBAL_ROLE_ID);

        await Promise.all([
            updateDoc(doc(db, "roles", GLOBAL_ROLE_ID), { members: arrayRemove(uid) }),
            updateDoc(userRef, { roles: updatedRoles }),
        ]);
        return true;
    },

    /**
     * Re-adds a still-live user (one previously removed via removeFromGlobalRole)
     * back to the global role/leaderboard.
     */
    async restoreLiveUserToGlobal(uid: string) {
        await Promise.all([
            updateDoc(doc(db, "roles", GLOBAL_ROLE_ID), { members: arrayUnion(uid) }),
            updateDoc(doc(db, "users", uid), {
                roles: arrayUnion({ id: GLOBAL_ROLE_ID, name: "global", points: 0, taskCompleted: 0 }),
            }),
        ]);
    },

    /**
     * Restores an Alumni-archived user: recreates their users/{uid} profile from
     * the archived snapshot (name/email/photo/points/tasks, global role only),
     * re-adds them to the global role, and removes them from the Alumni batch.
     */
    async restoreAlumniMemberToGlobal(batchId: string, uid: string) {
        const memberRef = doc(db, "alumni", batchId, "members", uid);
        const memberSnap = await getDoc(memberRef);
        if (!memberSnap.exists()) return;
        const data = memberSnap.data();

        await Promise.all([
            setDoc(doc(db, "users", uid), {
                name: data.name ?? "Unknown User",
                email: data.email ?? "",
                photoURL: data.photoURL ?? DEFAULT_AVATAR,
                points: data.points ?? 0,
                taskCompleted: data.taskCompleted ?? 0,
                roles: [{ id: GLOBAL_ROLE_ID, name: "global", points: 0, taskCompleted: 0 }],
                currentRole: "",
                createdAt: Timestamp.now(),
            }),
            updateDoc(doc(db, "roles", GLOBAL_ROLE_ID), { members: arrayUnion(uid) }),
            deleteDoc(memberRef),
            updateDoc(doc(db, "alumni", batchId), { memberCount: increment(-1) }),
        ]);
    },

    onAuthStateChanged(callback: (user: User | null) => void) {
        return onAuthStateChanged(auth, callback);
    },
}
/**
 * Turns an Apple/Google sign-in error into a message for the login screens.
 * Returns "" when the person simply closed the popup.
 */
export function oauthErrorMessage(err: unknown): string {
    if (!(err instanceof FirebaseError)) return "Sign-in failed. Please try again.";
    switch (err.code) {
        case "auth/popup-closed-by-user":
        case "auth/cancelled-popup-request":
        case "auth/user-cancelled":
            return "";
        case "auth/popup-blocked":
            return "Your browser blocked the sign-in popup. Allow popups for this site and try again.";
        case "auth/account-exists-with-different-credential": {
            const provider = pendingLinkProvider();
            return provider
                ? `You already have an account with this email. Sign in the way you did before, and ${provider} will be linked to it.`
                : "You already have an account with this email. Sign in the way you did before.";
        }
        case "auth/email-already-in-use":
            return "This email is already registered. Please login instead.";
        default:
            console.error("Sign-in error:", err);
            return "Sign-in failed. Please try again.";
    }
}
