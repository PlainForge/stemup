// Tells members about things that happen to them: a new task, a change to one
// of their tasks, and decisions on what they asked for (task submissions,
// extensions, joining a role, Instructor access, new roles and role resets).
//
// Everything is worked out here from database changes, so it works the same
// whether the instructor or admin used the web app or the iOS app.
//
// Each person chooses in Settings how they hear about it, stored on their
// profile as `notifications`:
//   push   iOS push notifications (off unless turned on in the iOS app)
//   email  emails to their account address (off unless turned on)
//   types  per-kind switches, e.g. { newTask: false }; a missing kind is on
//   roles  per-role switches, e.g. { abc123: false }, from a role's Notifications tab
// Push tokens live in users/{uid}/devices/{token}, one per signed-in phone.

import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { getFirestore, type DocumentData, type Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import * as nodemailer from "nodemailer";
import { gmailAppPassword, gmailCredentials, gmailUser } from "./secrets";

/** Kept in sync with NOTIFICATION_TYPES in src/myDataTypes.ts and NotifyType in mobile/lib/models/models.dart. */
export type NotifyType = "newTask" | "taskEdited" | "taskReviewed" | "extension" | "joinRole" | "accessRequest" | "invite";

type Message = { title: string; body: string; /** App path to open, e.g. /roles/abc */ path: string };

const SITE = "https://stemup.web.app";
const secrets = [gmailUser, gmailAppPassword];

// FCM errors that mean the token will never work again
const DEAD_TOKEN = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function sendPush(uid: string, msg: Message) {
  const devices = (await getFirestore().collection(`users/${uid}/devices`).get()).docs
    .map((d) => ({ ref: d.ref, token: d.get("token") as string | undefined }))
    .filter((d): d is { ref: FirebaseFirestore.DocumentReference; token: string } => !!d.token);
  if (devices.length === 0) return;

  const res = await getMessaging().sendEachForMulticast({
    tokens: devices.map((d) => d.token),
    notification: { title: msg.title, body: msg.body },
    data: { path: msg.path },
    apns: { payload: { aps: { sound: "default" } } },
  });
  await Promise.all(
    res.responses.map((r, i) => (!r.success && DEAD_TOKEN.has(r.error?.code ?? "") ? devices[i].ref.delete() : null))
  );
}

async function sendEmail(to: string, msg: Message) {
  const creds = gmailCredentials();
  const link = `${SITE}${msg.path}`;
  const footer = "You're getting this because email notifications are on. You can turn them off in StemUP under Settings > Notifications.";
  await nodemailer.createTransport({ service: "gmail", auth: creds }).sendMail({
    from: `StemUP <${creds.user}>`,
    to,
    subject: msg.title,
    text: `${msg.body}\n\nOpen StemUP: ${link}\n\n${footer}`,
    html:
      `<p>${esc(msg.body)}</p>` +
      `<p><a href="${esc(link)}">Open StemUP</a></p>` +
      `<p style="color:#9ca3af;font-size:12px">${esc(footer)}</p>`,
  });
}

/**
 * Sends [msg] to [uid] the ways they've turned on, unless they've switched off
 * this kind, or turned off notifications for [roleId] (the role it's about).
 */
export async function notify(uid: string, type: NotifyType, msg: Message, roleId?: unknown) {
  if (!uid) return;
  const snap = await getFirestore().doc(`users/${uid}`).get();
  if (!snap.exists) return;
  const prefs = (snap.get("notifications") ?? {}) as {
    push?: boolean; email?: boolean; types?: Record<string, boolean>; roles?: Record<string, boolean>;
  };
  if (prefs.types?.[type] === false) return;
  if (typeof roleId === "string" && roleId && prefs.roles?.[roleId] === false) return;

  const email = snap.get("email") as string | undefined;
  const jobs: Promise<unknown>[] = [];
  if (prefs.push === true) jobs.push(sendPush(uid, msg));
  if (prefs.email === true && email) jobs.push(sendEmail(email, msg));

  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === "rejected") logger.error(`Couldn't send a ${type} notification to ${uid}`, r.reason);
  }
}

async function roleName(roleId: unknown): Promise<string> {
  if (typeof roleId !== "string" || !roleId) return "your role";
  const snap = await getFirestore().doc(`roles/${roleId}`).get();
  return (snap.get("name") as string | undefined) ?? "your role";
}

