import { FirebaseError } from "firebase/app";
import { useContext, useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { MainContext } from "../context/MainContext";
import { sendVerification } from "../lib/firebaseService";
import { auth } from "../lib/firebase";
import { motion } from "motion/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRightFromBracket, faEnvelopeOpenText, faInbox, faCircleCheck, faHandPointer } from "@fortawesome/free-solid-svg-icons";

/** Seconds before "Resend" works again (the server allows one email a minute). */
const RESEND_COOLDOWN = 60;

const STEPS = [
    { icon: faInbox, text: "Open the email from StemUp" },
    { icon: faHandPointer, text: "Tap \"Verify email\"" },
    { icon: faCircleCheck, text: "Come back here. This page moves on by itself" },
];

export default function VerifyEmailPage() {
    const context = useContext(MainContext);
    const user = context?.user ?? null;
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
    const [cooldown, setCooldown] = useState(0);

    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setTimeout(() => setCooldown(c => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    const resend = async () => {
        if (!user || sending || cooldown > 0) return;
        setSending(true);
        setStatus(null);
        try {
            await sendVerification(user);
            setStatus({ ok: true, text: "Sent! It can take a few minutes to arrive." });
            setCooldown(RESEND_COOLDOWN);
        } catch (err) {
            const code = err instanceof FirebaseError ? err.code : "";
            if (code === "auth/too-many-requests") setCooldown(RESEND_COOLDOWN);
            setStatus({
                ok: false,
                text: code === "auth/too-many-requests"
                    ? "You've requested a few emails already. Please wait a minute before resending."
                    : "Couldn't resend the email. Please try again.",
            });
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950">
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl shadow-blue-900/10 border border-gray-100"
            >
                {/* Banner with the envelope */}
                <div className="relative h-28 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600">
                    <div className="absolute left-1/2 -bottom-10 -translate-x-1/2">
                        <span className="absolute inset-0 rounded-full bg-blue-400/40 animate-ping" aria-hidden />
                        <div className="relative size-20 rounded-full bg-white ring-4 ring-white dark:ring-gray-900 shadow-lg flex items-center justify-center text-3xl text-blue-600">
                            <FontAwesomeIcon icon={faEnvelopeOpenText} />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-6 px-6 sm:px-8 pt-14 pb-8 text-center">
                    <div className="flex flex-col items-center gap-2">
                        <h1 className="text-2xl font-bold">Check your inbox</h1>
                        <p className="text-sm text-gray-500">We sent a verification link to</p>
                        <span className="max-w-full break-all rounded-full bg-blue-50 border border-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
                            {user?.email}
                        </span>
                    </div>

                    <ol className="w-full flex flex-col gap-2 text-left">
                        {STEPS.map((s, i) => (
                            <li key={i} className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white text-sm">
                                    <FontAwesomeIcon icon={s.icon} />
                                </span>
                                <span className="text-sm text-gray-700">{s.text}</span>
                            </li>
                        ))}
                    </ol>

                    <div className="flex items-center gap-2 text-xs text-gray-400" role="status">
                        <span className="relative flex size-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex size-2.5 rounded-full bg-green-500" />
                        </span>
                        Waiting for you to verify...
                    </div>

                    <div className="w-full flex flex-col items-center gap-2">
                        <button
                            type="button"
                            onClick={resend}
                            disabled={sending || cooldown > 0}
                            className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 hover:cursor-pointer disabled:cursor-not-allowed disabled:bg-blue-300"
                        >
                            {sending ? "Sending..." : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
                        </button>
                        {status && (
                            <p className={`text-sm ${status.ok ? "text-green-600" : "text-red-500"}`}>{status.text}</p>
                        )}
                        <p className="text-xs text-gray-400">Don't see it? Check your spam or junk folder.</p>
                    </div>

                    <button
                        type="button"
                        onClick={() => signOut(auth)}
                        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors hover:cursor-pointer"
                    >
                        <FontAwesomeIcon icon={faArrowRightFromBracket} />
                        Use a different account
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
