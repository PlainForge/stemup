// Clears everything a deleted account leaves behind. The apps clean up on the
// device before deleting the account, but those writes can fail (a deleted
// role, a dropped connection, an older app version), which left profiles still
// showing on the global leaderboard and the Admin page's Users list.

import * as functionsV1 from "firebase-functions/v1";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/** Removes a user's profile, memberships, tasks, requests, messages and photo. Safe to run more than once. */
export async function purgeUserData(uid: string) {
  const db = getFirestore();
  const [memberOf, pendingIn, tasks, submitted, requests, invites, messages] = await Promise.all([
    db.collection("roles").where("members", "array-contains", uid).get(),
    db.collection("roles").where("pendingRequests", "array-contains", uid).get(),
    db.collection("tasks").where("assignedTo", "==", uid).get(),
    db.collection("tasksSubmitted").where("assignedTo", "==", uid).get(),
    db.collection("requests").where("uid", "==", uid).get(),
    db.collection("invites").where("uid", "==", uid).get(),
    // Everything they wrote in group chats and task threads (needs the collection group
    // index on messages.uid in firestore.indexes.json)
    db.collectionGroup("messages").where("uid", "==", uid).get(),
  ]);

  const roleRefs = new Map([...memberOf.docs, ...pendingIn.docs].map((d) => [d.id, d.ref]));
  const writes: Promise<unknown>[] = [
    ...[...roleRefs.values()].map((ref) =>
      ref.update({
        members: FieldValue.arrayRemove(uid),
        pendingRequests: FieldValue.arrayRemove(uid),
        instructors: FieldValue.arrayRemove(uid),
      }),
    ),
    // Requests are deleted without a status, so nobody is notified about them
    ...[...tasks.docs, ...submitted.docs, ...requests.docs, ...invites.docs, ...messages.docs].map((d) => d.ref.delete()),
    db.doc(`chatLimits/${uid}`).delete(),
    db.doc("admins/instructors").update({ ids: FieldValue.arrayRemove(uid) }).catch(() => {}),
    getStorage().bucket().file(`profilePictures/${uid}`).delete().catch(() => {}),
  ];
  const results = await Promise.allSettled(writes);
  results.forEach((r) => {
    if (r.status === "rejected") logger.warn(`Cleanup step failed for uid ${uid}:`, r.reason);
  });

  // The profile last (with its devices subcollection), once nothing points at it
  await db.recursiveDelete(db.doc(`users/${uid}`));
  logger.info(`Cleaned up deleted account ${uid} (${roleRefs.size} role(s), ${tasks.size + submitted.size} task(s))`);
}

/** Runs whenever an account is deleted, from the apps or the Firebase console. */
export const cleanUpDeletedAccount = functionsV1.auth.user().onDelete(async (user) => {
  await purgeUserData(user.uid);
});

/**
 * Admins only: clears what's left of an account that no longer exists (e.g.
 * deleted before cleanUpDeletedAccount was deployed). Refuses if the person can
 * still sign in, so it can't be used to wipe a live account.
 */
export const purgeDeletedAccount = onCall({ invoker: "public" }, async (request) => {
  const caller = request.auth?.uid;
  if (!caller) throw new HttpsError("unauthenticated", "Sign in first.");
  const admins: string[] = (await getFirestore().doc("admins/all-perms").get()).data()?.ids ?? [];
  if (!admins.includes(caller)) throw new HttpsError("permission-denied", "Only admins can do this.");

  const uid = typeof request.data?.uid === "string" ? request.data.uid : "";
  if (!uid) throw new HttpsError("invalid-argument", "No user given.");
  if (admins.includes(uid)) throw new HttpsError("failed-precondition", "Admins can't be removed this way.");

  const stillExists = await getAuth().getUser(uid).then(() => true, (err: { code?: string }) => {
    if (err.code === "auth/user-not-found") return false;
    throw err;
  });
  if (stillExists) {
    throw new HttpsError("failed-precondition", "This person still has an account, so their data was left alone.");
  }

  await purgeUserData(uid);
  return { removed: true };
});
