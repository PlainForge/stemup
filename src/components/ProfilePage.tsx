import { useContext, useEffect, useState } from "react";
import { confirmDialog, alertDialog } from "../lib/confirm";
import { MainContext } from "../context/MainContext";
import Button from "./Button";
import ProfileImg from "./ProfileImg";
import { useLocation, useParams } from "react-router-dom";
import { firebaseAuthService, GLOBAL_ROLE_ID } from "../lib/firebaseService";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import type { UserRoleData } from "../myDataTypes";
import { db } from "../lib/firebase";


export default function ProfilePage() {
    const context = useContext(MainContext);
    const user = context?.user ?? null;
    const admins = context?.admins ?? [];
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
                className={`flex flex-col items-center bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs gap-4 transition-all duration-150 ${entered ? "opacity-100 scale-100" : "opacity-0 scale-90"}`}
                onClick={(e) => e.stopPropagation()}
            >
                <ProfileImg src={selectedUser.photoURL} />
                <h1 className="text-xl font-bold">{selectedUser.name}</h1>

                {!isEditing ? (
                        <div
                            className="w-full flex flex-col gap-4"
                        >
                            <div className="w-full grid grid-cols-2 gap-3">
                                <div className="bg-gray-50 rounded-xl p-3 text-center">
                                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Points</p>
                                    <p className="text-2xl font-bold">{selectedUser.points}</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 text-center">
                                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Tasks</p>
                                    <p className="text-2xl font-bold">{selectedUser.taskCompleted}</p>
                                </div>
                            </div>

                            {(() => {
                                const roleNames = (selectedUser.roles ?? [])
                                    .filter(r => r.id !== GLOBAL_ROLE_ID)
                                    .map(r => r.name);
                                if (roleNames.length === 0) return null;
                                return (
                                    <div className="w-full bg-gray-50 rounded-xl p-3">
                                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Roles</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {roleNames.map(name => (
                                                <span key={name} className="text-xs font-medium bg-white border border-gray-200 px-2.5 py-1 rounded-full">
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="flex gap-2 w-full">
                                {isAdmin && <Button color="gray" size="full" onClick={openEdit}>Edit</Button>}
                                {isAdmin && !admins.includes(selectedUser.uid) && location.pathname.includes("/roles") &&
                                    <Button color="red" size="full" onClick={kick}>Kick</Button>
                                }
                                <Button color="gray" size="full" onClick={swtch}>Close</Button>
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
                                <Button color="gray" size="full" onClick={() => setIsEditing(false)}>Back</Button>
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
    )
}
