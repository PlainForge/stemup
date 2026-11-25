import { useContext, useEffect, useState } from "react";
import { confirmDialog, alertDialog } from "../lib/confirm";
import { MainContext } from "../context/MainContext";
import Button from "./Button";
import ProfileImg from "./ProfileImg";
import { useLocation, useParams } from "react-router-dom";
import { firebaseAuthService, GLOBAL_ROLE_ID } from "../lib/firebaseService";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import type { AccessLevel, UserRoleData } from "../myDataTypes";
import { AccessBadge } from "../pages/AdminPage";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faTrophy, faXmark } from "@fortawesome/free-solid-svg-icons";
import { db } from "../lib/firebase";


export default function ProfilePage() {
    const context = useContext(MainContext);
    const user = context?.user ?? null;
    const admins = context?.admins ?? [];
    const instructors = context?.instructors ?? [];
    const selectedUser = context?.showAccount ?? null;
    const setShowAccount = context?.setShowAccount ?? null;

    const [isEditing, setIsEditing] = useState(false);
    const [editGlobalPoints, setEditGlobalPoints] = useState(0);
    const [editGlobalTasks, setEditGlobalTasks] = useState(0);

    // Plain CSS entrance transition (Framer Motion's initial/animate on this
    // component caused a visible double-flicker on mount, see conversation history)
    const [entered, setEntered] = useState(false);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setEntered(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    // UIDs of everyone who can see the global leaderboard; they can't be removed from global
    const [globalViewers, setGlobalViewers] = useState<Set<string> | null>(null);
    const viewerIsAdmin = !!user && admins.includes(user.uid);
    const selectedUid = selectedUser?.uid;
    useEffect(() => {
        if (!selectedUid || !viewerIsAdmin) return;
        let cancelled = false;
        getDocs(query(collection(db, "roles"), where("showInGlobalLeaderboard", "==", true)))
            .then(snap => {
                const uids = new Set<string>();
                snap.docs.forEach(d => ((d.data().members as string[]) ?? []).forEach(u => uids.add(u)));
                if (!cancelled) setGlobalViewers(uids);
            })
            .catch(err => console.error("Error loading global leaderboard viewers:", err));
        return () => { cancelled = true; };
    }, [selectedUid, viewerIsAdmin]);

    const location = useLocation();
    const { id: roleId } = useParams<{ id: string }>();

    const swtch = () => {
        if (!setShowAccount) return;
        setIsEditing(false);
        setShowAccount(null);
    }

    if (!selectedUser || !user) return;

    const isAdmin = admins.includes(user.uid);
    const targetAccess: AccessLevel = admins.includes(selectedUser.uid) ? "admin" : instructors.includes(selectedUser.uid) ? "instructor" : "user";

    // On a role page the card shows that role's stats, so edits target the role
    const inRolePage = !!roleId && location.pathname.includes("/roles/");
    const editingRole = inRolePage && (selectedUser.roles?.some(r => r.id === roleId) ?? false);

    const kick = async () => {
        const confirmKick = await confirmDialog(
            `Remove ${selectedUser.name} from this role?`,
            { title: "Kick Member", confirmLabel: "Kick", danger: true }
        );
        if (!confirmKick || !roleId || admins.includes(selectedUser.uid)) return;

        await firebaseAuthService.kickUserFromRole(roleId, selectedUser.uid);
        setShowAccount?.(null);
    }

    const isInGlobal = selectedUser.roles?.some(r => r.id === GLOBAL_ROLE_ID) ?? false;

    const removeFromGlobal = async () => {
        const confirmRemove = await confirmDialog(
            `Remove ${selectedUser.name} from the global leaderboard? They can be restored later from Old Users.`,
            { title: "Remove from Global", confirmLabel: "Remove", danger: true }
        );
        if (!confirmRemove) return;

        const removed = await firebaseAuthService.removeFromGlobalRole(selectedUser.uid);
        if (!removed) {
            await alertDialog(`${selectedUser.name} can't be removed from global (admins and people who can see the global leaderboard always stay in it).`);
            return;
        }
        setShowAccount?.(null);
    }

    const canRemoveFromGlobal = isAdmin && isInGlobal &&
        !admins.includes(selectedUser.uid) &&
        globalViewers !== null && !globalViewers.has(selectedUser.uid);

    const openEdit = () => {
        setEditGlobalPoints(selectedUser.points ?? 0);
        setEditGlobalTasks(selectedUser.taskCompleted ?? 0);
        setIsEditing(true);
    };

    // Save this role's stats; optionally apply the same change to the global totals
    const saveRole = async (alsoGlobal: boolean) => {
        const newPoints = Math.max(0, editGlobalPoints);
        const newTasks = Math.max(0, editGlobalTasks);
        const ref = doc(db, "users", selectedUser.uid);
        const data = (await getDoc(ref)).data() ?? {};
        const roles: UserRoleData[] = Array.isArray(data.roles) ? data.roles : [];
        const current = roles.find(r => r.id === roleId);
        const updatedRoles = roles.map(r => r.id === roleId ? { ...r, points: newPoints, taskCompleted: newTasks } : r);
        const update: { roles: UserRoleData[]; points?: number; taskCompleted?: number } = { roles: updatedRoles };
        if (alsoGlobal) {
            update.points = Math.max(0, (data.points ?? 0) + (newPoints - (current?.points ?? 0)));
            update.taskCompleted = Math.max(0, (data.taskCompleted ?? 0) + (newTasks - (current?.taskCompleted ?? 0)));
        }
        await updateDoc(ref, update);
        setShowAccount?.({ ...selectedUser, roles: updatedRoles, points: newPoints, taskCompleted: newTasks });
        setIsEditing(false);
    };

    const saveGlobal = async () => {
        const newPoints = Math.max(0, editGlobalPoints);
        const newTasks = Math.max(0, editGlobalTasks);
        await updateDoc(doc(db, "users", selectedUser.uid), {
            points: newPoints,
            taskCompleted: newTasks,
        });
        setShowAccount?.({ ...selectedUser, points: newPoints, taskCompleted: newTasks });
        setIsEditing(false);
    };

    return (
        <div
            className={`fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4 transition-opacity duration-150 ${entered ? "opacity-100" : "opacity-0"}`}
            onClick={swtch}
        >
            <div
                className={`relative flex flex-col items-center bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden transition-all duration-150 ${entered ? "opacity-100 scale-100" : "opacity-0 scale-90"}`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Colored banner with the photo overlapping its bottom edge */}
                <div className="w-full h-20 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600" />
                <button
                    type="button"
                    onClick={swtch}
                    aria-label="Close"
                    className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/35 hover:cursor-pointer"
                >
                    <FontAwesomeIcon icon={faXmark} />
                </button>
                <div className="-mt-12 rounded-full ring-4 ring-white dark:ring-gray-900 bg-white dark:bg-gray-900">
                    <ProfileImg src={selectedUser.photoURL} alt={selectedUser.name} size="sm" />
                </div>

                <div className="flex flex-col items-center gap-4 w-full px-6 pt-3 pb-6">
                <div className="flex flex-col items-center gap-1.5 text-center">
                    <h1 className="text-xl font-bold break-words">{selectedUser.name}</h1>
                    {targetAccess !== "user" && <AccessBadge level={targetAccess} />}
                </div>

                {!isEditing ? (
                        <div
                            className="w-full flex flex-col gap-4"
                        >
                            <div className="w-full grid grid-cols-2 gap-3">
                                <div className="rounded-xl p-3 text-center bg-amber-50 border border-amber-100 dark:bg-amber-950/40 dark:border-amber-900/60">
                                    <p className="flex items-center justify-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 uppercase tracking-widest font-semibold mb-0.5">
                                        <FontAwesomeIcon icon={faTrophy} /> Points
                                    </p>
                                    <p className="text-2xl font-bold">{selectedUser.points}</p>
                                </div>
                                <div className="rounded-xl p-3 text-center bg-green-50 border border-green-100 dark:bg-green-950/40 dark:border-green-900/60">
                                    <p className="flex items-center justify-center gap-1.5 text-xs text-green-600 dark:text-green-400 uppercase tracking-widest font-semibold mb-0.5">
                                        <FontAwesomeIcon icon={faCircleCheck} /> Tasks
                                    </p>
                                    <p className="text-2xl font-bold">{selectedUser.taskCompleted}</p>
                                </div>
                            </div>
                            <p className="text-xs text-gray-400 text-center -mt-2">{inRolePage ? "In this role" : "Across all roles"}</p>

                            {(() => {
                                const roleNames = (selectedUser.roles ?? [])
                                    .filter(r => r.id !== GLOBAL_ROLE_ID)
                                    .map(r => r.name);
                                if (roleNames.length === 0) return null;
                                return (
                                    <div className="w-full">
                                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Roles</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {roleNames.map(name => (
                                                <span key={name} className="text-xs font-medium bg-blue-50 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900 px-2.5 py-1 rounded-full">
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="flex gap-2 w-full">
                                {isAdmin && <Button color="blue" size="full" onClick={openEdit}>Edit</Button>}
                                {isAdmin && !admins.includes(selectedUser.uid) && location.pathname.includes("/roles") &&
                                    <Button color="red" size="full" onClick={kick}>Kick</Button>
                                }
                                <Button color="cancel" size="full" onClick={swtch}>Close</Button>
                            </div>
                            {canRemoveFromGlobal && (
                                <Button color="red" size="full" onClick={removeFromGlobal}>Remove from Global</Button>
                            )}
                        </div>
                    ) : (
                        <div
                            className="w-full flex flex-col gap-4"
                        >
                            <p className="text-xs text-gray-400 uppercase tracking-widest text-center -mb-1">{editingRole ? "Edit Role Stats" : "Edit Global Stats"}</p>
                            <div className="flex gap-3">
                                <div className="flex flex-col gap-1.5 flex-1">
                                    <label className="text-xs text-gray-400 uppercase tracking-widest">Points</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={editGlobalPoints}
                                        onChange={e => setEditGlobalPoints(Math.max(0, +e.target.value))}
                                        className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5 flex-1">
                                    <label className="text-xs text-gray-400 uppercase tracking-widest">Tasks</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={editGlobalTasks}
                                        onChange={e => setEditGlobalTasks(Math.max(0, +e.target.value))}
                                        className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 w-full">
                                {!editingRole && <Button size="full" onClick={saveGlobal}>Save</Button>}
                                <Button color="cancel" size="full" onClick={() => setIsEditing(false)}>Back</Button>
                            </div>
                            {editingRole && (
                                <div className="flex flex-col gap-2 w-full -mt-2">
                                    <Button size="full" onClick={() => saveRole(false)}>Save to Role Only</Button>
                                    <Button size="full" color="blue" onClick={() => saveRole(true)}>Save to Role + Global</Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
