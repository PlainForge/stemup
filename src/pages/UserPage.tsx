import { useContext, useEffect, useState } from "react";
import { motion } from "motion/react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChalkboardUser, faChevronRight, faCircleCheck, faClipboardList, faPen, faTrophy, faUsers } from "@fortawesome/free-solid-svg-icons";
import { db } from "../lib/firebase";
import { MainContext } from "../context/MainContext";
import { GLOBAL_ROLE_ID } from "../lib/firebaseService";
import type { AccessLevel, Role, UserData } from "../myDataTypes";
import Loading from "./Loading";
import ProfileImg from "../components/ProfileImg";
import AboutMeBlock from "../components/AboutMeBlock";
import RoleIcon from "../components/RoleIcon";
import BackButton from "../components/BackButton";
import { AccessBadge } from "./AdminPage";
import AdminUserPage from "./AdminUserPage";

/**
 * /users/:uid (and /roles/users/:uid, /tasks/users/:uid...) — anyone's page,
 * opened from "View their page" on a card, under the tab it was opened from. Everyone sees who they are, their stats and their roles (read
 * only); instructors can jump to the person's member page in a role they both
 * share and run, to edit their points and tasks. Admins get the full admin
 * user page, in the same tab.
 */
export default function UserPage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const { uid } = useParams<{ uid: string }>();

    const user = context?.user ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? [];
    const instructors = context?.instructors ?? [];
    const isAdmin = !!user && admins.includes(user.uid);

    // undefined while loading, null if the account no longer exists
    const [person, setPerson] = useState<UserData | null | undefined>(undefined);
    const [roles, setRoles] = useState<Role[]>([]);

    useEffect(() => {
        if (!user || !uid || isAdmin) return;
        const unsubs = [
            onSnapshot(doc(db, "users", uid), snap => setPerson(snap.exists() ? ({ ...snap.data(), uid: snap.id } as UserData) : null),
                () => setPerson(null)),
            // The roles they're in (for their names, icons and who runs them)
            onSnapshot(query(collection(db, "roles"), where("members", "array-contains", uid)), snap => {
                setRoles(snap.docs.filter(d => d.id !== GLOBAL_ROLE_ID).map(d => ({ id: d.id, ...(d.data() as Omit<Role, "id">) })));
            }, err => console.error("Error loading their roles:", err)),
        ];
        return () => unsubs.forEach(u => u());
    }, [user, uid, isAdmin]);

    if (uid && isAdmin) return <AdminUserPage />;
    if (loading || !user || !uid || person === undefined) return <Loading />;

    const goBack = () => {
        if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
        else navigate("/", { replace: true });
    };
    const back = <BackButton label="Back" onClick={goBack} />;

    if (person === null) {
        return (
            <div className="w-full max-w-2xl mx-auto flex flex-col gap-4 px-4 py-6">
                {back}
                <p className="text-gray-400 text-sm text-center py-8">This account no longer exists.</p>
            </div>
        );
    }

    const level: AccessLevel = admins.includes(uid) ? "admin" : instructors.includes(uid) ? "instructor" : "user";
    const name = person.name || "Unknown User";
    const myRoleStats = new Map((Array.isArray(person.roles) ? person.roles : []).map(r => [r.id, r]));
    const sorted = [...roles].sort((a, b) => a.name.localeCompare(b.name));
    const instructing = sorted.filter(r => (r.instructors ?? []).includes(uid));
    const memberOf = sorted.filter(r => !(r.instructors ?? []).includes(uid));
    // Roles the viewer runs, where they can edit this person's points and tasks
    const viewerRuns = (r: Role) => instructors.includes(user.uid) && (r.instructors ?? []).includes(user.uid) && uid !== user.uid;

    const stats = [
        { label: "Points", value: person.points ?? 0, icon: faTrophy, tint: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/15 dark:border-amber-500/40" },
        { label: "Tasks Done", value: person.taskCompleted ?? 0, icon: faCircleCheck, tint: "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-500/15 dark:border-green-500/40" },
        ...(level !== "user" ? [{ label: "Tasks Given", value: person.tasksGiven ?? 0, icon: faClipboardList, tint: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-500/15 dark:border-blue-500/40" }] : []),
    ];

    const card = "bg-white rounded-2xl border border-gray-100 shadow-sm p-6";
    const cardTitle = "text-sm font-semibold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2";

    const roleRow = (r: Role) => {
        const stat = myRoleStats.get(r.id);
        const manage = viewerRuns(r);
        const body = (
            <>
                <RoleIcon role={r} size="sm" />
                <span className="min-w-0 flex-1">
                    <span className="block font-medium truncate">{r.name}</span>
                    {stat && !(r.instructors ?? []).includes(uid) && (
                        <span className="block text-xs text-gray-400">
                            {stat.points ?? 0} pts · {stat.taskCompleted ?? 0} task{(stat.taskCompleted ?? 0) === 1 ? "" : "s"} done
                        </span>
                    )}
                </span>
                {manage && (
                    <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                        <FontAwesomeIcon icon={faPen} className="text-[10px]" /> Manage
                        <FontAwesomeIcon icon={faChevronRight} className="text-[10px] transition-transform group-hover:translate-x-0.5" />
                    </span>
                )}
            </>
        );
        const base = "group flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border border-gray-200 bg-white";
        return manage ? (
            <button
                key={r.id}
                type="button"
                onClick={() => navigate(`/instructor/roles/${r.id}/members/${uid}`)}
                title={`Edit ${name}'s points and tasks in ${r.name}`}
                className={`${base} transition-all duration-200 hover:border-gray-400 hover:shadow-sm hover:cursor-pointer`}
            >
                {body}
            </button>
        ) : (
            <div key={r.id} className={base}>{body}</div>
        );
    };

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
                        <ProfileImg src={person.photoURL} alt={name} size="sm" />
                    </div>
                    <h1 className="text-xl font-bold break-words">{name}</h1>
                    {level !== "user" && <AccessBadge level={level} />}
                    <AboutMeBlock text={person.aboutMe} className="mt-2" />
                </div>
            </div>

            {/* Their totals (admins don't earn points) */}
            {level !== "admin" && (
                <div className={`grid gap-3 ${stats.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                    {stats.map(s => (
                        <div key={s.label} className={`rounded-2xl border px-2 py-4 flex flex-col items-center gap-0.5 ${s.tint}`}>
                            <span className="text-[11px] font-semibold uppercase tracking-wide flex items-center gap-1 whitespace-nowrap">
                                <FontAwesomeIcon icon={s.icon} className="text-[10px]" />{s.label}
                            </span>
                            <span className="text-3xl font-bold text-gray-900 dark:text-white">{s.value}</span>
                        </div>
                    ))}
                </div>
            )}

            {level === "admin" ? (
                <div className={card}>
                    <p className="text-sm text-gray-500">{name} is an admin, so they're in every role automatically.</p>
                </div>
            ) : (
                <>
                    {level === "instructor" && (
                        <div className={card}>
                            <h2 className={cardTitle}><FontAwesomeIcon icon={faChalkboardUser} className="text-xs" />Instructing</h2>
                            {instructing.length === 0 ? (
                                <p className="text-sm text-gray-400">Not running any roles yet.</p>
                            ) : (
                                <div className="flex flex-col gap-2">{instructing.map(roleRow)}</div>
                            )}
                        </div>
                    )}
                    <div className={card}>
                        <h2 className={cardTitle}><FontAwesomeIcon icon={faUsers} className="text-xs" />{level === "instructor" ? "Member of" : "Roles"}</h2>
                        {memberOf.length === 0 ? (
                            <p className="text-sm text-gray-400">Not in any {level === "instructor" ? "other " : ""}roles yet.</p>
                        ) : (
                            <div className="flex flex-col gap-2">{memberOf.map(roleRow)}</div>
                        )}
                        {memberOf.some(viewerRuns) && (
                            <p className="text-xs text-gray-400 mt-3">Open a role you run to edit their points, tasks and membership there.</p>
                        )}
                    </div>
                </>
            )}
        </motion.div>
    );
}
