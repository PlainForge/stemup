import { useContext, useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { motion } from "motion/react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronRight, faCopy, faEnvelope, faUsers } from "@fortawesome/free-solid-svg-icons";
import { db } from "../lib/firebase";
import { MainContext } from "../context/MainContext";
import { GLOBAL_ROLE_ID } from "../lib/firebaseService";
import { roleService } from "../lib/roleService";
import { alertDialog, confirmDialog } from "../lib/confirm";
import type { AccessLevel, Role, StemRequest, UserData } from "../myDataTypes";
import Loading from "./Loading";
import Button from "../components/Button";
import ProfileImg from "../components/ProfileImg";
import AboutMeBlock from "../components/AboutMeBlock";
import { AccessBadge } from "./AdminPage";
import BackButton from "../components/BackButton";

/**
 * /admin/users/:uid — one user's details, with their access and global leaderboard
 * switches. Also what admins see on a user page opened from another tab.
 */
export default function AdminUserPage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const { uid } = useParams<{ uid: string }>();

    const user = context?.user ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? [];
    const instructors = context?.instructors ?? [];
    const isAdmin = !!user && admins.includes(user.uid);

    // undefined while loading, null if the account no longer exists
    const [target, setTarget] = useState<UserData | null | undefined>(undefined);
    const [roles, setRoles] = useState<Role[]>([]);
    const [request, setRequest] = useState<StemRequest | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState<"uid" | "email" | null>(null);

    useEffect(() => {
        if (!loading && (!user || !isAdmin)) navigate("/", { replace: true });
    }, [loading, user, isAdmin, navigate]);

    useEffect(() => {
        if (!isAdmin || !uid) return;
        const unsubs = [
            onSnapshot(doc(db, "users", uid), snap => setTarget(snap.exists() ? ({ ...snap.data(), uid: snap.id } as UserData) : null),
                err => { console.error("Error loading user:", err); setTarget(null); }),
            onSnapshot(collection(db, "roles"), snap => {
                setRoles(snap.docs.filter(d => d.id !== GLOBAL_ROLE_ID).map(d => ({ id: d.id, ...(d.data() as Omit<Role, "id">) })));
            }, err => console.error("Error loading roles:", err)),
            onSnapshot(query(collection(db, "requests"), where("uid", "==", uid)), snap => {
                const found = snap.docs.map(d => ({ id: d.id, ...d.data() } as StemRequest)).find(r => r.type === "instructor");
                setRequest(found ?? null);
            }, err => console.error("Error loading requests:", err)),
        ];
        return () => unsubs.forEach(u => u());
    }, [isAdmin, uid]);

    if (loading || !user || !isAdmin || target === undefined || !uid) return <Loading />;

    const back = (
        // Back to wherever they came from (any tab), or the Admin page's Users tab
        <BackButton label="Back" onClick={() => (window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/admin?tab=users", { replace: true })} />
    );

    if (target === null) {
        return (
            <div className="w-full max-w-2xl mx-auto flex flex-col gap-4 px-4 py-6">
                {back}
                <p className="text-gray-400 text-sm text-center py-8">This account no longer exists.</p>
            </div>
        );
    }

    const level: AccessLevel = admins.includes(uid) ? "admin" : instructors.includes(uid) ? "instructor" : "user";
    const memberOf = roles.filter(r => (r.members ?? []).includes(uid)).sort((a, b) => a.name.localeCompare(b.name));
    const instructing = memberOf.filter(r => (r.instructors ?? []).includes(uid));
    const seesGlobal = target.canSeeGlobal === true;

    const run = async (action: () => Promise<unknown>) => {
        setBusy(true);
        try {
            await action();
        } catch (err) {
            console.error(err);
            await alertDialog("Couldn't save that change. Please try again.", "Something went wrong");
        } finally {
            setBusy(false);
        }
    };

    const setInstructor = async (make: boolean) => {
        if (!make) {
            const ok = await confirmDialog(`${target.name} will go back to being a User. They stay in their roles but can't run them any more.`, { title: "Remove Instructor?", confirmLabel: "Remove", danger: true });
            if (!ok) return;
        }
        await run(() => make ? roleService.grantInstructor(uid) : roleService.revokeInstructor(uid));
    };

    const purge = async () => {
        const ok = await confirmDialog(
            `Remove what's left of ${target.name}? Their profile, role memberships, tasks and requests are deleted. This only works if their account was already deleted.`,
            { title: "Remove Deleted Account?", confirmLabel: "Remove", danger: true }
        );
        if (!ok) return;
        setBusy(true);
        try {
            await roleService.purgeDeletedAccount(uid);
            navigate("/admin?tab=users", { replace: true });
        } catch (err) {
            const message = err instanceof FirebaseError && err.code === "functions/failed-precondition"
                ? err.message
                : "Couldn't remove it. Please try again.";
            await alertDialog(message, "Not removed");
        } finally {
            setBusy(false);
        }
    };

    const copy = async (what: "uid" | "email", text: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(what);
        setTimeout(() => setCopied(null), 1500);
    };

    const card = "bg-white rounded-2xl border border-gray-100 shadow-sm p-6";
    const cardTitle = "text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4";

    return (
        <motion.div
            className="w-full max-w-2xl mx-auto flex flex-col gap-4 px-4 py-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            {back}

            {/* Who they are */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="h-20 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600" />
                <div className="flex flex-col items-center gap-2 px-6 pb-6 text-center">
                    <div className="-mt-12 rounded-full ring-4 ring-white dark:ring-gray-900 bg-white dark:bg-gray-900">
                        <ProfileImg src={target.photoURL} alt={target.name} size="sm" />
                    </div>
                    <h1 className="text-xl font-bold break-words">{target.name}</h1>
                    <AccessBadge level={level} />
                    {target.email ? (
                        <button
                            type="button"
                            onClick={() => copy("email", target.email!)}
                            title="Copy email"
                            className="mt-1 inline-flex items-center gap-2 max-w-full text-sm text-gray-500 hover:text-gray-800 transition-colors hover:cursor-pointer"
                        >
                            <FontAwesomeIcon icon={faEnvelope} className="text-gray-400 shrink-0" />
                            <span className="break-all">{target.email}</span>
                            <FontAwesomeIcon icon={copied === "email" ? faCheck : faCopy} className={`shrink-0 text-xs ${copied === "email" ? "text-green-500" : "text-gray-300"}`} />
                        </button>
                    ) : (
                        <p className="mt-1 text-sm text-gray-400">No email on file</p>
                    )}
                    <button
                        type="button"
                        onClick={() => copy("uid", uid)}
                        title="Copy user ID"
                        className="inline-flex items-center gap-1.5 max-w-full text-xs text-gray-400 font-mono bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 cursor-pointer hover:border-gray-300 hover:text-gray-500 transition-colors"
                    >
                        <span className="break-all">{uid}</span>
                        <FontAwesomeIcon icon={copied === "uid" ? faCheck : faCopy} className={`shrink-0 ${copied === "uid" ? "text-green-500" : ""}`} />
                    </button>
                    <AboutMeBlock text={target.aboutMe} className="mt-2" />
                </div>
            </div>

            {/* Access */}
            <div className={card}>
                <h2 className={cardTitle}>Access</h2>
                <div className="flex flex-col gap-3">
                    {level === "admin" && (
                        <p className="text-sm text-gray-500">Admins can do everything. Admin access is set by a developer.</p>
                    )}
                    {level === "user" && (
                        <>
                            {request ? (
                                <div className="flex flex-col gap-2 bg-amber-50 border border-amber-200 px-4 py-3 rounded-xl">
                                    <p className="text-sm font-medium text-amber-700">Asked to become an Instructor</p>
                                    {request.reason && <p className="text-sm text-gray-600 whitespace-pre-wrap">{request.reason}</p>}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">They haven't asked to be an Instructor. You can still make them one.</p>
                            )}
                            <div className="flex flex-wrap gap-2">
                                <Button onClick={() => setInstructor(true)} color="blue" size="sm" disabled={busy}>
                                    {busy ? "Saving..." : "Make Instructor"}
                                </Button>
                                {request && (
                                    <Button onClick={() => run(() => roleService.declineRequest(request.id))} color="gray" size="sm" disabled={busy}>
                                        Decline Request
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                    {level === "instructor" && (
                        <>
                            <p className="text-sm text-gray-500">They can request new roles and run the roles they've been given.</p>
                            <div>
                                <Button onClick={() => setInstructor(false)} color="red" size="sm" disabled={busy}>
                                    {busy ? "Saving..." : "Remove Instructor"}
                                </Button>
                            </div>
                        </>
                    )}

                    <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl">
                        <div className="min-w-0">
                            <p className="text-sm">Global leaderboard</p>
                            <p className="text-xs text-gray-400">
                                {level === "user" ? "Let them see it on their Home page" : `${level === "admin" ? "Admins" : "Instructors"} can always see it`}
                            </p>
                        </div>
                        {level === "user" && (
                            <button
                                type="button"
                                role="switch"
                                aria-checked={seesGlobal}
                                aria-label="Let them see the global leaderboard"
                                disabled={busy}
                                onClick={() => run(() => roleService.setCanSeeGlobal(uid, !seesGlobal))}
                                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors hover:cursor-pointer disabled:opacity-60 ${seesGlobal ? "bg-green-500" : "bg-gray-300"}`}
                            >
                                <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${seesGlobal ? "translate-x-6" : "translate-x-1"}`} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Roles */}
            <div className={card}>
                <h2 className={cardTitle}>Roles</h2>
                {level === "admin" ? (
                    <p className="text-sm text-gray-500">Admins are in every role automatically.</p>
                ) : memberOf.length === 0 ? (
                    <p className="text-sm text-gray-400">Not in any roles yet.</p>
                ) : (
                    <RoleList roles={memberOf} onOpen={id => navigate(`/admin/roles/${id}`)} />
                )}
            </div>

            {level !== "admin" && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-6 flex flex-col gap-3 order-last">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-red-500">Deleted Account</h2>
                    <p className="text-sm text-gray-600">
                        If {target.name} deleted their account but still shows up here or on a leaderboard, this clears what's left.
                        It only works once their account is really gone; anyone who can still sign in is left alone.
                    </p>
                    <div>
                        <Button onClick={purge} color="red" size="sm" disabled={busy}>
                            {busy ? "Working..." : "Remove Deleted Account"}
                        </Button>
                    </div>
                </div>
            )}

            {level === "instructor" && (
                <div className={card}>
                    <h2 className={cardTitle}>Instructing</h2>
                    {instructing.length === 0 ? (
                        <p className="text-sm text-gray-400">They aren't running any roles yet.</p>
                    ) : (
                        <RoleList roles={instructing} onOpen={id => navigate(`/admin/roles/${id}`)} />
                    )}
                </div>
            )}
        </motion.div>
    );
}

function RoleList({ roles, onOpen }: { roles: Role[]; onOpen: (id: string) => void }) {
    return (
        <div className="flex flex-col gap-2">
            {roles.map(r => (
                <button
                    key={r.id}
                    type="button"
                    onClick={() => onOpen(r.id)}
                    className="group flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border border-gray-200 bg-white transition-all duration-200 hover:border-gray-400 hover:shadow-sm hover:cursor-pointer"
                >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm transition-colors group-hover:bg-blue-600 group-hover:text-white">
                        <FontAwesomeIcon icon={faUsers} />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block font-medium truncate">{r.name}</span>
                        {r.purpose?.trim() && <span className="block text-xs text-gray-400 truncate">{r.purpose}</span>}
                    </span>
                    <FontAwesomeIcon icon={faChevronRight} className="shrink-0 text-gray-300 transition-all duration-200 group-hover:text-gray-600 group-hover:translate-x-1" />
                </button>
            ))}
        </div>
    );
}
