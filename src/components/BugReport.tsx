import { useContext, useEffect, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { collection, addDoc, onSnapshot, deleteDoc, doc, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { MainContext } from "../context/MainContext";
import Button from "./Button";

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
    const [open, setOpen] = useState(false);
    const [bugs, setBugs] = useState<Bug[]>([]);
    const [submitted, setSubmitted] = useState(false);

    const user = context?.user ?? null;
    const admins = context?.admins ?? [];

    const isAdmin = user && admins.includes(user.uid);

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

        await addDoc(collection(db, "bugs"), {
            bugTitle,
            bugDesc,
            userEmail: user.email ?? "",
            userId: user.uid,
            createdAt: Timestamp.now(),
        });

        form.reset();
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 3000);
    };

    const dismissBug = async (id: string) => {
        await deleteDoc(doc(db, "bugs", id));
    };

    if (!user) return null;

    return (
        <>
            {/* Floating button */}
            <button
                onClick={() => setOpen(true)}
                className="fixed bottom-6 right-6 z-40 size-12 rounded-full shadow-lg flex items-center justify-center transition-colors hover:cursor-pointer bg-gray-800 hover:bg-gray-700 text-white text-xl"
                title={isAdmin ? "View bug reports" : "Report a bug"}
            >
                {isAdmin ? "🛠" : "🐛"}
            </button>

            {/* Backdrop + panel */}
            <AnimatePresence>
                {open && (
                    <>
                        <motion.div
                            className="fixed inset-0 bg-black/40 z-40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setOpen(false)}
                        />

                        <motion.div
                            className="fixed bottom-20 right-6 z-50 w-full max-w-sm bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden"
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 20, scale: 0.95 }}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        >
                            {isAdmin ? (
                                /* Admin view */
                                <>
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                                        <h2 className="font-semibold">Bug Reports</h2>
                                        <span className="text-xs text-gray-400">{bugs.length} total</span>
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
                                    <div className="px-5 py-4 border-b border-gray-100">
                                        <h2 className="font-semibold">Report a Bug</h2>
                                        <p className="text-xs text-gray-400 mt-0.5">Help us improve by describing what went wrong.</p>
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
                                        <Button type="submit" size="sm" color="blue">
                                            {submitted ? "Submitted!" : "Submit"}
                                        </Button>
                                    </form>
                                </>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
