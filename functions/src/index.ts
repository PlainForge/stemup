import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as nodemailer from "nodemailer";

initializeApp();

const gmailUser = defineSecret("GMAIL_USER");
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");

/**
 * Emails every admin whenever a member submits a task for approval.
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

    const adminsSnap = await db.doc("admins/all-perms").get();
    const adminIds: string[] = adminsSnap.data()?.ids ?? [];
    if (adminIds.length === 0) return;

    const [adminDocs, roleSnap] = await Promise.all([
      Promise.all(adminIds.map((id) => db.doc(`users/${id}`).get())),
      submission.roleId ? db.doc(`roles/${submission.roleId}`).get() : Promise.resolve(null),
    ]);

    const adminEmails = adminDocs
      .map((d) => d.data()?.email as string | undefined)
      .filter((email): email is string => !!email);

    if (adminEmails.length === 0) {
      logger.warn("No admin emails found; skipping task submission notification");
      return;
    }

    const roleName = roleSnap?.exists ? (roleSnap.data()?.name as string) : "Unknown role";

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser.value(),
        pass: gmailAppPassword.value(),
      },
    });

    await transporter.sendMail({
      from: `StemUP <${gmailUser.value()}>`,
      to: adminEmails.join(","),
      subject: `New task submission: ${submission.title}`,
      text:
        `${submission.assignedName} submitted "${submission.title}" (${submission.points} pts, ${roleName}) for approval.\n\n` +
        `${submission.description ? `Description: ${submission.description}\n\n` : ""}` +
        `Review it in the app under that role's Tasks tab.`,
      html:
        `<p><strong>${submission.assignedName}</strong> submitted <strong>${submission.title}</strong> ` +
        `(${submission.points} pts, ${roleName}) for approval.</p>` +
        (submission.description ? `<p>${submission.description}</p>` : "") +
        `<p>Review it in the app under that role's Tasks tab.</p>`,
    });

    logger.info(`Notified ${adminEmails.length} admin(s) of task submission "${submission.title}"`);
  }
);
