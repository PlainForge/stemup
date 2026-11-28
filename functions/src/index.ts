import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { gmailUser, gmailAppPassword, gmailCredentials } from "./secrets";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as nodemailer from "nodemailer";

initializeApp();

/**
 * Emails every admin, and the role's instructors, whenever a member submits a
 * task for approval.
 */
export const notifyAdminsOnTaskSubmission = onDocumentCreated(
  {
    document: "tasksSubmitted/{taskId}",
    secrets: [gmailUser, gmailAppPassword],
  },
  async (event) => {
    const submission = event.data?.data();
    if (!submission) return;

    const db = getFirestore();

    const [adminsSnap, instructorsSnap, roleSnap] = await Promise.all([
      db.doc("admins/all-perms").get(),
      db.doc("admins/instructors").get(),
      submission.roleId ? db.doc(`roles/${submission.roleId}`).get() : Promise.resolve(null),
    ]);
    const adminIds: string[] = adminsSnap.data()?.ids ?? [];
    // Only people who still have Instructor access count as the role's instructors
    const instructorIds: string[] = instructorsSnap.data()?.ids ?? [];
    const roleInstructors: string[] = ((roleSnap?.data()?.instructors as string[] | undefined) ?? [])
      .filter((id) => instructorIds.includes(id));
    const recipientIds = Array.from(new Set([...adminIds, ...roleInstructors]));
    if (recipientIds.length === 0) return;

    const recipientDocs = await Promise.all(recipientIds.map((id) => db.doc(`users/${id}`).get()));

    const adminEmails = recipientDocs
      // Leave out anyone who turned off notifications for this role
      .filter((d) => d.data()?.notifications?.roles?.[submission.roleId] !== false)
      .map((d) => d.data()?.email as string | undefined)
      .filter((email): email is string => !!email);

    if (adminEmails.length === 0) {
      logger.warn("No admin or instructor emails found; skipping task submission notification");
      return;
    }

    const roleName = roleSnap?.exists ? (roleSnap.data()?.name as string) : "Unknown role";

    const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: gmailCredentials(),
    });

    await transporter.sendMail({
      from: `StemUP <${gmailCredentials().user}>`,
      to: adminEmails.join(","),
      subject: `New task submission: ${submission.title}`,
      text:
        `${submission.assignedName} submitted "${submission.title}" (${submission.points} pts, ${roleName}) for approval.\n\n` +
        `${submission.description ? `Description: ${submission.description}\n\n` : ""}` +
        `Review it in the app under that role's Tasks tab.`,
      html:
        `<p><strong>${esc(submission.assignedName)}</strong> submitted <strong>${esc(submission.title)}</strong> ` +
        `(${esc(submission.points)} pts, ${esc(roleName)}) for approval.</p>` +
        (submission.description ? `<p>${esc(submission.description)}</p>` : "") +
        `<p>Review it in the app under that role's Tasks tab.</p>`,
    });

    logger.info(`Notified ${adminEmails.length} admin(s)/instructor(s) of task submission "${submission.title}"`);
  }
);

export { sendVerificationEmail, sendPasswordResetEmail, requestEmailChange } from "./authEmails";
export { checkName, cleanProfileName } from "./nameFilter";
export { cleanUpDeletedAccount, purgeDeletedAccount } from "./accountCleanup";
export { notifyOnTaskChange, notifyOnJoinDecision, notifyOnRequestDecision, notifyOnRoleRequest, notifyOnInvite, removeDevicesOnUserDelete } from "./notifications";
export { respondToInvite, countTaskGiven } from "./invites";
export { notifyAdminsOnFeedback } from "./feedback";
export { leaveInstructor } from "./leaveInstructor";
export { notifyOnRoleMessage, trimRoleChat, notifyOnTaskMessage, deleteTaskMessages, deleteRoleMessages, clearThreadOnReassign } from "./messages";
