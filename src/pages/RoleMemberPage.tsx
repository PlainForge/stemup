import { useContext, useEffect, useState } from "react";
import { motion } from "motion/react";
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faCircleCheck, faEnvelope, faTrophy } from "@fortawesome/free-solid-svg-icons";
import { db } from "../lib/firebase";
import { MainContext } from "../context/MainContext";
import { canChangeRole, canManageRole, isRoleStaff, roleOwner, roleService } from "../lib/roleService";
import { firebaseAuthService } from "../lib/firebaseService";
import { alertDialog, confirmDialog } from "../lib/confirm";
import type { AccessLevel, Role, StemRequest, SubmittedTask, Task, UserData, UserRoleData } from "../myDataTypes";
import Loading from "./Loading";
import Button from "../components/Button";
import ProfileImg from "../components/ProfileImg";
import AboutMeBlock from "../components/AboutMeBlock";
import { AccessBadge } from "./AdminPage";
import BackButton from "../components/BackButton";

/**
 * /admin/roles/:id/members/:uid and /instructor/roles/:id/members/:uid (and the older
 * /roles/:id/members/:uid) — one member of a role, for the people who run it:
 * their stats and tasks in this role, with editing and kicking.
 */
export default function RoleMemberPage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const { id: roleId, uid } = useParams<{ id: string; uid: string }>();

    const user = context?.user ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? [];
    const instructors = context?.instructors ?? [];
    const isAdmin = !!user && admins.includes(user.uid);

    // undefined while loading, null when missing
    const [role, setRole] = useState<Role | null | undefined>(undefined);
    const [member, setMember] = useState<UserData | null | undefined>(undefined);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [submitted, setSubmitted] = useState<SubmittedTask[]>([]);
    const [editing, setEditing] = useState(false);
    const [points, setPoints] = useState(0);
    const [taskCount, setTaskCount] = useState(0);
    const [busy, setBusy] = useState(false);
    // Change requests about this role (to show the ones already sent about this member)
    const [pendingRequests, setPendingRequests] = useState<StemRequest[]>([]);

    useEffect(() => {
        if (!roleId || !uid || !user) return;
        const unsubs = [
            onSnapshot(doc(db, "roles", roleId), snap => setRole(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Role, "id">) } : null),
                () => setRole(null)),
            onSnapshot(doc(db, "users", uid), snap => setMember(snap.exists() ? ({ ...snap.data(), uid: snap.id } as UserData) : null),
                () => setMember(null)),
            onSnapshot(query(collection(db, "tasks"), where("roleId", "==", roleId), where("assignedTo", "==", uid)),
                snap => setTasks(snap.docs.map(d => ({ ...d.data(), id: d.id } as Task))),
                err => console.error("Error loading tasks:", err)),
            onSnapshot(query(collection(db, "tasksSubmitted"), where("roleId", "==", roleId), where("assignedTo", "==", uid)),
                snap => setSubmitted(snap.docs.map(d => ({ ...d.data(), id: d.id } as SubmittedTask))),
                err => console.error("Error loading submissions:", err)),
            onSnapshot(query(collection(db, "requests"), where("roleId", "==", roleId)),
                snap => setPendingRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as StemRequest))),
                err => console.error("Error loading requests:", err)),
        ];
        return () => unsubs.forEach(u => u());
    }, [roleId, uid, user]);

    if (loading || !user || role === undefined || member === undefined || !roleId || !uid) return <Loading />;

    // The role page this member page sits under (Admin, Instructor or Roles tab), on its Members tab
    const fallbackBack = `${pathname.split("/members/")[0]}?tab=members`;
    const goBack = () => {
        // Back to wherever they came from (keeps the Members tab open), or the role's Members tab
        if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
        else navigate(fallbackBack, { replace: true });
    };
    const back = (
        <BackButton label="Members" onClick={goBack} />
    );
    const shell = (children: React.ReactNode) => (
        <motion.div className="w-full max-w-2xl mx-auto flex flex-col gap-4 px-4 py-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {back}
            {children}
        </motion.div>
    );

    if (!canManageRole(role, user.uid, admins, instructors)) {
        return shell(<p className="text-gray-400 text-sm text-center py-8">Only this role's instructors and admins can see member pages.</p>);
    }
    if (!role || !member || !(role.members ?? []).includes(uid)) {
        return shell(<p className="text-gray-400 text-sm text-center py-8">{!role ? "This role no longer exists." : "They're no longer in this role."}</p>);
    }

    const level: AccessLevel = admins.includes(uid) ? "admin" : instructors.includes(uid) ? "instructor" : "user";
    const staff = isRoleStaff(role, uid, admins);
    const stats = (member.roles ?? []).find((r: UserRoleData) => r.id === roleId);
    const rolePoints = stats?.points ?? 0;
    const roleTasks = stats?.taskCompleted ?? 0;
    const pendingIds = new Set(submitted.filter(s => !s.complete).map(s => s.id));
    const sortedTasks = [...tasks].sort((a, b) => Number(a.complete) - Number(b.complete) || (b.createdOn?.toMillis() ?? 0) - (a.createdOn?.toMillis() ?? 0));

    // Admins and the role's owner edit stats and kick directly; other instructors ask the owner
    const canChange = canChangeRole(role, user.uid, admins);
    const waitingOn = roleOwner(role) ? "the role's owner" : "an admin";
    const myRequests = pendingRequests.filter(r => r.uid === user.uid && r.targetUid === uid);
    const pendingEdit = myRequests.find(r => r.type === "editStats");
    const pendingKick = myRequests.find(r => r.type === "kickMember");

    const startEdit = () => {
        setPoints(rolePoints);
        setTaskCount(roleTasks);
        setEditing(true);
    };

    // Saves this role's stats; admins can apply the same change to the global totals
    const save = async (alsoGlobal: boolean) => {
        setBusy(true);
        if (!canChange) {
            try {
                await roleService.requestRoleChange("editStats", user.uid, context?.userData?.name ?? "", role, {
                    targetUid: uid, targetName: member.name, points, taskCompleted: taskCount,
                });
                setEditing(false);
                await alertDialog(`Sent to ${waitingOn} to approve.`, "Change requested");
            } catch (err) {
                console.error(err);
                await alertDialog("Couldn't send the request. Please try again.", "Not sent");
            } finally {
                setBusy(false);
            }
            return;
        }
        try {
            const ref = doc(db, "users", uid);
            const fresh = (await getDoc(ref)).data() ?? {};
            const roles: UserRoleData[] = Array.isArray(fresh.roles) ? fresh.roles : [];
            const update: { roles: UserRoleData[]; points?: number; taskCompleted?: number } = {
                roles: roles.map(r => r.id === roleId ? { ...r, points, taskCompleted: taskCount } : r),
            };
            if (alsoGlobal && isAdmin) {
                update.points = Math.max(0, (fresh.points ?? 0) + (points - rolePoints));
                update.taskCompleted = Math.max(0, (fresh.taskCompleted ?? 0) + (taskCount - roleTasks));
            }
            await updateDoc(ref, update);
            setEditing(false);
        } catch (err) {
            console.error(err);
            await alertDialog("Couldn't save their stats. Please try again.", "Not saved");
        } finally {
            setBusy(false);
        }
    };

    const kick = async () => {
        if (!canChange) {
            const ok = await confirmDialog(
                `Ask ${waitingOn} to remove ${member.name} from ${role.name}? Their tasks in this role are deleted if it's approved.`,
                { title: "Request Kick", confirmLabel: "Send Request", danger: true }
            );
            if (!ok) return;
            setBusy(true);
            try {
                await roleService.requestRoleChange("kickMember", user.uid, context?.userData?.name ?? "", role, { targetUid: uid, targetName: member.name });
            } catch (err) {
                console.error(err);
                await alertDialog("Couldn't send the request. Please try again.", "Not sent");
            } finally {
                setBusy(false);
            }
            return;
        }
        const ok = await confirmDialog(`Remove ${member.name} from ${role.name}? Their tasks in this role are deleted.`, { title: "Kick Member", confirmLabel: "Kick", danger: true });
        if (!ok) return;
        setBusy(true);
        try {
            await firebaseAuthService.kickUserFromRole(roleId, uid);
            goBack();
        } catch (err) {
            console.error(err);
            await alertDialog("Couldn't remove them. Please try again.", "Not removed");
            setBusy(false);
        }
    };

    const card = "bg-white rounded-2xl border border-gray-100 shadow-sm p-6";
    const cardTitle = "text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4";
    const numberInput = "w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors";

    return shell(<>
        {/* Who they are */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="h-20 bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600" />
            <div className="flex flex-col items-center gap-2 px-6 pb-6 text-center">
                <div className="-mt-12 rounded-full ring-4 ring-white dark:ring-gray-900 bg-white dark:bg-gray-900">
                    <ProfileImg src={member.photoURL} alt={member.name} size="sm" />
                </div>
                <h1 className="text-xl font-bold break-words">{member.name}</h1>
                <div className="flex flex-wrap justify-center gap-1.5">
                    {level !== "user" && <AccessBadge level={level} />}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {(role.instructors ?? []).includes(uid) ? `Instructor of ${role.name}` : `Member of ${role.name}`}
                    </span>
                </div>
                {/* Emails are for admins only */}
                {isAdmin && member.email && (
                    <p className="mt-1 inline-flex items-center gap-2 text-sm text-gray-500 break-all">
                        <FontAwesomeIcon icon={faEnvelope} className="text-gray-400" /> {member.email}
                    </p>
                )}
                {isAdmin && (
                    <button
                        type="button"
                        onClick={() => navigate(`/admin/users/${uid}`)}
                        className="group mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:cursor-pointer"
                    >
                        Open in Admin
                        <FontAwesomeIcon icon={faChevronRight} className="text-xs transition-transform group-hover:translate-x-0.5" />
                    </button>
                )}
                <AboutMeBlock text={member.aboutMe} className="mt-2" />
            </div>
        </div>

        {/* Stats in this role */}
        {!staff && (
            <div className={card}>
                <h2 className={cardTitle}>In {role.name}</h2>
                {!editing ? (
                    <div className="flex flex-col gap-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl p-3 text-center bg-amber-50 border border-amber-100 dark:bg-amber-950/40 dark:border-amber-900/60">
                                <p className="flex items-center justify-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 uppercase tracking-widest font-semibold mb-0.5">
                                    <FontAwesomeIcon icon={faTrophy} /> Points
                                </p>
                                <p className="text-2xl font-bold">{rolePoints}</p>
                            </div>
                            <div className="rounded-xl p-3 text-center bg-green-50 border border-green-100 dark:bg-green-950/40 dark:border-green-900/60">
                                <p className="flex items-center justify-center gap-1.5 text-xs text-green-600 dark:text-green-400 uppercase tracking-widest font-semibold mb-0.5">
                                    <FontAwesomeIcon icon={faCircleCheck} /> Tasks
                                </p>
                                <p className="text-2xl font-bold">{roleTasks}</p>
                            </div>
                        </div>
                        {/* Requests already sent to the owner about this member */}
                        {[pendingEdit, pendingKick].filter(r => !!r).map(r => (
                            <div key={r.id} className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                <p className="text-sm text-amber-700">
                                    {r.type === "editStats" ? `You asked to set their stats to ${r.points ?? 0} pts and ${r.taskCompleted ?? 0} tasks.` : "You asked to kick them."} Waiting for {waitingOn}.
                                </p>
                                <Button onClick={() => roleService.deleteRequest(r.id)} size="xsm" color="cancel" extraClasses="shrink-0">Withdraw</Button>
                            </div>
                        ))}
                        {!canChange && <p className="text-xs text-gray-400">Changes to their stats and kicking them need {waitingOn}'s approval.</p>}
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={startEdit} color="blue" size="sm" disabled={!!pendingEdit}>{canChange ? "Edit Stats" : "Request Stat Change"}</Button>
                            <Button onClick={kick} color="red" size="sm" disabled={busy || !!pendingKick}>{canChange ? "Kick from Role" : "Request Kick"}</Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="flex gap-3">
                            <label className="flex flex-col gap-1.5 flex-1 text-xs text-gray-400 uppercase tracking-widest">
                                Points
                                <input type="number" min={0} value={points} onChange={e => setPoints(Math.max(0, +e.target.value))} className={numberInput} />
                            </label>
                            <label className="flex flex-col gap-1.5 flex-1 text-xs text-gray-400 uppercase tracking-widest">
                                Tasks Completed
                                <input type="number" min={0} value={taskCount} onChange={e => setTaskCount(Math.max(0, +e.target.value))} className={numberInput} />
                            </label>
                        </div>
                        {/* Only admins change global totals; instructors edit this role's stats only */}
                        {isAdmin && (points !== rolePoints || taskCount !== roleTasks) && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
                                <p className="font-semibold mb-0.5">Global impact if saved with global:</p>
                                <p>
                                    Points: {member.points ?? 0} to {Math.max(0, (member.points ?? 0) + (points - rolePoints))}
                                    {" · "}
                                    Tasks: {member.taskCompleted ?? 0} to {Math.max(0, (member.taskCompleted ?? 0) + (taskCount - roleTasks))}
                                </p>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={() => save(false)} size="sm" disabled={busy}>{isAdmin ? "Save to Role Only" : canChange ? "Save" : "Send Request"}</Button>
                            {isAdmin && <Button onClick={() => save(true)} color="blue" size="sm" disabled={busy}>Save to Role + Global</Button>}
                            <Button onClick={() => setEditing(false)} color="cancel" size="sm" disabled={busy}>Cancel</Button>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* Their tasks in this role */}
        {!staff && (
            <div className={card}>
                <h2 className={cardTitle}>Tasks</h2>
                {sortedTasks.length === 0 ? (
                    <p className="text-sm text-gray-400">No tasks in this role yet.</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {sortedTasks.map(t => {
                            const overdue = !t.complete && !!t.dueDate && t.dueDate.toDate() < new Date();
                            const [label, color] = t.complete ? ["Done", "bg-green-100 text-green-700"]
                                : pendingIds.has(t.id) ? ["Submitted", "bg-blue-100 text-blue-700"]
                                : overdue ? ["Overdue", "bg-red-100 text-red-600"]
                                : [t.status ?? "To do", "bg-gray-100 text-gray-600"];
                            return (
                                <div key={t.id} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 px-4 py-3 rounded-xl">
                                    <div className="min-w-0">
                                        <p className={`text-sm font-medium truncate ${t.complete ? "text-gray-400 line-through" : ""}`}>{t.title}</p>
                                        <p className="text-xs text-gray-400">
                                            {t.points} pts
                                            {t.dueDate ? ` · Due ${t.dueDate.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        )}

        {staff && (
            <div className={card}>
                <p className="text-sm text-gray-500">
                    {level === "admin" ? "Admins" : "This role's instructors"} run the role rather than take part, so they have no stats or tasks here.
                </p>
            </div>
        )}
    </>);
}
