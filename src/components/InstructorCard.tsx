import { useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChalkboardUser, faChevronRight, faCircleCheck, faClipboardList, faCrown, faTrophy, faUsers, faXmark } from "@fortawesome/free-solid-svg-icons";
import AboutMeBlock from "./AboutMeBlock";
import { userPagePath } from "../lib/userPage";
import { db } from "../lib/firebase";
import { GLOBAL_ROLE_ID } from "../lib/firebaseService";
import { roleOwner, roleService } from "../lib/roleService";
import { alertDialog, confirmDialog } from "../lib/confirm";
import { MainContext } from "../context/MainContext";
import type { Role, UserData, UserRoleData } from "../myDataTypes";
import ProfileImg from "./ProfileImg";
import Button from "./Button";

/**
 * An instructor's card: their points, tasks completed, tasks given, the roles
 * they run and the roles they're in. Opened from the Admin page's Instructors
 * tab, and from a role's Instructors tab, where [role] adds the options to make
 * them its owner or take them off it.
 */
export default function InstructorCard({ uid, onClose, role }: { uid: string | null; onClose: () => void; role?: Role }) {
    return (
        <AnimatePresence>
            {uid && (
                <motion.div
                    key="instructor-card"
                    className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[85vh] overflow-y-auto"
                        initial={{ scale: 0.95, y: 10 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 10 }}
                        transition={{ duration: 0.15 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <CardBody uid={uid} onClose={onClose} role={role} />
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function CardBody({ uid, onClose, role }: { uid: string; onClose: () => void; role?: Role }) {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const location = useLocation();
    const [person, setPerson] = useState<UserData | null | undefined>(undefined);
    const [instructing, setInstructing] = useState<{ id: string; name: string }[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => onSnapshot(doc(db, "users", uid), snap => {
        setPerson(snap.exists() ? ({ uid: snap.id, id: snap.id, ...snap.data() } as UserData) : null);
    }, () => setPerson(null)), [uid]);

    // Every role they run
    useEffect(() => onSnapshot(query(collection(db, "roles"), where("instructors", "array-contains", uid)), snap => {
        setInstructing(snap.docs.filter(d => d.id !== GLOBAL_ROLE_ID).map(d => ({ id: d.id, name: (d.data().name as string) ?? "Untitled role" })));
    }, err => console.error("Error loading roles they run:", err)), [uid]);

    const me = context?.user?.uid ?? "";
    const isAdmin = (context?.admins ?? []).includes(me);
    const stillInstructor = (context?.instructors ?? []).includes(uid);
    const pagePath = userPagePath(uid, location.pathname);

    if (person === undefined) return <p className="text-sm text-gray-400 text-center py-12">Loading...</p>;
    if (person === null) {
        return (
            <div className="p-6 flex flex-col items-center gap-4">
                <p className="text-sm text-gray-500 text-center">This account no longer exists.</p>
                <Button onClick={onClose} size="sm" color="gray">Close</Button>
            </div>
        );
    }

    const name = person.name || "Unknown User";
    const instructingIds = new Set(instructing.map(r => r.id));
    const memberOf = (Array.isArray(person.roles) ? person.roles : [] as UserRoleData[])
        .filter(r => r.id !== GLOBAL_ROLE_ID && !instructingIds.has(r.id));

    // Role actions: admins, or this role's owner (who can hand the role on, and take other instructors off it)
    const ownerUid = role ? roleOwner(role) : "";
    const isOwner = !!role && ownerUid === uid;
    const canMakeOwner = !!role && !isOwner && stillInstructor && (isAdmin || ownerUid === me);
    const canClearOwner = !!role && isOwner && isAdmin;
    const canRemove = !!role && (role.instructors ?? []).includes(uid) && (isAdmin || (ownerUid === me && uid !== me));

    const act = async (action: () => Promise<unknown>, closeAfter = false) => {
        setBusy(true);
        try {
            await action();
            if (closeAfter) onClose();
        } catch (err) {
            console.error(err);
            await alertDialog("That didn't go through. Please try again.", "Something went wrong");
        } finally {
            setBusy(false);
        }
    };

    const makeOwner = async () => {
        if (!role) return;
        const handingOn = ownerUid === me && !isAdmin;
        const ok = await confirmDialog(
            handingOn
                ? `${name} will own ${role.name} instead of you. You'll stay one of its instructors, but you'll need ${name}'s approval for bigger changes.`
                : `${name} will own ${role.name}. Its other instructors will need ${name}'s approval to rename or reset it, edit members' stats, kick members or change the rewards title.`,
            { title: "Make Owner?", confirmLabel: "Make Owner" }
        );
        if (ok) await act(() => roleService.setRoleOwner(role.id, uid));
    };

    const clearOwner = async () => {
        if (!role) return;
        const ok = await confirmDialog(
            `${role.name} will have no owner, so its instructors' change requests will come to admins instead.`,
            { title: "Remove Owner?", confirmLabel: "Remove Owner", danger: true }
        );
        if (ok) await act(() => roleService.setRoleOwner(role.id, ""));
    };

    const remove = async () => {
        if (!role) return;
        const ok = await confirmDialog(
            `${name} will stay a member of ${role.name} but won't be able to run it any more.${isOwner ? " The role will be left without an owner." : ""}`,
            { title: "Remove Instructor?", confirmLabel: "Remove", danger: true }
        );
        if (ok) await act(() => roleService.removeRoleInstructor(role, uid), true);
    };

    const stats = [
        // Explicit dark colors: the theme only darkens bg-blue-50, so the amber and green boxes stayed light under white numbers
        { label: "Points", value: person.points ?? 0, icon: faTrophy, tint: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/15 dark:border-amber-500/40" },
        { label: "Tasks Done", value: person.taskCompleted ?? 0, icon: faCircleCheck, tint: "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-500/15 dark:border-green-500/40" },
        { label: "Tasks Given", value: person.tasksGiven ?? 0, icon: faClipboardList, tint: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-500/15 dark:border-blue-500/40" },
    ];

    return (
        <>
            <div className="h-20 bg-linear-to-br from-blue-500 via-blue-600 to-indigo-600" />
            <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute top-3 right-3 size-8 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors hover:cursor-pointer"
            >
                <FontAwesomeIcon icon={faXmark} />
            </button>
            <div className="px-6 pb-6 -mt-10 flex flex-col items-center gap-4">
                <div className="rounded-full bg-white p-1">
                    <ProfileImg src={person.photoURL} alt={name} size="sm" />
                </div>
                <div className="flex flex-col items-center gap-1.5 -mt-2 text-center">
                    <p className="text-xl font-bold leading-tight">{name}</p>
                    <div className="flex flex-wrap justify-center gap-1.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${stillInstructor ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                            {stillInstructor ? "Instructor" : "No longer an Instructor"}
                        </span>
                        {role && (role.instructors ?? []).includes(uid) && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${isOwner ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-700"}`}>
                                {isOwner && <FontAwesomeIcon icon={faCrown} className="text-[10px]" />}
                                {isOwner ? `Owner of ${role.name}` : `Runs ${role.name}`}
                            </span>
                        )}
                    </div>
                </div>

                <AboutMeBlock text={person.aboutMe} />

                <div className="grid grid-cols-3 gap-2 w-full">
                    {stats.map(s => (
                        <div key={s.label} className={`rounded-xl border px-2 py-3 flex flex-col items-center gap-0.5 ${s.tint}`}>
                            <span className="text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1 whitespace-nowrap">
                                <FontAwesomeIcon icon={s.icon} className="text-[10px]" />{s.label}
                            </span>
                            <span className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</span>
                        </div>
                    ))}
                </div>

                <RoleList title="Instructing" icon={faChalkboardUser} empty="Not running any roles." names={instructing.map(r => r.name)} />
                <RoleList title="Member of" icon={faUsers} empty="Not in any other roles." names={memberOf.map(r => r.name)} />

                {(canMakeOwner || canClearOwner || canRemove) && (
                    <div className="w-full flex flex-col gap-2 pt-4 border-t border-gray-100">
                        {canMakeOwner && <Button onClick={makeOwner} size="full" color="blue" disabled={busy}>Make Owner of {role!.name}</Button>}
                        {canClearOwner && <Button onClick={clearOwner} size="full" color="gray" disabled={busy}>Remove as Owner</Button>}
                        {canRemove && <Button onClick={remove} size="full" color="red" disabled={busy}>Remove as Instructor</Button>}
                    </div>
                )}
                {pagePath && (
                    <button
                        type="button"
                        onClick={() => { onClose(); navigate(pagePath); }}
                        className="group inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:cursor-pointer"
                    >
                        View their page
                        <FontAwesomeIcon icon={faChevronRight} className="text-xs transition-transform group-hover:translate-x-0.5" />
                    </button>
                )}
            </div>
        </>
    );
}

function RoleList({ title, icon, names, empty }: { title: string; icon: typeof faUsers; names: string[]; empty: string }) {
    return (
        <div className="w-full flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                <FontAwesomeIcon icon={icon} className="text-[10px]" />{title}
            </p>
            {names.length === 0 ? (
                <p className="text-sm text-gray-400">{empty}</p>
            ) : (
                <div className="flex flex-wrap gap-1.5">
                    {[...names].sort((a, b) => a.localeCompare(b)).map((n, i) => (
                        <span key={`${n}-${i}`} className="text-sm bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-lg">{n}</span>
                    ))}
                </div>
            )}
        </div>
    );
}
