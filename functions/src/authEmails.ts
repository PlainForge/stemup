// Verification and password-reset emails sent from StemUp's own Gmail account.
//
// Firebase's built-in emails come from noreply@<project>.firebaseapp.com, which
// Yahoo (and some school inboxes) silently drop. Generating the same action
// links with the Admin SDK and sending them through Gmail gets them delivered.
// The apps fall back to Firebase's built-in email if these functions fail.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { createHash } from "crypto";
import * as nodemailer from "nodemailer";
import { gmailUser, gmailAppPassword, gmailCredentials } from "./secrets";


/** Minimum time between emails to the same account, so nobody can spam an inbox. */
const COOLDOWN_MS = 60 * 1000;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Records a send for [key]. Throws resource-exhausted if the previous send was
 * under a minute ago (the apps show "please wait a minute").
 */
async function claimCooldown(key: string) {
  const ref = getFirestore().doc(`emailThrottle/${key}`);
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const last = (snap.data()?.lastSent as Timestamp | undefined)?.toMillis() ?? 0;
    if (Date.now() - last < COOLDOWN_MS) {
      throw new HttpsError("resource-exhausted", "Please wait a minute before requesting another email.");
    }
    tx.set(ref, { lastSent: Timestamp.now() });
  });
}

async function sendEmail(to: string, subject: string, heading: string, intro: string, buttonLabel: string, link: string, footer: string) {
  try {
    await deliver(to, subject, heading, intro, buttonLabel, link, footer);
  } catch (err) {
    // Usually a wrong GMAIL_APP_PASSWORD secret. "unavailable" makes the apps
    // fall back to Firebase's built-in email instead of showing an error.
    // Never log the password itself; its length (16 for an app password) is enough to spot a wrong secret
    const { user, pass } = gmailCredentials();
    logger.error(`Gmail send failed as ${user} (password length ${pass.length}; an app password is 16). Check the GMAIL_USER / GMAIL_APP_PASSWORD secrets:`, err);
    throw new HttpsError("unavailable", "Email service unavailable.");
  }
}

async function deliver(to: string, subject: string, heading: string, intro: string, buttonLabel: string, link: string, footer: string) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: gmailCredentials(),
  });
  await transporter.sendMail({
    from: `StemUp <${gmailCredentials().user}>`,
    to,
    subject,
    text: `${heading}\n\n${intro}\n\n${link}\n\n${footer}\n\n- The StemUp team`,
    html: `
<div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
  <h1 style="font-size: 22px; margin: 0 0 12px;">${heading}</h1>
  <p style="font-size: 15px; line-height: 1.5; margin: 0 0 24px; color: #374151;">${intro}</p>
  <p style="margin: 0 0 24px;">
    <a href="${escapeHtml(link)}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 15px; padding: 12px 22px; border-radius: 10px;">${buttonLabel}</a>
  </p>
  <p style="font-size: 13px; line-height: 1.5; color: #6b7280; margin: 0 0 8px;">If the button doesn't work, copy this link into your browser:</p>
  <p style="font-size: 12px; word-break: break-all; color: #2563eb; margin: 0 0 24px;">${escapeHtml(link)}</p>
  <p style="font-size: 13px; color: #6b7280; margin: 0;">${footer}</p>
  <p style="font-size: 13px; color: #6b7280; margin: 16px 0 0;">- The StemUp team</p>
</div>`,
  });
}

/** Sends the signed-in user a verification link. No-op if already verified. */
export const sendVerificationEmail = onCall({ secrets: [gmailUser, gmailAppPassword], invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

  const user = await getAuth().getUser(uid);
  if (!user.email) throw new HttpsError("failed-precondition", "This account has no email address.");
  if (user.emailVerified) return { sent: false, alreadyVerified: true };

  await claimCooldown(`verify_${uid}`);
  const link = await getAuth().generateEmailVerificationLink(user.email);

  // Prefer the name they registered with (stored in Firestore) over the Auth display name
  const profile = await getFirestore().doc(`users/${uid}`).get();
  const name = (profile.data()?.name as string | undefined) || user.displayName || "";
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";

  await sendEmail(
    user.email,
    "Verify your email for StemUp",
    "Verify your email",
    `${greeting} tap the button below to confirm your email address and finish setting up your StemUp account.`,
    "Verify email",
    link,
    "If you didn't create a StemUp account, you can ignore this email.",
  );
  logger.info(`Sent verification email to uid ${uid}`);
  return { sent: true };
});

/**
 * Sends a password-reset link. Always reports success so the form can't be
 * used to find out which emails have accounts.
 */
export const sendPasswordResetEmail = onCall({ secrets: [gmailUser, gmailAppPassword], invoker: "public" }, async (request) => {
  const email = typeof request.data?.email === "string" ? request.data.email.trim().toLowerCase() : "";
  if (!email || email.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "That email address doesn't look right.");
  }

  await claimCooldown(`reset_${createHash("sha256").update(email).digest("hex")}`);

  let link: string;
  try {
    link = await getAuth().generatePasswordResetLink(email);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "auth/user-not-found" || code === "auth/email-not-found") return { sent: true };
    throw err;
  }

  await sendEmail(
    email,
    "Reset your StemUp password",
    "Reset your password",
    "We received a request to reset the password for your StemUp account. Tap the button below to choose a new one.",
    "Reset password",
    link,
    "If you didn't ask to reset your password, you can ignore this email. Your password won't change.",
  );
  logger.info("Sent password reset email");
  return { sent: true };
});
