// Invitations to join a role, in invites/{roleId}_{uid}. A role's instructors
// and admins send them from the app (the Firestore rules check who can); the
// person invited accepts or declines here. Accepting runs on the server because
// the rules don't let anyone add themselves to a role or edit their own role list.
//
// Also keeps each instructor's "tasks given" count (users/{uid}.tasksGiven),
// which only the server writes.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/** Accepts or declines the signed-in person's invitation to [roleId]. */
export const respondToInvite = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in again.");
  const { roleId, accept } = (request.data ?? {}) as { roleId?: unknown; accept?: unknown };
  if (typeof roleId !== "string" || !roleId || roleId.includes("/")) {
    throw new HttpsError("invalid-argument", "Which role is this for?");
  }

  const db = getFirestore();
  const inviteRef = db.doc(`invites/${roleId}_${uid}`);
  const invite = await inviteRef.get();
  if (!invite.exists) throw new HttpsError("not-found", "This invitation is no longer open.");

  if (accept !== true) {
    await inviteRef.delete();
    return { joined: false };
  }

  const roleRef = db.doc(`roles/${roleId}`);
  const userRef = db.doc(`users/${uid}`);
  const [role, user, instructorsDoc] = await Promise.all([roleRef.get(), userRef.get(), db.doc("admins/instructors").get()]);
  if (!role.exists) {
    await inviteRef.delete();
    throw new HttpsError("not-found", "This role no longer exists.");
  }
  if (!user.exists) throw new HttpsError("failed-precondition", "Your profile couldn't be found.");

  // An instructor invitation only counts while they still have Instructor access
  const isInstructor = ((instructorsDoc.get("ids") ?? []) as string[]).includes(uid);
  const asInstructor = invite.get("as") === "instructor" && isInstructor;
  const roleName = (role.get("name") as string | undefined) ?? "";

  await roleRef.update({
    members: FieldValue.arrayUnion(uid),
    pendingRequests: FieldValue.arrayRemove(uid),
    ...(asInstructor ? { instructors: FieldValue.arrayUnion(uid) } : {}),
  });

  const roles = (Array.isArray(user.get("roles")) ? user.get("roles") : []) as { id?: string }[];
  const userUpdate: Record<string, unknown> = {};
  if (!roles.some((r) => r.id === roleId)) {
    userUpdate.roles = FieldValue.arrayUnion({ id: roleId, name: roleName, points: 0, taskCompleted: 0 });
  }
  if (!user.get("currentRole")) userUpdate.currentRole = roleId;
  if (Object.keys(userUpdate).length > 0) await userRef.update(userUpdate);

  await inviteRef.delete();
  logger.info(`${uid} accepted an invitation to ${roleId}${asInstructor ? " as an instructor" : ""}`);
  return { joined: true, asInstructor };
});

/** Counts each task an instructor or admin gives (tasks record who gave them in `assignedBy`). */
export const countTaskGiven = onDocumentCreated("tasks/{taskId}", async (event) => {
  const by = event.data?.get("assignedBy");
  if (typeof by !== "string" || !by) return;
  await getFirestore().doc(`users/${by}`).update({ tasksGiven: FieldValue.increment(1) }).catch((err) => {
    logger.warn(`Couldn't count a task given by ${by}`, err);
  });
});
