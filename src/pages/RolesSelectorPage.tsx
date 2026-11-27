import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useContext, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { type Role, type RoleInvite, type StemRequest } from '../myDataTypes';
import { canManageRole, isRoleStaff, roleService } from '../lib/roleService';
import { alertDialog } from '../lib/confirm';
import JoinButton from '../components/RoleJoinButton';
import Loading from './Loading';
import { MainContext } from '../context/MainContext';
import Input from '../components/Input';
import Button from '../components/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChalkboardUser, faEarthAmericas, faEnvelopeOpenText, faLock, faMagnifyingGlass, faPlus, faStar, faXmark } from '@fortawesome/free-solid-svg-icons';
import RoleIcon from '../components/RoleIcon';
import { useNavigate } from 'react-router-dom';



/** Stable fallback so hooks that depend on these lists don't re-run every render */
const NO_IDS: string[] = [];
export default function RolesSelectorPage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const [roleName, setRoleName] = useState("");
    const [purpose, setPurpose] = useState("");
    const [creating, setCreating] = useState(false);
    const [createStatus, setCreateStatus] = useState("");
    // The create / request a role menu, opened from the + next to the search bar
    const [createOpen, setCreateOpen] = useState(false);
    useEffect(() => {
        if (!createStatus) return;
        const t = setTimeout(() => setCreateStatus(""), 4000);
        return () => clearTimeout(t);
    }, [createStatus]);
    const [myRoleRequests, setMyRoleRequests] = useState<StemRequest[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    // Search by name or purpose, and show every role, only yours, or only ones you're not in
    const [search, setSearch] = useState("");
    const [accessFilter, setAccessFilter] = useState<"all" | "joined" | "notJoined">("all");
    const [requestsPerRole, setRequestsPerRole] = useState<Record<string, number>>({});
    const [submittedPerRole, setSubmittedPerRole] = useState<Record<string, number>>({});
    const [incompleteTasks, setIncompleteTasks] = useState<{ id: string; roleId: string }[]>([]);
    const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
    const [invites, setInvites] = useState<RoleInvite[]>([]);
    const [answering, setAnswering] = useState<string | null>(null);

    // Tasks the user has already submitted (awaiting review) no longer count as to-do
    const incompletePerRole: Record<string, number> = {};
    incompleteTasks.forEach(t => {
        if (t.roleId && !submittedIds.has(t.id)) incompletePerRole[t.roleId] = (incompletePerRole[t.roleId] || 0) + 1;
    });

    const user = context?.user ?? null;
    const userData = context?.userData ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? NO_IDS;
    const instructors = context?.instructors ?? NO_IDS;
    const access = context?.access ?? "user";

    useEffect(() => {
        if (!user) return;
        const rolesCol = collection(db, "roles");

        const unsub = onSnapshot(rolesCol, (rolesSnap) => {
            const rolesList: Role[] = rolesSnap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as Omit<Role, "id">),
            }));
            setRoles(rolesList);

            // Join requests, for the roles this person runs
            const counts: Record<string, number> = {};
            rolesList.forEach(r => {
                if (canManageRole(r, user.uid, admins, instructors)) counts[r.id] = (r.pendingRequests || []).length;
            });
            setRequestsPerRole(counts);
        }, (err) => {
            console.error("Error fetching roles:", err);
        });

        return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- admins/instructors arrays are compared by content via join
    }, [user, admins.join(","), instructors.join(",")]);

    // Invitations to join a role, from its instructors or an admin
    useEffect(() => {
        if (!user) return;
        return onSnapshot(query(collection(db, "invites"), where("uid", "==", user.uid)), snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as RoleInvite));
            list.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
            setInvites(list);
        }, err => console.error("Error loading invitations:", err));
    }, [user]);

    // The instructor's own role requests still waiting for an admin
    useEffect(() => {
        if (!user || access !== "instructor") {
            setMyRoleRequests([]);
            return;
        }
        const q = query(collection(db, "requests"), where("uid", "==", user.uid));
        return onSnapshot(q, (snap) => {
            setMyRoleRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as StemRequest)).filter(r => r.type === "createRole"));
        }, (err) => console.error("Error loading your requests:", err));
    }, [user, access]);

    useEffect(() => {
        if (!user || admins.includes(user.uid)) return;

        const q = query(
            collection(db, "tasks"),
            where("assignedTo", "==", user.uid),
            where("complete", "==", false)
        );
        const unsub = onSnapshot(q, (snap) => {
            setIncompleteTasks(snap.docs.map(d => ({ id: d.id, roleId: d.data().roleId as string })));
        });
        const submittedQ = query(
            collection(db, "tasksSubmitted"),
            where("assignedTo", "==", user.uid),
            where("complete", "==", false)
        );
        const unsubSubmitted = onSnapshot(submittedQ, (snap) => {
            setSubmittedIds(new Set(snap.docs.map(d => d.id)));
        }, (err) => console.error("Error fetching submitted tasks:", err));
        return () => { unsub(); unsubSubmitted(); };
    }, [user, admins]);

    useEffect(() => {
        if (!user || access === "user") return;

        const q = query(collection(db, "tasksSubmitted"), where("complete", "==", false));
        const unsub = onSnapshot(q, (snap) => {
            const counts: Record<string, number> = {};
            snap.docs.forEach(d => {
                const roleId = d.data().roleId as string;
                counts[roleId] = (counts[roleId] || 0) + 1;
            });
            setSubmittedPerRole(counts);
        });

        return () => unsub();
    }, [user, access]);

    if (!user || loading) return <Loading />

    const isAdmin = access === "admin";

    // Invite-only roles are hidden from everyone except their members, staff, and people invited to (or who already asked to join) them
    const listed = roles.filter(role => !role.name.match("global")
        && (!role.inviteOnly || (role.members ?? []).includes(user.uid) || canManageRole(role, user.uid, admins, instructors)
            || invites.some(inv => inv.roleId === role.id) || (role.pendingRequests ?? []).includes(user.uid)));
    const joinedCount = listed.filter(r => (r.members ?? []).includes(user.uid)).length;
    const accessCounts = { all: listed.length, joined: joinedCount, notJoined: listed.length - joinedCount };
    const term = search.trim().toLowerCase();
    const shown = listed.filter(role => {
        const isMember = (role.members ?? []).includes(user.uid);
        if (accessFilter === "joined" && !isMember) return false;
        if (accessFilter === "notJoined" && isMember) return false;
        return !term || role.name.toLowerCase().includes(term) || (role.purpose ?? "").toLowerCase().includes(term);
    });

    // Admins create roles straight away; instructors send the name and purpose to an admin
    const createRole = async () => {
        const name = roleName.trim();
        if (!name) return;
        if (!isAdmin && !purpose.trim()) {
            await alertDialog("Please describe what this role is for, so an admin can review it.", "Purpose needed");
            return;
        }
        setCreating(true);
        try {
            if (isAdmin) {
                await roleService.createRole(name, "");
                setCreateStatus(`Created "${name}".`);
            } else {
                await roleService.requestRoleCreation(user.uid, userData?.name ?? "", name, purpose);
                setCreateStatus(`Sent "${name}" to an admin for review.`);
            }
            setRoleName("");
            setPurpose("");
            setCreateOpen(false);
        } catch (err) {
            console.error(err);
            await alertDialog("Couldn't send that. Please try again.", "Something went wrong");
        } finally {
            setCreating(false);
        }
    };

    const answer = async (invite: RoleInvite, accept: boolean) => {
        setAnswering(invite.id);
        try {
            await roleService.respondToInvite(invite.roleId, accept);
            if (accept) navigate(`/roles/${invite.roleId}`);
        } catch (err) {
            console.error(err);
            const message = (err as { message?: string })?.message;
            await alertDialog(message && !message.includes("internal") ? message : "Couldn't answer the invitation. Please try again.", "Something went wrong");
        } finally {
            setAnswering(null);
        }
    };

    return (
        <motion.div
            className="w-full max-w-2xl mx-auto flex flex-col gap-6 px-4 py-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div>
                <h1 className="text-2xl font-bold">Available Roles</h1>
                <p className="text-sm text-gray-500 mt-0.5">Select a role to join and start earning points.</p>
            </div>

            {/* Search and the joined / not joined filter */}
            {(listed.length > 0 || access !== "user") && (
                <div className="flex flex-col gap-2 -mb-2">
                    <div className="flex items-center gap-2">
                    <label className="flex-1 min-w-0 flex items-center gap-2.5 rounded-xl border border-gray-200 px-3 py-2 transition-colors hover:border-gray-400 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10">
                        <FontAwesomeIcon icon={faMagnifyingGlass} className="text-xs text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search roles..."
                            aria-label="Search roles"
                            className="w-full min-w-0 bg-transparent text-sm focus:outline-none"
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="flex size-5 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 hover:cursor-pointer">
                                <FontAwesomeIcon icon={faXmark} className="text-xs" />
                            </button>
                        )}
                    </label>
                    {/* Instructors and admins: create a role (admins) or ask for one (instructors) */}
                    {access !== "user" && (
                        <button
                            type="button"
                            onClick={() => setCreateOpen(true)}
                            aria-label={isAdmin ? "Create a role" : "Request a new role"}
                            title={isAdmin ? "Create a role" : "Request a new role"}
                            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm transition-all duration-200 hover:bg-blue-700 hover:shadow active:scale-95 hover:cursor-pointer"
                        >
                            <FontAwesomeIcon icon={faPlus} />
                        </button>
                    )}
                    </div>
                    {createStatus && <p role="status" className="text-sm text-green-600 dark:text-green-400">{createStatus}</p>}
                    {listed.length > 0 && (
                    <div role="radiogroup" aria-label="Show roles" className="flex gap-1.5">
                        {([["all", "All"], ["joined", "Joined"], ["notJoined", "Not Joined"]] as const).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={accessFilter === key}
                                onClick={() => setAccessFilter(key)}
                                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors hover:cursor-pointer ${
                                    accessFilter === key ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                            >
                                {label} <span className="font-normal opacity-70">{accessCounts[key]}</span>
                            </button>
                        ))}
                    </div>
                    )}
                </div>
            )}

            <div className="flex flex-col gap-3">
                {shown.length > 0 ? shown.map((role) => {
                    const isActive = userData?.currentRole === role.id;
                    const isMember = (role.members ?? []).includes(user.uid);
                    // Admins and the role's instructors are in every member list but don't take part
                    const memberCount = (role.members ?? []).filter(uid => !isRoleStaff(role, uid, admins)).length;
                    return (
                        <motion.div
                            key={role.id}
                            // Members can click anywhere on the card to enter; others use the text on the right
                            onClick={isMember ? () => navigate(`/roles/${role.id}`) : undefined}
                            className={`group relative flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${
                                isMember ? "hover:cursor-pointer active:translate-y-0" : ""
                            } ${
                                isActive
                                    ? "border-blue-400 bg-blue-50 hover:border-blue-500"
                                    : "border-gray-200 bg-white hover:border-gray-400"
                            }`}
                            initial={{ x: -30, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                        >
                            {!canManageRole(role, user.uid, admins, instructors) && userData?.roles?.some(r => r.id === role.id) && (incompletePerRole[role.id] || 0) > 0 && (
                                <span className="absolute -top-2 -right-2 min-w-5 h-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full px-1 shadow">
                                    {incompletePerRole[role.id]}
                                </span>
                            )}
                            {/* The role's own icon; filled in, with a star, for your default role */}
                            <span className="relative shrink-0 transition-transform duration-200 group-hover:scale-105">
                                <RoleIcon role={role} solid={isActive} />
                                {isActive && (
                                    <span className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-amber-400 text-white ring-2 ring-white dark:ring-gray-900" title="Your default role">
                                        <FontAwesomeIcon icon={faStar} className="text-[9px]" />
                                    </span>
                                )}
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold truncate">{role.name}</p>
                                    {/* Whether anyone can ask to join, or only people who are invited */}
                                    {role.inviteOnly ? (
                                        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600" title="Hidden from the Roles page: people join by invitation">
                                            <FontAwesomeIcon icon={faLock} className="text-[9px]" />Invite only
                                        </span>
                                    ) : (
                                        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300" title="Anyone can find this role and ask to join">
                                            <FontAwesomeIcon icon={faEarthAmericas} className="text-[9px]" />Public
                                        </span>
                                    )}
                                    {canManageRole(role, user.uid, admins, instructors) && ((requestsPerRole[role.id] || 0) + (submittedPerRole[role.id] || 0)) > 0 && (
                                        <span className="relative flex size-2.5 shrink-0">
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
                                            <span className="relative inline-flex size-2.5 rounded-full bg-sky-500"></span>
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-500 truncate">
                                    {role.purpose?.trim() || `${memberCount} member${memberCount === 1 ? "" : "s"}`}
                                </p>
                            </div>
                            <div className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" onClick={e => e.stopPropagation()}>
                                <JoinButton role={role} />
                            </div>
                        </motion.div>
                    );
                }) : (
                    <p className="text-gray-400 text-sm text-center py-8">
                        {listed.length === 0 ? "No roles available at the moment."
                            : term ? `No roles match "${search.trim()}".`
                            : accessFilter === "joined" ? "You haven't joined any roles yet."
                            : "You're in every role."}
                    </p>
                )}
            </div>

            {/* Invitations, under the list and above creating a role */}
            {invites.length > 0 && (
                <div className="border-t border-gray-100 pt-6 flex flex-col gap-3">
                    <div>
                        <h2 className="text-base font-semibold">Invitations</h2>
                        <p className="text-sm text-gray-500 mt-0.5">You've been invited to join {invites.length === 1 ? "this role" : "these roles"}.</p>
                    </div>
                    {invites.map(inv => (
                        <motion.div
                            key={inv.id}
                            className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4 rounded-2xl border border-blue-200 bg-blue-50"
                            initial={{ x: -30, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                        >
                            <div className="flex items-center gap-4 min-w-0 flex-1">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                                    <FontAwesomeIcon icon={inv.as === "instructor" ? faChalkboardUser : faEnvelopeOpenText} />
                                </span>
                                <div className="min-w-0">
                                    <p className="font-semibold truncate">{inv.roleName}</p>
                                    <p className="text-sm text-gray-500">
                                        {inv.invitedByName || "An instructor"} invited you as {inv.as === "instructor" ? "an instructor" : "a member"}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <Button onClick={() => answer(inv, true)} size="xsm" color="green" disabled={answering === inv.id}>
                                    {answering === inv.id ? "Working..." : "Accept"}
                                </Button>
                                <Button onClick={() => answer(inv, false)} size="xsm" color="gray" disabled={answering === inv.id}>Decline</Button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Role requests this instructor sent, still waiting for an admin */}
            {access === "instructor" && myRoleRequests.length > 0 && (
                <div className="border-t border-gray-100 pt-6 flex flex-col gap-3">
                    {myRoleRequests.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <p className="text-xs text-gray-400 uppercase tracking-widest">Waiting for an admin</p>
                            {myRoleRequests.map(r => (
                                <div key={r.id} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl">
                                    <span className="text-sm font-medium truncate">{r.roleName}</span>
                                    <button
                                        onClick={() => roleService.deleteRequest(r.id)}
                                        className="text-xs text-gray-400 hover:text-red-500 transition-colors hover:cursor-pointer shrink-0"
                                    >
                                        Withdraw
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Create a role (admins) or request one (instructors) */}
            <AnimatePresence>
                {createOpen && access !== "user" && (
                    <motion.div
                        key="create-role"
                        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => !creating && setCreateOpen(false)}
                    >
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="create-role-title"
                            className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 flex flex-col gap-4"
                            initial={{ scale: 0.95, y: 10 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 10 }}
                            transition={{ duration: 0.15 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 id="create-role-title" className="text-lg font-semibold">{isAdmin ? "Create a Role" : "Request a New Role"}</h2>
                                    <p className="text-sm text-gray-500 mt-0.5">
                                        {isAdmin ? "Give the new role a name. You can change it later." : "An admin reviews it first. Once approved, you'll run the new role as its instructor."}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setCreateOpen(false)}
                                    aria-label="Close"
                                    className="size-8 -mr-2 shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors hover:cursor-pointer"
                                >
                                    <FontAwesomeIcon icon={faXmark} />
                                </button>
                            </div>
                            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); createRole(); }}>
                                <Input
                                    size="full"
                                    type="text"
                                    placeholder="Role name"
                                    value={roleName}
                                    setValue={setRoleName}
                                    maxLength={32}
                                    required={true}
                                    autocomplete="false"
                                />
                                {/* Admins create roles directly, so only instructors explain what a role is for */}
                                {!isAdmin && (
                                    <textarea
                                        value={purpose}
                                        onChange={e => setPurpose(e.target.value)}
                                        placeholder="What is this role for?"
                                        maxLength={500}
                                        rows={3}
                                        required
                                        className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors resize-none"
                                    />
                                )}
                                <div className="flex justify-end gap-2">
                                    <Button type="button" size="sm" color="gray" onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
                                    <Button type="submit" size="sm" disabled={creating}>{creating ? "Sending..." : isAdmin ? "Create" : "Send Request"}</Button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}