const millis = (t: unknown) => (t as Timestamp | undefined)?.toMillis?.() ?? null;
const dueText = (t: unknown) => {
  const ms = millis(t);
  return ms === null ? "" : new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
};
const pts = (n: unknown) => `${Number(n) || 0} pt${Number(n) === 1 ? "" : "s"}`;

/** What changed on a task, from the member's point of view. */
export function taskNotice(before: DocumentData | undefined, after: DocumentData, role: string): [NotifyType, Message] | null {
  const path = `/roles/${after.roleId}`;
  const title = `"${after.title}"`;
  const due = dueText(after.dueDate);

  if (!before || before.assignedTo !== after.assignedTo) {
    return ["newTask", {
      title: `New task in ${role}`,
      body: `${title} (${pts(after.points)})${due ? `, due ${due}` : ""}.`,
      path,
    }];
  }

  const declined = (after.declineCount ?? 0) > (before.declineCount ?? 0);
  if (declined) {
    return ["taskReviewed", after.declineCount >= 3
      ? { title: "Task closed", body: `${title} in ${role} was declined a third time, so it's now closed.`, path }
      : { title: "Submission declined", body: `${title} in ${role} was sent back. Make your changes and submit it again.`, path }];
  }
  if (!before.complete && after.complete) {
    return ["taskReviewed", { title: "Task approved", body: `${title} in ${role} was approved. You earned ${pts(after.points)}.`, path }];
  }

  const extensionAnswered = before.extensionRequested === true && after.extensionRequested !== true;
  if (extensionAnswered && after.extensionDeclined === true && before.extensionDeclined !== true) {
    return ["extension", { title: "Extension declined", body: `Your extension request for ${title} in ${role} was declined.`, path }];
  }
  if (extensionAnswered && millis(after.dueDate) !== millis(before.dueDate)) {
    return ["extension", {
      title: "Extension approved",
      body: `${title} in ${role} is now due ${due} and is worth ${pts(after.points)}.`,
      path,
    }];
  }

  if (after.complete) return null;
  const changed = [
    before.title !== after.title && "title",
    before.description !== after.description && "description",
    before.points !== after.points && "points",
    millis(before.dueDate) !== millis(after.dueDate) && "due date",
  ].filter(Boolean) as string[];
  if (changed.length === 0) return null;
  const list = changed.length === 1 ? changed[0] : `${changed.slice(0, -1).join(", ")} and ${changed[changed.length - 1]}`;
  return ["taskEdited", { title: "Task updated", body: `The ${list} of ${title} in ${role} changed.`, path }];
}

/** New tasks, edits by an instructor, and decisions on submissions and extensions. */
export const notifyOnTaskChange = onDocumentWritten({ document: "tasks/{taskId}", secrets }, async (event) => {
  const before = event.data?.before.exists ? event.data.before.data() : undefined;
  const after = event.data?.after.exists ? event.data.after.data() : undefined;
  if (!after) return;
  const notice = taskNotice(before, after, await roleName(after.roleId));
  if (notice) await notify(after.assignedTo, notice[0], notice[1], after.roleId);
});

/** Join requests: approved if they became a member, declined otherwise. */
export const notifyOnJoinDecision = onDocumentUpdated({ document: "roles/{roleId}", secrets }, async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  const stillPending: string[] = after.pendingRequests ?? [];
  const settled = ((before.pendingRequests ?? []) as string[]).filter((uid) => !stillPending.includes(uid));
  if (settled.length === 0) return;

  const ref = event.data!.after.ref;
  const path = `/roles/${event.params.roleId}`;
  await Promise.all(settled.map(async (uid) => {
    let member = ((after.members ?? []) as string[]).includes(uid);
    if (!member) {
      // Older app versions accept in two steps (clear the request, then add the
      // member), so give the second write a moment before calling it a decline
      await new Promise((r) => setTimeout(r, 5000));
      member = (((await ref.get()).get("members") ?? []) as string[]).includes(uid);
    }
    await notify(uid, "joinRole", member
      ? { title: "Request accepted", body: `You're now a member of ${after.name}.`, path }
      : { title: "Request declined", body: `Your request to join ${after.name} was declined.`, path: "/roles" },
    event.params.roleId);
  }));
});

