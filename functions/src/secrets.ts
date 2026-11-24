import { defineSecret } from "firebase-functions/params";

/** Gmail account (and its app password) that StemUp's emails are sent from. */
export const gmailUser = defineSecret("GMAIL_USER");
export const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");

/**
 * Gmail login from the secrets, tidied up: stray whitespace or a trailing
 * newline from pasting, and the spaces Google shows inside app passwords
 * ("abcd efgh ijkl mnop"), all make Gmail reject the login.
 */
export function gmailCredentials() {
  return {
    user: gmailUser.value().trim(),
    pass: gmailAppPassword.value().replace(/\s+/g, ""),
  };
}
