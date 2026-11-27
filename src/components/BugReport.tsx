import { useContext, useEffect, useState, type FormEvent } from "react";
import { collection, addDoc, onSnapshot, deleteDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { MainContext } from "../context/MainContext";
import Button from "./Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBug, faCircleCheck, faLightbulb, faMoon, faSun, faWrench, faXmark } from "@fortawesome/free-solid-svg-icons";
import { AnimatePresence, motion } from "motion/react";
import { FEEDBACK_TYPES, type FeedbackType } from "../myDataTypes";

interface Bug {
    id: string;
    /** "bug" or "feature"; reports from before feature requests are bugs */
    type?: FeedbackType;
    bugTitle: string;
    bugDesc: string;
    userEmail: string;
    userId: string;
    createdAt?: Timestamp;
}

const TYPE_LOOK: Record<FeedbackType, { icon: typeof faBug; chip: string; active: string }> = {
    bug: {
        icon: faBug,
        chip: "bg-red-50 text-red-600 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40",
        active: "border-red-400 bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/60",
    },
    feature: {
        icon: faLightbulb,
        chip: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40",
        active: "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/60",
    },
};

const typeOf = (b: Bug): FeedbackType => (b.type === "feature" ? "feature" : "bug");

/**
 * Bug reports and feature requests. Members choose which they're sending;
 * admins see them all, labelled and filterable by type.
 */
export default function BugReport() {
    const context = useContext(MainContext);
    const [bugs, setBugs] = useState<Bug[]>([]);
    // The form's type, and the admin list's filter
    const [type, setType] = useState<FeedbackType>("bug");
    const [filter, setFilter] = useState<FeedbackType | "all">("all");
    // The centered "submitted" message, shown for a couple of seconds after the form closes
    const [submitted, setSubmitted] = useState<FeedbackType | null>(null);
    const [sending, setSending] = useState(false);
    useEffect(() => {
        if (!submitted) return;
        const t = setTimeout(() => setSubmitted(null), 2500);
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

    // Admins: listen to every report, newest first
    useEffect(() => {
        if (!isAdmin) return;
        const unsub = onSnapshot(collection(db, "bugs"), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Bug));
            list.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
            setBugs(list);
        });
        return () => unsub();
    }, [isAdmin]);

    const submitBug = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!user) return;
        const form = e.currentTarget;
        const formData = new FormData(form);
        const bugTitle = (formData.get("bugTitle") as string).trim();
        const bugDesc = (formData.get("bugDesc") as string).trim();
        if (!bugTitle || !bugDesc) return;

        setSending(true);
        try {
            await addDoc(collection(db, "bugs"), {
                type,
                bugTitle,
                bugDesc,
                userEmail: user.email ?? "",
                userId: user.uid,
                createdAt: Timestamp.now(),
            });
            form.reset();
            // Close the form, then confirm in the middle of the screen
            setOpen(false);
            setSubmitted(type);
            setType("bug");
        } catch (err) {
            console.error("Error submitting feedback:", err);
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

    const counts = { all: bugs.length, bug: bugs.filter(b => typeOf(b) === "bug").length, feature: bugs.filter(b => typeOf(b) === "feature").length };
    const shown = filter === "all" ? bugs : bugs.filter(b => typeOf(b) === filter);
    const isFeature = type === "feature";

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

            {/* Feedback floating button (desktop only — mobile users open this from Settings) */}
            <button
                onClick={() => setOpen(true)}
                className="hidden sm:flex fixed bottom-6 right-6 z-40 size-12 rounded-full shadow-lg items-center justify-center transition-colors hover:cursor-pointer bg-gray-800 hover:bg-gray-700 text-white text-xl"
                title={isAdmin ? "View bug reports and feature requests" : "Report a bug or request a feature"}
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
                                <p className="font-semibold">{submitted === "feature" ? "Feature request submitted" : "Bug report submitted"}</p>
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
                                        <h2 className="font-semibold">Bugs &amp; Features</h2>
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs text-gray-400">{bugs.length} total</span>
                                            {closeButton}
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5 px-4 pt-3">
                                        {(["all", "bug", "feature"] as const).map(f => (
                                            <button
                                                key={f}
                                                type="button"
                                                onClick={() => setFilter(f)}
                                                className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors hover:cursor-pointer ${
                                                    filter === f ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                                }`}
                                            >
                                                {f === "all" ? "All" : f === "bug" ? "Bugs" : "Features"} ({counts[f]})
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex flex-col gap-3 p-4 overflow-y-auto max-h-96">
                                        {shown.length === 0 ? (
                                            <p className="text-sm text-gray-400 text-center py-6">
                                                {filter === "feature" ? "No feature requests." : filter === "bug" ? "No bug reports." : "Nothing here yet."}
                                            </p>
                                        ) : shown.map(bug => {
                                            const t = typeOf(bug);
                                            return (
                                                <div key={bug.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0 flex flex-col items-start gap-1.5">
                                                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TYPE_LOOK[t].chip}`}>
                                                                <FontAwesomeIcon icon={TYPE_LOOK[t].icon} className="text-[9px]" />
                                                                {t === "feature" ? "Feature request" : "Bug"}
                                                            </span>
                                                            <p className="font-semibold text-sm leading-tight break-words">{bug.bugTitle}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => dismissBug(bug.id)}
                                                            className="text-xs text-red-500 hover:text-red-700 shrink-0 hover:cursor-pointer font-medium"
                                                        >
                                                            Dismiss
                                                        </button>
                                                    </div>
                                                    <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{bug.bugDesc}</p>
                                                    <p className="text-xs text-gray-400">
                                                        {bug.userEmail}
                                                        {bug.createdAt && ` · ${bug.createdAt.toDate().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            ) : (
                                /* User view */
                                <>
                                    <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
                                        <div>
                                            <h2 className="font-semibold">{isFeature ? "Request a Feature" : "Report a Bug"}</h2>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {isFeature ? "Tell us what would make StemUp better." : "Help us improve by describing what went wrong."}
                                            </p>
                                        </div>
                                        {closeButton}
                                    </div>
                                    <form onSubmit={submitBug} className="flex flex-col gap-3 p-4">
                                        {/* What they're sending */}
                                        <div role="radiogroup" aria-label="What are you sending?" className="grid grid-cols-2 gap-2">
                                            {FEEDBACK_TYPES.map(opt => (
                                                <button
                                                    key={opt.key}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={type === opt.key}
                                                    onClick={() => setType(opt.key)}
                                                    className={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-colors hover:cursor-pointer ${
                                                        type === opt.key ? TYPE_LOOK[opt.key].active : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300"
                                                    }`}
                                                >
                                                    <FontAwesomeIcon icon={TYPE_LOOK[opt.key].icon} />
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                        <input
                                            name="bugTitle"
                                            placeholder="Title"
                                            required
                                            maxLength={150}
                                            className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                                        />
                                        <textarea
                                            name="bugDesc"
                                            placeholder={isFeature ? "Describe the feature and how it would help..." : "Describe the bug..."}
                                            required
                                            rows={4}
                                            maxLength={4000}
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