/**
 * Decisions on Instructor, new role and role reset requests. Admins mark a
 * request approved or declined just before removing it; a request the person
 * withdrew themselves has no status, so nothing is sent.
 */
export const notifyOnRequestDecision = onDocumentDeleted({ document: "requests/{requestId}", secrets }, async (event) => {
  const req = event.data?.data();
  const status = req?.status;
  if (!req || (status !== "approved" && status !== "declined")) return;
  const ok = status === "approved";

  const msg: Message | null = (() => {
    switch (req.type) {
      case "instructor":
        return ok
          ? { title: "You're an Instructor", body: "Your request was approved. You can now request new roles and run the roles you're given.", path: "/settings/access" }
          : { title: "Instructor request declined", body: "Your request to become an Instructor was declined.", path: "/settings/access" };
      case "createRole":
        return ok
          ? { title: "Role created", body: `Your new role "${req.roleName}" was approved. You're its instructor.`, path: "/roles" }
          : { title: "Role request declined", body: `Your request to create "${req.roleName}" was declined.`, path: "/roles" };
      case "resetRole":
        return ok
          ? { title: "Role reset", body: `${req.roleName} was reset. Its leaderboard is saved as "${req.saveName}" on the Saved Data tab.`, path: `/roles/${req.roleId}` }
          : { title: "Reset declined", body: `Your request to reset ${req.roleName} was declined.`, path: `/roles/${req.roleId}` };
      default: {
        const action = roleChangeAction(req);
        if (!action) return null;
        return {
          title: ok ? "Request approved" : "Request declined",
          body: `Your request to ${action} was ${ok ? "approved" : "declined"}.`,
          path: `/instructor/roles/${req.roleId}`,
        };
      }
    }
  })();
  if (msg) await notify(req.uid, "accessRequest", msg, req.roleId);
});

/** What a role change request asks for (kept in sync with roleChangeAction in src/lib/roleService.ts). */
function roleChangeAction(req: DocumentData): string | null {
  const role = req.roleName || "the role";
  switch (req.type) {
    case "resetRole": return `reset ${role}`;
    case "renameRole": return `rename ${role} to "${req.newName}"`;
    case "editStats": return `change ${req.targetName || "a member"}'s stats in ${role}`;
    case "kickMember": return `remove ${req.targetName || "a member"} from ${role}`;
    case "rewardsTitle": return `change the rewards title of ${role}`;
    default: return null;
  }
}

/**
 * A role's instructors ask its owner for bigger changes; tell the owner one is
 * waiting. Roles without an owner send these to admins, who see them on the Admin page.
 */
export const notifyOnRoleRequest = onDocumentCreated({ document: "requests/{requestId}", secrets }, async (event) => {
  const req = event.data?.data();
  const action = req ? roleChangeAction(req) : null;
  if (!req || !action || typeof req.roleId !== "string" || !req.roleId) return;
  const role = (await getFirestore().doc(`roles/${req.roleId}`).get()).data();
  if (!role) return;
  const owner: string = role.owner ?? role.createdBy ?? "";
  // An owner who no longer runs the role doesn't count, and nobody needs telling about their own request
  if (!owner || !((role.instructors ?? []) as string[]).includes(owner) || owner === req.uid) return;
  await notify(owner, "accessRequest", {
    title: `Request in ${role.name}`,
    body: `${req.userName || "An instructor"} wants to ${action}.`,
    path: `/instructor/roles/${req.roleId}?tab=requests`,
  }, req.roleId);
});

/** An invitation to join a role (sent by its instructors or an admin). */
export const notifyOnInvite = onDocumentCreated({ document: "invites/{inviteId}", secrets }, async (event) => {
  const inv = event.data?.data();
  if (!inv || typeof inv.uid !== "string") return;
  const role = inv.roleName || "a role";
  await notify(inv.uid, "invite", {
    title: `Invitation to ${role}`,
    body: `${inv.invitedByName || "An instructor"} invited you to join ${role} as ${inv.as === "instructor" ? "an instructor" : "a member"}. Accept or decline it on the Roles page.`,
    path: "/roles",
  });
});

/** A deleted (or archived) profile takes its push tokens with it. */
export const removeDevicesOnUserDelete = onDocumentDeleted("users/{uid}", async (event) => {
  await getFirestore().recursiveDelete(getFirestore().collection(`users/${event.params.uid}/devices`));
});
