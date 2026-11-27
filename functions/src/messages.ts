// Role messaging: a role's group chat (roles/{roleId}/messages) and each task's
// thread between the person doing it and whoever gave it (tasks/{taskId}/messages).
// Both are off until the role's owner or an admin turns them on in its Config.
//
// New messages are sent as iOS push notifications only, never by email, to people
// who have push on and haven't switched off this kind or this role.

import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { notify } from "./notifications";

/** The message as a notification line, e.g. "Sam: Is this due Friday?" */
function preview(data: FirebaseFirestore.DocumentData): string {
  const text = String(data.text ?? "").replace(/\s+/g, " ").trim();
  const short = text.length > 140 ? `${text.slice(0, 139)}…` : text;
  return `${data.name || "Someone"}: ${short}`;
}

/** Tells everyone else in the role about a new group chat message. */
export const notifyOnRoleMessage = onDocumentCreated("roles/{roleId}/messages/{messageId}", async (event) => {
  const msg = event.data?.data();
  if (!msg) return;
  const roleId = event.params.roleId;
  const role = (await getFirestore().doc(`roles/${roleId}`).get()).data();
  if (!role || role.chatEnabled !== true) return;

  const others = ((role.members ?? []) as string[]).filter((uid) => uid !== msg.uid);
  const results = await Promise.allSettled(others.map((uid) =>
    notify(uid, "roleChat", { title: role.name || "Group chat", body: preview(msg), path: `/chat/${roleId}` }, roleId, { pushOnly: true })
  ));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) logger.error(`${failed} group chat notification(s) failed in role ${roleId}`);
});

/**
 * A new message on a task's thread: counts it on the task (for the unread dot on
 * its card) and tells the other side.
 */
export const notifyOnTaskMessage = onDocumentCreated("tasks/{taskId}/messages/{messageId}", async (event) => {
  const msg = event.data?.data();
  if (!msg) return;
  const db = getFirestore();
  const taskRef = db.doc(`tasks/${event.params.taskId}`);
  const task = (await taskRef.get()).data();
  if (!task) return;

  await taskRef.update({
    messageCount: FieldValue.increment(1),
    lastMessageAt: msg.createdAt ?? FieldValue.serverTimestamp(),
    lastMessageBy: msg.uid,
  });

  // The person doing it hears from whoever gave it, and the other way round. Older
  // tasks don't record who gave them, so their questions go to the role's instructors.
  let recipients: string[];
  if (msg.uid !== task.assignedTo) {
    recipients = [task.assignedTo];
  } else if (task.assignedBy) {
    recipients = [task.assignedBy];
  } else {
    const role = (await db.doc(`roles/${task.roleId}`).get()).data();
    recipients = (role?.instructors ?? []) as string[];
  }
  const path = `/thread/${event.params.taskId}`;
  await Promise.allSettled(recipients.filter((uid) => uid && uid !== msg.uid).map((uid) =>
    notify(uid, "taskThread", { title: `About "${task.title}"`, body: preview(msg), path }, task.roleId, { pushOnly: true })
  ));
});

/** A deleted task or role takes its messages with it. */
export const deleteTaskMessages = onDocumentDeleted("tasks/{taskId}", async (event) => {
  await getFirestore().recursiveDelete(getFirestore().collection(`tasks/${event.params.taskId}/messages`));
});

export const deleteRoleMessages = onDocumentDeleted("roles/{roleId}", async (event) => {
  await getFirestore().recursiveDelete(getFirestore().collection(`roles/${event.params.roleId}/messages`));
});

/**
 * A reassigned task starts a fresh thread, so the new person doesn't see what was
 * said with the last one.
 */
export const clearThreadOnReassign = onDocumentUpdated("tasks/{taskId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.assignedTo === after.assignedTo) return;
  const db = getFirestore();
  await db.recursiveDelete(db.collection(`tasks/${event.params.taskId}/messages`));
  await event.data!.after.ref.update({
    messageCount: FieldValue.delete(),
    lastMessageAt: FieldValue.delete(),
    lastMessageBy: FieldValue.delete(),
  });
});
