import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { firebaseAuthService } from "../lib/firebaseService";
import { useNavigate } from "react-router-dom";
import Button from "./Button";

type RoleRow = { id: string; name: string; memberCount: number };
type Step = "select" | "name" | "confirm" | "done";

interface SemesterResetModalProps {
    open: boolean;
    onClose: () => void;
}

export default function SemesterResetModal({ open, onClose }: SemesterResetModalProps) {
    const navigate = useNavigate();
    const [step, setStep] = useState<Step>("select");
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [rolesLoading, setRolesLoading] = useState(false);
    const [removeIds, setRemoveIds] = useState<Set<string>>(new Set());
    const [batchName, setBatchName] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [preview, setPreview] = useState<{ roleNames: string[]; usersToArchive: number; usersToUpdate: number } | null>(null);
    const [result, setResult] = useState<{ archivedUsers: number; updatedUsers: number; deletedRoles: number; batchId: string; batchName: string } | null>(null);
    const [error, setError] = useState("");

    // Reset internal state each time the modal is opened, and load the role list
    useEffect(() => {
        if (!open) return;
        setStep("select");
        setRemoveIds(new Set());
        setBatchName("");
        setConfirmed(false);
        setPreview(null);
        setResult(null);
        setError("");

        setRolesLoading(true);
        getDocs(collection(db, "roles"))
            .then(snap => {
                const list = snap.docs
                    .map(d => {
                        const data = d.data() as { name: string; members?: string[] };
                        return { id: d.id, name: data.name, memberCount: (data.members ?? []).length };
                    })
                    .filter(r => !r.name.match("global"));
                setRoles(list);
            })
            .catch(err => {
                console.error("Error loading roles:", err);
                setError("Couldn't load roles. Try again.");
            })
            .finally(() => setRolesLoading(false));
    }, [open]);

    if (!open) return null;

    const toggleRole = (roleId: string) => {
        setRemoveIds(prev => {
            const next = new Set(prev);
            if (next.has(roleId)) next.delete(roleId);
            else next.add(roleId);
            return next;
        });
    };

    const goToConfirm = async () => {
        setError("");
        setStep("confirm");
        setSubmitting(true);
        try {
            const result = await firebaseAuthService.previewSemesterReset(Array.from(removeIds));
            setPreview(result);
        } catch (err) {
            console.error("Error previewing semester reset:", err);
            setError("Couldn't compute the preview. Try again.");
            setStep("name");
        } finally {
            setSubmitting(false);
        }
    };

    const handleReset = async () => {
        setError("");
        setSubmitting(true);
        try {
            const summary = await firebaseAuthService.executeSemesterReset(Array.from(removeIds), batchName);
            setResult(summary);
            setStep("done");
        } catch (err) {
            console.error("Error executing semester reset:", err);
            setError("Something went wrong during the reset. Some changes may be partially applied.");
        } finally {
            setSubmitting(false);
        }
    };

    const viewAlumniPage = () => {
        if (!result) return;
        onClose();
        navigate(`/alumni/${result.batchId}`);
    };

    return (
        <AnimatePresence>
            <motion.div
                key="semester-reset-overlay"
                className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                onClick={() => !submitting && onClose()}
            >
                <motion.div
                    className="relative z-10 bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col gap-5 max-h-[85vh] overflow-y-auto"
                    initial={{ scale: 0.92, y: 20, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.95, y: 10, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.8 }}
                    onClick={e => e.stopPropagation()}
                >
                    {step === "select" && (
                        <>
                            <div>
                                <h2 className="text-lg font-bold">Semester Reset</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Choose which roles to remove. Users whose only roles are removed will be archived to
                                    an Alumni record and removed from active rosters; everyone else keeps their account,
                                    but their points and completed tasks reset to 0 for the new semester.
                                </p>
                            </div>

                            {rolesLoading ? (
                                <p className="text-sm text-gray-400 text-center py-6">Loading roles...</p>
                            ) : roles.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6">No roles to reset.</p>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {roles.map(role => {
                                        const marked = removeIds.has(role.id);
                                        return (
                                            <div
                                                key={role.id}
                                                className="flex items-center justify-between bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl"
                                            >
                                                <div>
                                                    <p className="text-sm font-medium">{role.name}</p>
                                                    <p className="text-xs text-gray-400">{role.memberCount} member{role.memberCount === 1 ? "" : "s"}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleRole(role.id)}
                                                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors duration-200 hover:cursor-pointer ${
                                                        marked
                                                            ? "bg-red-100 text-red-600 hover:bg-red-200"
                                                            : "bg-green-100 text-green-700 hover:bg-green-200"
                                                    }`}
                                                >
                                                    {marked ? "Remove" : "Keep"}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {error && <p className="text-xs text-red-500">{error}</p>}

                            <div className="flex flex-col gap-2">
                                <Button size="full" color="red" disabled={removeIds.size === 0} onClick={() => setStep("name")}>
                                    Next
                                </Button>
                                <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 transition-colors py-1 hover:cursor-pointer">
                                    Cancel
                                </button>
                            </div>
                        </>
                    )}

                    {step === "name" && (
                        <>
                            <div>
                                <h2 className="text-lg font-bold">Name this Archive</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Archived users will be saved under this name in the Alumni tab, e.g. "Fall 2025".
                                </p>
                            </div>

                            <input
                                type="text"
                                autoFocus
                                value={batchName}
                                onChange={e => setBatchName(e.target.value)}
                                placeholder="Archive name"
                                maxLength={64}
                                className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                            />

                            <div className="flex flex-col gap-2">
                                <Button size="full" color="red" disabled={!batchName.trim()} onClick={goToConfirm}>
                                    Next
                                </Button>
                                <button
                                    onClick={() => setStep("select")}
                                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors py-1 hover:cursor-pointer"
                                >
                                    Back
                                </button>
                            </div>
                        </>
                    )}

                    {step === "confirm" && (
                        <>
                            <div>
                                <h2 className="text-lg font-bold">Confirm Reset</h2>
                                <p className="text-sm text-gray-500 mt-1">This action is permanent and cannot be undone.</p>
                            </div>

                            {submitting || !preview ? (
                                <p className="text-sm text-gray-400 text-center py-6">Calculating impact...</p>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                                        <p className="font-semibold mb-1">Roles to remove ({preview.roleNames.length}):</p>
                                        <p>{preview.roleNames.join(", ")}</p>
                                    </div>
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 flex flex-col gap-1">
                                        <p><span className="font-semibold">{preview.usersToArchive}</span> user{preview.usersToArchive === 1 ? "" : "s"} will be archived to "{batchName}" (name, photo, points, and tasks completed saved; their tasks and role data are not) and removed from active rosters.</p>
                                        <p><span className="font-semibold">{preview.usersToUpdate}</span> user{preview.usersToUpdate === 1 ? "" : "s"} will keep their account, lose access to removed roles, and have their points/tasks reset to 0.</p>
                                    </div>
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                                        Admins are never archived. Archived users' sign-in accounts aren't removed from Firebase
                                        Authentication — Google users get a fresh profile automatically next time they sign in;
                                        email/password accounts need to be removed manually in the Firebase Console if you want
                                        to free up that email.
                                    </div>

                                    <label className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                                        <input
                                            type="checkbox"
                                            checked={confirmed}
                                            onChange={e => setConfirmed(e.target.checked)}
                                            className="size-4"
                                        />
                                        I understand this is permanent.
                                    </label>
                                </div>
                            )}

                            {error && <p className="text-xs text-red-500">{error}</p>}

                            <div className="flex flex-col gap-2">
                                <Button
                                    size="full"
                                    color="red"
                                    disabled={!confirmed || submitting || !preview}
                                    onClick={handleReset}
                                >
                                    {submitting ? "Resetting..." : "Reset Semester"}
                                </Button>
                                <button
                                    onClick={() => setStep("name")}
                                    disabled={submitting}
                                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors py-1 hover:cursor-pointer disabled:opacity-50"
                                >
                                    Back
                                </button>
                            </div>
                        </>
                    )}

                    {step === "done" && result && (
                        <>
                            <div>
                                <h2 className="text-lg font-bold">Reset Complete</h2>
                                <p className="text-sm text-gray-500 mt-1">The semester reset finished successfully.</p>
                            </div>

                            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 flex flex-col gap-1">
                                <p>{result.deletedRoles} role{result.deletedRoles === 1 ? "" : "s"} deleted</p>
                                <p>{result.archivedUsers} user{result.archivedUsers === 1 ? "" : "s"} archived to "{result.batchName}"</p>
                                <p>{result.updatedUsers} user{result.updatedUsers === 1 ? "" : "s"} kept, roles &amp; points reset</p>
                            </div>

                            <div className="flex flex-col gap-2">
                                <Button size="full" onClick={viewAlumniPage}>View Alumni Page</Button>
                                <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 transition-colors py-1 hover:cursor-pointer">
                                    Close
                                </button>
                            </div>
                        </>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
