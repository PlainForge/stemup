import { useContext, useEffect, useState, type FormEvent } from "react";
import { collection, addDoc, onSnapshot, deleteDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { MainContext } from "../context/MainContext";
import Button from "./Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBug, faCircleCheck, faMoon, faSun, faWrench, faXmark } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "motion/react";

interface Bug {
    id: string;
    bugTitle: string;
    bugDesc: string;
    userEmail: string;
    userId: string;
    createdAt?: Timestamp;
}

export default function BugReport() {
    const context = useContext(MainContext);
    const [bugs, setBugs] = useState<Bug[]>([]);
    // The centered "submitted" message, shown for a couple of seconds after the form closes
    const [submitted, setSubmitted] = useState(false);
    const [sending, setSending] = useState(false);
    useEffect(() => {
        if (!submitted) return;
        const t = setTimeout(() => setSubmitted(false), 2500);
        return () => clearTimeout(t);
    }, [submitted]);

    const user = context?.user ?? null;
    const admins = context?.admins ?? [];
    const dark = context?.dark ?? false;
    const setDark = context?.setDark ?? (() => {});
    const open = context?.bugReportOpen ?? false;
    const setOpen = context?.setBugReportOpen ?? (() => {});

    const isAdmin = user && admins.includes(user.uid);

    // Plain CSS entrance transition (Framer Motion's initial/animate on this panel
    // caused a visible flicker on mount, same issue and fix as the profile card)
    const [entered, setEntered] = useState(false);
    useEffect(() => {
        if (!open) {
            setEntered(false);
            return;
        }
        const frame = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(frame);
    }, [open]);

    // Admins: listen to all bugs
    useEffect(() => {
        if (!isAdmin) return;
        const unsub = onSnapshot(collection(db, "bugs"), (snap) => {
            setBugs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bug)));
        });
        return () => unsub();
    }, [isAdmin]);

    const submitBug = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!user) return;
        const form = e.currentTarget;
        const formData = new FormData(form);
        const bugTitle = formData.get("bugTitle") as string;
        const bugDesc = formData.get("bugDesc") as string;
        if (!bugTitle || !bugDesc) return;

        setSending(true);
        try {
            await addDoc(collection(db, "bugs"), {
                bugTitle,
                bugDesc,
                userEmail: user.email ?? "",
                userId: user.uid,
                createdAt: Timestamp.now(),
            });
            form.reset();
            // Close the form, then confirm in the middle of the screen
            setOpen(false);
            setSubmitted(true);
        } catch (err) {
            console.error("Error submitting bug report:", err);
        } finally {
            setSending(false);
        }
    };

    const dismissBug = async (id: string) => {
        await deleteDoc(doc(db, "bugs", id));
    };

    if (!user) return null;

    const closeButton = (
        <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            title="Close"
            className="size-8 -mr-2 shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors hover:cursor-pointer"
        >
            <FontAwesomeIcon icon={faXmark} />
        </button>
    );

    return (
        <>
            {/* Theme toggle button (desktop only — mobile users toggle this from Settings) */}
            <button
                onClick={() => setDark(d => !d)}
                className="hidden sm:flex fixed bottom-20 right-6 z-40 size-12 rounded-full shadow-lg items-center justify-center transition-colors hover:cursor-pointer bg-gray-800 hover:bg-gray-700 text-white text-xl"
                title={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
                <FontAwesomeIcon icon={dark ? faSun : faMoon} />
            </button>

            {/* Bug report floating button (desktop only — mobile users open this from Settings) */}
            <button
                onClick={() => setOpen(true)}
                className="hidden sm:flex fixed bottom-6 right-6 z-40 size-12 rounded-full shadow-lg items-center justify-center transition-colors hover:cursor-pointer bg-gray-800 hover:bg-gray-700 text-white text-xl"
                title={isAdmin ? "View bug reports" : "Report a bug"}
            >
                <FontAwesomeIcon icon={isAdmin ? faWrench : faBug} />
            </button>

            <AnimatePresence>
                {submitted && (
                    <motion.div
                        key="bug-submitted"
                        role="status"
                        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                    >
                        <motion.div
                            className="flex items-center gap-3 rounded-2xl bg-gray-900/90 text-white px-6 py-4 shadow-2xl backdrop-blur"
                            initial={{ scale: 0.9, y: 8 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95 }}
                        >
                            <FontAwesomeIcon icon={faCircleCheck} className="text-green-400 text-xl" />
                            <div>
                                <p className="font-semibold">Bug report submitted</p>
                                <p className="text-sm text-white/70">Thanks for helping us improve StemUp.</p>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Backdrop + panel */}
            {open && (
                <>
                    <div
                        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-150 ${entered ? "opacity-100" : "opacity-0"}`}
                        onClick={() => setOpen(false)}
                    />

                    <div
                        className={`fixed z-50 w-[calc(100%-2rem)] max-w-sm bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 sm:top-auto sm:left-auto sm:right-6 sm:bottom-36 sm:translate-x-0 sm:translate-y-0 transition-all duration-150 ${
                            entered ? "opacity-100 scale-100" : "opacity-0 scale-95"
                        }`}
                    >
                            {isAdmin ? (
                                /* Admin view */
                                <>
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                                        <h2 className="font-semibold">Bug Reports</h2>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs text-gray-400">{bugs.length} total</span>
                                            {closeButton}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-3 p-4 overflow-y-auto max-h-96">
                                        {bugs.length === 0 ? (
                                            <p className="text-sm text-gray-400 text-center py-6">No bug reports.</p>
                                        ) : bugs.map(bug => (
                                            <div key={bug.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="font-semibold text-sm leading-tight">{bug.bugTitle}</p>
                                                    <button
                                                        onClick={() => dismissBug(bug.id)}
                                                        className="text-xs text-red-500 hover:text-red-700 shrink-0 hover:cursor-pointer font-medium"
                                                    >
                                                        Dismiss
                                                    </button>
                                                </div>
                                                <p className="text-sm text-gray-600">{bug.bugDesc}</p>
                                                <p className="text-xs text-gray-400">{bug.userEmail}</p>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                /* User view */
                                <>
                                    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
                                        <div>
                                            <h2 className="font-semibold">Report a Bug</h2>
                                            <p className="text-xs text-gray-400 mt-0.5">Help us improve by describing what went wrong.</p>
                                        </div>
                                        {closeButton}
                                    </div>
                                    <form onSubmit={submitBug} className="flex flex-col gap-3 p-4">
                                        <input
                                            name="bugTitle"
                                            placeholder="Title"
                                            required
                                            className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                                        />
                                        <textarea
                                            name="bugDesc"
                                            placeholder="Describe the bug..."
                                            required
                                            rows={4}
                                            className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors resize-none"
                                        />
                                        <Button type="submit" size="sm" color="blue" disabled={sending}>
                                            {sending ? "Sending..." : "Submit"}
                                        </Button>
                                    </form>
                                </>
                            )}
                    </div>
                </>
            )}
        </>
    );
}
