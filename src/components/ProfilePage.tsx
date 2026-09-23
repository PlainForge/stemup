import { useContext, useEffect, useState } from "react";
import { MainContext } from "../context/MainContext";
import Button from "./Button";
import ProfileImg from "./ProfileImg";
import { useLocation, useParams } from "react-router-dom";
import { firebaseAuthService, GLOBAL_ROLE_ID } from "../lib/firebaseService";
import { doc, updateDoc } from "firebase/firestore";
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

    const location = useLocation();
    const { id: roleId } = useParams<{ id: string }>();

    const swtch = () => {
        if (!setShowAccount) return;
        setIsEditing(false);
        setShowAccount(null);
    }

    if (!selectedUser || !user) return;

    const isAdmin = admins.includes(user.uid);

    const kick = async () => {
        const confirmKick = window.confirm(
            `Remove ${selectedUser.name} from this role?`
        );
        if (!confirmKick || !roleId) return;

        await firebaseAuthService.kickUserFromRole(roleId, selectedUser.uid);
        setShowAccount?.(null);
    }

    const isInGlobal = selectedUser.roles?.some(r => r.id === GLOBAL_ROLE_ID) ?? false;

    const removeFromGlobal = async () => {
        const confirmRemove = window.confirm(
            `Remove ${selectedUser.name} from the global leaderboard? They can be restored later from Old Users.`
        );
        if (!confirmRemove) return;

        await firebaseAuthService.removeFromGlobalRole(selectedUser.uid);
        setShowAccount?.(null);
    }

    const openEdit = () => {
        setEditGlobalPoints(selectedUser.points ?? 0);
        setEditGlobalTasks(selectedUser.taskCompleted ?? 0);
        setIsEditing(true);
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

                            <div className="flex gap-2 w-full">
                                {isAdmin && <Button color="gray" size="full" onClick={openEdit}>Edit</Button>}
                                {isAdmin && location.pathname.includes("/roles") &&
                                    <Button color="red" size="full" onClick={kick}>Kick</Button>
                                }
                                <Button color="gray" size="full" onClick={swtch}>Close</Button>
                            </div>
                            {isAdmin && isInGlobal && (
                                <Button color="red" size="full" onClick={removeFromGlobal}>Remove from Global</Button>
                            )}
                        </div>
                    ) : (
                        <div
                            className="w-full flex flex-col gap-4"
                        >
                            <p className="text-xs text-gray-400 uppercase tracking-widest text-center -mb-1">Edit Global Stats</p>
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
                                <Button size="full" onClick={saveGlobal}>Save</Button>
                                <Button color="gray" size="full" onClick={() => setIsEditing(false)}>Back</Button>
                            </div>
                        </div>
                    )}
            </div>
        </div>
    )
}
