// Emails admins about every new bug report and feature request, for the admins
// who turned that on in Settings > App (users/{uid}.notifications.feedbackEmails).

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { getFirestore } from "firebase-admin/firestore";
import * as nodemailer from "nodemailer";
import { gmailAppPassword, gmailCredentials, gmailUser } from "./secrets";

const SITE = "https://stemup.web.app";

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const notifyAdminsOnFeedback = onDocumentCreated(
  { document: "bugs/{bugId}", secrets: [gmailUser, gmailAppPassword] },
  async (event) => {
    const report = event.data?.data();
    if (!report) return;

    const db = getFirestore();
    const adminIds: string[] = (await db.doc("admins/all-perms").get()).data()?.ids ?? [];
    if (adminIds.length === 0) return;

    const adminDocs = await Promise.all(adminIds.map((id) => db.doc(`users/${id}`).get()));
    const emails = adminDocs
      .filter((d) => d.data()?.notifications?.feedbackEmails === true)
      .map((d) => d.data()?.email as string | undefined)
      .filter((e): e is string => !!e);
    if (emails.length === 0) return;

    const isFeature = report.type === "feature";
    const kind = isFeature ? "Feature request" : "Bug report";
    const title = String(report.bugTitle ?? "").slice(0, 150);
    const desc = String(report.bugDesc ?? "").slice(0, 4000);
    const from = String(report.userEmail ?? "") || "a member";
    const footer = "You're getting this because new bug and feature emails are on. Turn them off in StemUP under Settings > App.";

    const creds = gmailCredentials();
    await nodemailer.createTransport({ service: "gmail", auth: creds }).sendMail({
      from: `StemUP <${creds.user}>`,
      // Admins don't see each other's addresses
      bcc: emails.join(","),
      subject: `${kind}: ${title}`,
      text: `${kind} from ${from}\n\n${title}\n\n${desc}\n\nOpen StemUP: ${SITE}/settings/app\n\n${footer}`,
      html:
        `<p><strong>${esc(kind)}</strong> from ${esc(from)}</p>` +
        `<p><strong>${esc(title)}</strong></p>` +
        `<p style="white-space:pre-wrap">${esc(desc)}</p>` +
        `<p><a href="${SITE}/settings/app">Open StemUP</a></p>` +
        `<p style="color:#9ca3af;font-size:12px">${esc(footer)}</p>`,
    });

    logger.info(`Emailed ${emails.length} admin(s) about a new ${isFeature ? "feature request" : "bug report"}`);
  }
);
