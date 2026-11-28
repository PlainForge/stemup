// Role messaging: a role's group chat (roles/{roleId}/messages) and each task's
// thread between the person doing it and whoever gave it (tasks/{taskId}/messages).
// Both are off until the role's owner or an admin turns them on in its Config.
//
// New messages are sent as iOS push notifications only, never by email, to people
// who have push on and haven't switched off this kind or this role.
//
// Every message goes through sendMessage below (the Firestore rules don't let the
// apps write messages themselves), so the same two rules hold on every platform:
//   - profanity is kept but masked with asterisks ("what the ****")
//   - more than 5 messages in 10 seconds puts the sender in a 30-second timeout,
//     across all their chats and threads (tracked in chatLimits/{uid})

import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { TextCensor, asteriskCensorStrategy } from "obscenity";
import { matcher } from "./nameFilter";
import { notify } from "./notifications";

/** Longest message (kept in sync with MAX_MESSAGE in src/lib/messages.ts). */
const MAX_MESSAGE = 2000;
/** More than MAX_BURST messages within BURST_WINDOW_MS starts a TIMEOUT_MS timeout. */
const MAX_BURST = 5;
const BURST_WINDOW_MS = 10_000;
const TIMEOUT_MS = 30_000;

const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

/** The text with any profanity replaced by asterisks, letter for letter. */
export function maskProfanity(text: string): string {
  const matches = matcher.getAllMatches(text);
  return matches.length === 0 ? text : censor.applyTo(text, matches);
}

const timeoutError = (until: number) =>
  new HttpsError("resource-exhausted", "You're sending messages too fast. Please wait a moment.", { until });

/**
 * Sends a message to a role's group chat ({ kind: "role", id: roleId }) or a
 * task's thread ({ kind: "task", id: taskId }), after the same checks the rules
 * used to make, masking profanity and applying the timeout.
 */
export const sendMessage = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in again.");
  const { kind, id, text } = (request.data ?? {}) as { kind?: unknown; id?: unknown; text?: unknown };
  if ((kind !== "role" && kind !== "task") || typeof id !== "string" || !id || id.includes("/")) {
    throw new HttpsError("invalid-argument", "That chat doesn't exist.");
  }
  const clean = typeof text === "string" ? text.trim() : "";
  if (!clean) throw new HttpsError("invalid-argument", "Type a message first.");
  if (clean.length > MAX_MESSAGE) throw new HttpsError("invalid-argument", `Messages can be ${MAX_MESSAGE} characters at most.`);

  const db = getFirestore();
  // Everything it needs to read, all at once (a task's role has to wait for the task)
  const [adminSnap, instructorSnap, userSnap, parentSnap] = await Promise.all([
    db.doc("admins/all-perms").get(),
    db.doc("admins/instructors").get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`${kind === "role" ? "roles" : "tasks"}/${id}`).get(),
  ]);
  const isAdmin = ((adminSnap.get("ids") ?? []) as string[]).includes(uid);
  const isInstructor = ((instructorSnap.get("ids") ?? []) as string[]).includes(uid);

  // Who may write where (the same people who can read it, per firestore.rules)
  let target: FirebaseFirestore.CollectionReference;
  if (kind === "role") {
    const role = parentSnap.data();
    if (!role) throw new HttpsError("not-found", "This role no longer exists.");
    if (!isAdmin && !((role.members ?? []) as string[]).includes(uid)) throw new HttpsError("permission-denied", "You're not in this role.");
    if (role.chatEnabled !== true) throw new HttpsError("failed-precondition", "The group chat is turned off.");
    target = db.collection(`roles/${id}/messages`);
  } else {
    const task = parentSnap.data();
    if (!task) throw new HttpsError("not-found", "This task no longer exists.");
    const role = (await db.doc(`roles/${task.roleId}`).get()).data();
    const runsRole = isAdmin || (isInstructor && ((role?.instructors ?? []) as string[]).includes(uid));
    const inThread = uid === task.assignedTo || (task.assignedBy ? task.assignedBy === uid : runsRole);
    if (!inThread) throw new HttpsError("permission-denied", "Only the person doing this task and whoever gave it can write here.");
    if (role?.taskThreadsEnabled !== true) throw new HttpsError("failed-precondition", "Task questions are turned off in this role.");
    target = db.collection(`tasks/${id}/messages`);
  }

  // Timeout: more than MAX_BURST messages in BURST_WINDOW_MS, across every chat and thread
  const limitRef = db.doc(`chatLimits/${uid}`);
  const timedOutUntil = await db.runTransaction(async (tx) => {
    const data = (await tx.get(limitRef)).data() ?? {};
    const now = Date.now();
    if (typeof data.until === "number" && data.until > now) return data.until as number;
    const recent = ((data.sent ?? []) as number[]).filter((t) => now - t < BURST_WINDOW_MS);
    if (recent.length >= MAX_BURST) {
      const until = now + TIMEOUT_MS;
      tx.set(limitRef, { sent: [], until });
      return until;
    }
    tx.set(limitRef, { sent: [...recent, now], until: 0 });
    return 0;
  });
  if (timedOutUntil) throw timeoutError(timedOutUntil);

  const user = userSnap.data() ?? {};
  const ref = await target.add({
    uid,
    name: (user.name as string | undefined) || "Unknown User",
    ...(user.photoURL ? { photoURL: user.photoURL } : {}),
    text: maskProfanity(clean),
    createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});

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
  if (!role || role.chatEnabled !== true) {
    logger.info(`No group chat notifications for role ${roleId}: ${role ? "the chat is turned off" : "the role is gone"}`);
    return;
  }

  const others = ((role.members ?? []) as string[]).filter((uid) => uid !== msg.uid);
  logger.info(`Group chat message in role ${roleId}: notifying ${others.length} member(s)`);
  const results = await Promise.allSettled(others.map((uid) =>
    notify(uid, "roleChat", { title: role.name || "Group chat", body: preview(msg), path: `/chat/${roleId}` }, roleId, { pushOnly: true })
  ));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) logger.error(`${failed} group chat notification(s) failed in role ${roleId}`);
});

/**
 * Most messages a role's group chat keeps; past this, the oldest are deleted.
 * A message is a few hundred bytes, so 2,000 is well under 1 MB per role, and
 * the apps only ever load the latest 200, so a longer history costs no extra reads.
 */
const MAX_CHAT_MESSAGES = 2000;

/** Keeps each group chat to its latest MAX_CHAT_MESSAGES messages. */
export const trimRoleChat = onDocumentCreated("roles/{roleId}/messages/{messageId}", async (event) => {
  const chat = getFirestore().collection(`roles/${event.params.roleId}/messages`);
  // A count query costs one read per 1,000 messages, not one per message
  const total = (await chat.count().get()).data().count;
  const extra = total - MAX_CHAT_MESSAGES;
  if (extra <= 0) return;
  const oldest = await chat.orderBy("createdAt", "asc").limit(extra).get();
  const writer = getFirestore().bulkWriter();
  oldest.docs.forEach((d) => writer.delete(d.ref));
  await writer.close();
  logger.info(`Trimmed ${oldest.size} old message(s) from the group chat of role ${event.params.roleId}`);
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
