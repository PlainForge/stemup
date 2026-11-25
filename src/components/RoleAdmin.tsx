import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, onSnapshot, query, Timestamp, updateDoc, where } from "firebase/firestore";
import { alertDialog, confirmDialog, promptDialog } from "../lib/confirm";
import { roleService, isRoleStaff } from "../lib/roleService";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSlidingIndicator } from "../lib/useSlidingIndicator";
import { motion } from "motion/react";
import { useContext, useEffect, useState, type FormEvent } from "react";
import { db } from "../lib/firebase";
import { type Role, type StemRequest, type SubmittedTask, type Task, type UserData, type UserRoleData } from "../myDataTypes";
import { MainContext } from "../context/MainContext";
import LinkButton from "./LinkButton";
import Button from "./Button";
import Input from "./Input";
import { Alert } from "./PhraseAlert";
import ProfileImg from "./ProfileImg";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import PersonPicker from "./PersonPicker";
import MedalIcon from "./MedalIcon";
import ErrorMessage from "./ErrorMessage";

function taskIsOverdue(task: Task): boolean {
    return !task.complete && !!task.dueDate && task.dueDate.toDate() < new Date();
}

function daysUntilDeleteAt(task: Task): number | null {
    if (!task.deleteAt) return null;
    return Math.ceil((task.deleteAt.toDate().getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function applySortTasks<T extends { title: string; createdOn?: { toDate(): Date } }>(tasks: T[], sort: string): T[] {
    return [...tasks].sort((a, b) => {
        if (sort === "title-asc") return a.title.localeCompare(b.title);
        if (sort === "title-desc") return b.title.localeCompare(a.title);
        const aMs = a.createdOn?.toDate().getTime() ?? 0;
        const bMs = b.createdOn?.toDate().getTime() ?? 0;
        return sort === "date-asc" ? aMs - bMs : bMs - aMs;
    });
}

function applySortSubmitted<T extends { title: string; submission?: { toDate(): Date } }>(tasks: T[], sort: string): T[] {
    return [...tasks].sort((a, b) => {
        if (sort === "title-asc") return a.title.localeCompare(b.title);
        if (sort === "title-desc") return b.title.localeCompare(a.title);
        const aMs = a.submission?.toDate().getTime() ?? 0;
        const bMs = b.submission?.toDate().getTime() ?? 0;
        return sort === "date-asc" ? aMs - bMs : bMs - aMs;
    });
}

const MONTH_OPTIONS = Array.from({ length: 13 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return {
        label: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
        key: `${d.getFullYear()}-${d.getMonth()}`,
    };
});

interface prop {
    role: Role,
    membersWithData: UserData[],
    requested: string[],
}

/**
 * Everything for running a role: join requests, tasks, members, instructors,
 * rewards and settings. Shown as the role page's Instructor tab for the role's
 * instructors, and on the admin role page (/admin/roles/:id) for admins.
 */
export default function RoleAdminPage({ role, membersWithData, requested } : prop) {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const [pendingReset, setPendingReset] = useState<StemRequest | null>(null);
    const [instructorProfiles, setInstructorProfiles] = useState<{ uid: string; name: string; photoURL: string }[]>([]);
    const [addInstructorUid, setAddInstructorUid] = useState("");
    const [rewardsTitle, setRewardsTitle] = useState(role.rewardsTitle ?? "");
    const [phrase5, setPhrase5] = useState(""); // Rewards title phrase
    // The open tab lives in the URL (?tab=), so coming back from a member's page lands on the same tab
    const [searchParams, setSearchParams] = useSearchParams();
    const page = searchParams.get("tab") ?? "requests";
    const setPage = (tab: string) => setSearchParams(p => {
        const next = new URLSearchParams(p);
        next.set("tab", tab);
        return next;
    }, { replace: true });
    const [userRequested, setUserRequested] = useState<UserData[]>([]);
    const [createTaskFor, setCreateSetTaskFor] = useState<string[]>([]);
    const [assignError, setAssignError] = useState("");
    const [phrase, setPhrase] = useState(""); // Role name change phrase
    const [phrase2, setPhrase2] = useState(""); // Role reset phrase
    const [phrase3, setPhrase3] = useState(""); // Role reward phrase
    const [phrase4, setPhrase4] = useState(""); // Sent task phrase
    const showInGlobal = role.showInGlobalLeaderboard ?? false;
    const [allTasks, setAllTasks] = useState<Task[]>([]);
    const [taskFilter, setTaskFilter] = useState<"all" | "pending" | "done" | "submitted">("all");
    const [taskSearch, setTaskSearch] = useState("");
    const [taskMonthFilter, setTaskMonthFilter] = useState("all");
    const [taskSort, setTaskSort] = useState("date-desc");
    const [allSubmitted, setAllSubmitted] = useState<SubmittedTask[]>([]);
    const [reassignTaskId, setReassignTaskId] = useState<string | null>(null);
    const [reassignTo, setReassignTo] = useState("");
    const tabBar = useSlidingIndicator(page);
    const [editTaskId, setEditTaskId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDesc, setEditDesc] = useState("");
    const [editPts, setEditPts] = useState(0);
    const [editDue, setEditDue] = useState("");

    // Listen for all tasks in this role
    useEffect(() => {
        const q = query(collection(db, "tasks"), where("roleId", "==", role.id));
        const unsub = onSnapshot(q, (snap) => {
            setAllTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
        });
        return () => unsub();
    }, [role.id]);

    // Listen for all submitted tasks in this role (including approved)
    useEffect(() => {
        const q = query(collection(db, "tasksSubmitted"), where("roleId", "==", role.id));
        const unsub = onSnapshot(q, (snap) => {
            setAllSubmitted(snap.docs.map(d => ({ id: d.id, ...d.data() } as SubmittedTask)));
        });
        return () => unsub();
    }, [role.id]);

    // A reset this role is waiting on an admin to approve
    useEffect(() => {
        const q = query(collection(db, "requests"), where("roleId", "==", role.id));
        return onSnapshot(q, (snap) => {
            const reset = snap.docs.map(d => ({ id: d.id, ...d.data() } as StemRequest)).find(r => r.type === "resetRole");
            setPendingReset(reset ?? null);
        }, (err) => console.error("Error loading reset requests:", err));
    }, [role.id]);

    // Names and photos for the people who can run this role, and for every instructor that could be added
    const allInstructors = context?.instructors ?? [];
    const instructorsKey = Array.from(new Set([...(role.instructors ?? []), ...allInstructors])).join(",");
    useEffect(() => {
        const uids = instructorsKey ? instructorsKey.split(",") : [];
        let cancelled = false;
        Promise.all(uids.map(uid => getDoc(doc(db, "users", uid)))).then(snaps => {
            if (cancelled) return;
            setInstructorProfiles(snaps.filter(s => s.exists()).map(s => ({
                uid: s.id,
                name: (s.data()!.name as string) ?? "Unknown User",
                photoURL: (s.data()!.photoURL as string) ?? "",
            })));
        });
        return () => { cancelled = true; };
    }, [instructorsKey]);

    useEffect(() => setRewardsTitle(role.rewardsTitle ?? ""), [role.rewardsTitle]);

    // Get Users that requested
    useEffect(() => {
        // Always prune users no longer in the requested list
        setUserRequested((prev) => prev.filter((u) => requested.includes(u.uid)));

        if (requested.length < 1) return;

        const unsubs: (() => void)[] = [];

        requested.forEach((uid) => {
            const ref = doc(db, "users", uid);
            const unsub = onSnapshot(ref, (snap) => {
                if (snap.exists()) {
                    setUserRequested((prev) => {
                        const others = prev.filter((u) => u.uid !== uid);
                        return [...others, { uid, ...(snap.data() as Omit<UserData, "uid">) }];
                    });
                }
            });
            unsubs.push(unsub);
        });

        return () => unsubs.forEach((u) => u());
    }, [requested])

    

    // Sending a task to a user in the current role
    const sendTask = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const form = e.currentTarget;
        const formData = new FormData(form);
        const desc = formData.get("desc") as string;
        const title = formData.get("title") as string;
        const pts = Number(formData.get("pts"));

        if (!title || pts < 0) {
            console.error("Invalid title or points");
            return;
        }

        if (createTaskFor.length === 0) {
            setAssignError("Please select at least one member.");
            return;
        }
        setAssignError("");

        const dueDateStr = formData.get("dueDate") as string;
        let dueDate: Timestamp | null = null;
        let deleteAt: Timestamp | null = null;
        if (dueDateStr) {
            const [y, m, d] = dueDateStr.split("-").map(Number);
            const dueDateObj = new Date(y, m - 1, d, 23, 59, 59);
            dueDate = Timestamp.fromDate(dueDateObj);
            deleteAt = Timestamp.fromDate(new Date(dueDateObj.getTime() + 7 * 24 * 60 * 60 * 1000));
        }

        try {

            for (const uid of createTaskFor) {
                const selectedUser = membersWithData.find((m) => m.uid === uid);
                if (!selectedUser) continue;

                await addDoc(collection(db, "tasks"), {
                    assignedTo: selectedUser.uid,
                    assignedName: selectedUser.name,
                    description: desc,
                    points: pts,
                    roleId: role.id,
                    createdOn: Timestamp.now(),
                    complete: false,
                    title,
                    ...(dueDate ? { dueDate, deleteAt } : {}),
                });
            }

            // Reset
            setPhrase4("Task(s) created successfully");
            form.reset();
            setCreateSetTaskFor([]);
        } catch (err) {
            console.error(err);
        }
    }

    // Change the current role's name
    const changeRoleName = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget)
        const newName = formData.get("newName") as string;

        if (newName.length < 1) return;
        try {
            await updateDoc(doc(db, "roles", role.id), {
                name: newName
            })
            setPhrase("Role name updated successfully");
            e.currentTarget.reset();
        } catch (err) {
            console.log(err);
        }
    }

    // Accept user's join request for the current role
    const acceptRequest = async (id: string | undefined) => {
        if (!id) return console.log("no id given");

        const snap = await getDoc(doc(db, "users", id));
        if (!snap.exists()) {
            console.log("user not found");
            return
        }

        const thisUser : UserData = {
            uid: id,
            ...(snap.data() as Omit<UserData, "uid">)
        }

        try {
            // One write, so the notification function sees them join rather than a decline
            await updateDoc(doc(db, "roles", role.id), {
                pendingRequests: arrayRemove(id),
                members: arrayUnion(thisUser.uid),
            })
            await updateDoc(doc(db, "users", id), {
                roles: arrayUnion({
                    id: role.id, 
                    name: role.name,
                    points: 0,
                    taskCompleted: 0
                })
            })
        } catch (err) {
            console.log(err);
        }
    }

    // Decline user's join request for the current role
    const declineRequest = async (id: string | undefined) => {
        if (!id) return console.log("no id given");

        const snap = await getDoc(doc(db, "users", id));
        if (!snap.exists()) {
            console.log("user not found");
            return
        }

        try {
            await updateDoc(doc(db, "roles", role.id), {
                pendingRequests: arrayRemove(id)
            })
        } catch (err) {
            console.log(err);
        }
    }

    // Accept a submitted task from a user
    const acceptTask = async (submitted : SubmittedTask) => {
        if (!submitted) return;
        const addedPts = submitted.points || 0;
        const thisUser = submitted.assignedTo;

        try {
            const oneYear = Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
            await updateDoc(doc(db, "tasks", submitted.id), {
                complete: true,
                deleteAt: oneYear,
            });
            await updateDoc(doc(db, "tasksSubmitted", submitted.id), {
                complete: true
            });

            const userRef = doc(db, "users", thisUser);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) return;

            const userData = userSnap.data() as UserData;
            const roles: UserRoleData[] = Array.isArray(userData.roles) ? userData.roles : [];

            const updatedRoles = roles.map(r => {
                if (r.id === submitted.roleId) {
                    return {
                        ...r,
                        points: (r.points || 0) + addedPts,
                        taskCompleted: (r.taskCompleted || 0) + 1
                    };
                }
                return r;
            });

            await updateDoc(userRef, {
                roles: updatedRoles,
                points: userData.points + addedPts,
                taskCompleted: userData.taskCompleted + 1
            });            
        } catch (err) {
            console.log(err);
        }
    }

    const declineTask = async (submitted: SubmittedTask) => {
        if (!submitted) return;
        try {
            const taskSnap = await getDoc(doc(db, "tasks", submitted.id));
            const currentCount: number = (taskSnap.data()?.declineCount ?? 0);
            const newCount = currentCount + 1;

            if (newCount >= 3) {
                const oneYear = Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
                await updateDoc(doc(db, "tasks", submitted.id), {
                    complete: true,
                    declineCount: newCount,
                    deleteAt: oneYear,
                    extensionRequested: false,
                });
                await deleteDoc(doc(db, "tasksSubmitted", submitted.id));
            } else {
                await updateDoc(doc(db, "tasks", submitted.id), { declineCount: newCount });
                await deleteDoc(doc(db, "tasksSubmitted", submitted.id));
            }
        } catch (err) {
            console.log(err);
        }
    }

    const acceptExtension = async (taskId: string, currentPoints: number) => {
        const newDueDate = Timestamp.fromDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
        const newDeleteAt = Timestamp.fromDate(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000));
        await updateDoc(doc(db, "tasks", taskId), {
            dueDate: newDueDate,
            deleteAt: newDeleteAt,
            extensionRequested: false,
            points: Math.round(currentPoints * 0.6),
        });
    };

    const declineExtension = async (taskId: string) => {
        await updateDoc(doc(db, "tasks", taskId), {
            extensionDeclined: true,
            extensionRequested: false,
        });
    };

    const isAdmin = !!context?.user && (context.admins ?? []).includes(context.user.uid);

    // Admins reset straight away; instructors send the reset to an admin to approve
    const resetRole = async () => {
        const saveName = await promptDialog(
            isAdmin
                ? "Every member's points and tasks completed in this role are saved under this name on the Saved Data tab, then cleared along with all tasks and prizes."
                : "Name this save. An admin will review the reset; once approved, every member's points and tasks completed are saved under this name on the Saved Data tab, then cleared along with all tasks and prizes.",
            {
                title: isAdmin ? "Reset Role" : "Request Reset",
                confirmLabel: isAdmin ? "Reset" : "Send Request",
                danger: isAdmin,
                input: { placeholder: `e.g. ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}` },
            }
        );
        if (saveName === null) return;
        if (!saveName.trim()) {
            await alertDialog("Please enter a name for the saved data.", "Name needed");
            return;
        }
        try {
            if (isAdmin) {
                await roleService.resetRole(role.id, saveName.trim());
                setPhrase2("Role reset. Its data is on the Saved Data tab.");
            } else {
                await roleService.requestRoleReset(context!.user!.uid, context!.userData?.name ?? "", role, saveName);
                setPhrase2("Reset requested. An admin will review it.");
            }
        } catch (err) {
            console.error("Error resetting role:", err);
            await alertDialog("Couldn't reset the role. Please try again.", "Reset failed");
        }
    };

    const cancelResetRequest = async () => {
        if (!pendingReset) return;
        await roleService.deleteRequest(pendingReset.id);
    };

    const deleteRole = async () => {
        const confirmDelete = await confirmDialog("Are you sure you want to delete this role? This cannot be undone.", { title: "Delete Role", confirmLabel: "Delete", danger: true });
        if (!confirmDelete) return;
        try {
            await roleService.deleteRole(role.id);
            navigate("/admin", { replace: true });
        } catch (err) {
            console.error(err);
            await alertDialog("Couldn't delete the role. Please try again.", "Delete failed");
        }
    };

    const saveRewardsTitle = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        try {
            await roleService.setRewardsTitle(role.id, rewardsTitle);
            setPhrase5(rewardsTitle.trim() ? "Title updated" : "Title reset to the current month");
        } catch (err) {
            console.error(err);
        }
    };

    const setReward = async (e : FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const form = e.currentTarget;
        const formData = new FormData(e.currentTarget)
        const first = formData.get("first") as string;
        const second = formData.get("second") as string;
        const third = formData.get("third") as string;

        try {
            await updateDoc(doc(db, "rewards", role.id), {
                first,
                second,
                third
            })

            setPhrase3("Rewards updated successfully");
            form.reset();
        } catch (err) {
            console.log(err);
        }
    }

    if (!context) return null;
    const {user, userData, loading, admins} = context

    if (!user || !userData || loading) {
        return <h1>Loading...</h1>
    }

    const roleInstructors = role.instructors ?? [];
    const addableInstructors = instructorProfiles.filter(p => allInstructors.includes(p.uid) && !roleInstructors.includes(p.uid) && !admins.includes(p.uid));

    const addInstructor = async () => {
        const person = instructorProfiles.find(p => p.uid === addInstructorUid);
        if (!person) return;
        try {
            await roleService.addRoleInstructor(role, person.uid);
            setAddInstructorUid("");
        } catch (err) {
            console.error("Error adding instructor:", err);
        }
    };

    const removeInstructor = async (uid: string, name: string) => {
        const isSelf = uid === user.uid;
        const ok = await confirmDialog(
            isSelf
                ? "You'll stay a member of this role but won't be able to run it any more."
                : `${name} will stay a member of this role but won't be able to run it any more.`,
            { title: isSelf ? "Leave as Instructor?" : "Remove Instructor?", confirmLabel: "Remove", danger: true }
        );
        if (!ok) return;
        await roleService.removeRoleInstructor(role.id, uid);
    };

    const toggleGlobalLeaderboard = async () => {
        await updateDoc(doc(db, "roles", role.id), { showInGlobalLeaderboard: !showInGlobal });
    };

    // Admins and the role's instructors aren't given tasks or ranked
    const nonAdminMembers = membersWithData.filter((m) => !isRoleStaff(role, m.uid, admins));

    // Remove a task entirely (completed or not). Points already awarded are left as-is.
    const removeTask = async (task: Task) => {
        const ok = await confirmDialog(
            `Remove "${task.title}" assigned to ${task.assignedName}?${task.complete ? " Points already awarded stay with the member." : ""}`,
            { title: "Remove Task", confirmLabel: "Remove", danger: true }
        );
        if (!ok) return;
        try {
            await Promise.all([
                deleteDoc(doc(db, "tasks", task.id)),
                deleteDoc(doc(db, "tasksSubmitted", task.id)),
            ]);
        } catch (err) {
            console.error("Error removing task:", err);
        }
    };

    const startEditTask = (task: Task) => {
        const d = task.dueDate?.toDate();
        setReassignTaskId(null);
        setEditTaskId(task.id);
        setEditTitle(task.title);
        setEditDesc(task.description ?? "");
        setEditPts(task.points);
        setEditDue(d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");
    };

    // Save edits to an unfinished task (and any pending submission so approval awards the new points)
    const saveTaskEdit = async (task: Task) => {
        const title = editTitle.trim();
        if (!title || editPts < 0 || task.complete || allSubmitted.some(s => s.id === task.id && !s.complete)) return;
        const fields: { title: string; description: string; points: number } = { title, description: editDesc.trim(), points: editPts };
        try {
            if (editDue) {
                const [y, m, d] = editDue.split("-").map(Number);
                const due = new Date(y, m - 1, d, 23, 59, 59);
                await updateDoc(doc(db, "tasks", task.id), {
                    ...fields,
                    dueDate: Timestamp.fromDate(due),
                    deleteAt: Timestamp.fromDate(new Date(due.getTime() + 7 * 24 * 60 * 60 * 1000)),
                });
            } else {
                await updateDoc(doc(db, "tasks", task.id), { ...fields, dueDate: deleteField(), deleteAt: deleteField() });
            }
            if (allSubmitted.some(s => s.id === task.id && !s.complete)) {
                await updateDoc(doc(db, "tasksSubmitted", task.id), fields);
            }
            setEditTaskId(null);
        } catch (err) {
            console.error("Error editing task:", err);
        }
    };

    // Hand an unfinished, not-yet-submitted task to another member, clearing progress state
    const reassignTask = async (task: Task) => {
        const target = membersWithData.find(m => m.uid === reassignTo);
        if (!target || target.uid === task.assignedTo || task.complete) return;
        if (allSubmitted.some(s => s.id === task.id && !s.complete)) return;
        try {
            await updateDoc(doc(db, "tasks", task.id), {
                assignedTo: target.uid,
                assignedName: target.name,
                status: deleteField(),
                extensionRequested: deleteField(),
                extensionDeclined: deleteField(),
            });
            setReassignTaskId(null);
            setReassignTo("");
        } catch (err) {
            console.error("Error reassigning task:", err);
        }
    };

    const adminTabs = [
        { key: "requests", label: "Requests", badge: requested.length },
        { key: "creation", label: "Assign Task", badge: 0 },
        { key: "tasks", label: "Tasks", badge: allSubmitted.filter(t => !t.complete).length },
        { key: "members", label: "Members", badge: 0 },
        { key: "instructors", label: "Instructors", badge: 0 },
        { key: "rewards", label: "Rewards", badge: 0 },
        { key: "config", label: "Config", badge: 0 },
    ];

    return (
        <motion.div className="w-full flex flex-col gap-4">

            {/* Admin sub-tab bar */}
            <div ref={tabBar.ref} className="relative flex flex-wrap items-center gap-1 border-b border-gray-200">
                <span aria-hidden className={`${tabBar.indicatorClass} bg-blue-600`} style={tabBar.indicatorStyle} />
                {adminTabs.map((tab) => (
                    <div key={tab.key} data-active={page === tab.key ? "true" : "false"} className="relative shrink-0">
                        <button
                            onClick={() => setPage(tab.key)}
                            className={`px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap hover:cursor-pointer ${
                                page === tab.key ? "text-blue-600" : "text-gray-500 hover:text-gray-800"
                            }`}
                        >
                            {tab.label}
                            {tab.badge > 0 && (
                                <span className="ml-1.5 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    </div>
                ))}
            </div>

            {/* Requests */}
            {page.match("requests") && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                    {userRequested.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">No pending requests.</p>
                    ) : userRequested.map((u) => (
                        <motion.div
                            key={u.uid}
                            className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-4 py-3 gap-4"
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                        >
                            <div className="flex items-center gap-3">
                                <ProfileImg src={u.photoURL} alt={u.name} size="xs" />
                                <span className="font-medium">{u.name}</span>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <Button onClick={() => acceptRequest(u.uid)} size="xsm" color="green">Accept</Button>
                                <Button onClick={() => declineRequest(u.uid)} size="xsm" color="red">Decline</Button>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            )}

            {/* Task Creation */}
            {page.match("creation") && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
                    <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Assign to</h2>
                            <LinkButton onClick={() => {
                                const allUids = nonAdminMembers.map(m => m.uid as string);
                                setCreateSetTaskFor(allUids);
                            }}>Select all</LinkButton>
                        </div>
                        <PersonPicker
                            label="Member to assign"
                            placeholder="Select a member"
                            value=""
                            resetAfterPick
                            chosen={createTaskFor}
                            emptyText="No members in this role yet."
                            people={nonAdminMembers.map(m => ({ uid: m.uid, name: m.name, photoURL: m.photoURL, hint: `${m.points ?? 0} pts` }))}
                            onChange={uid => {
                                // Picking someone already selected takes them off again
                                setCreateSetTaskFor(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
                            }}
                        />

                        {createTaskFor.length > 0 && (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs text-gray-400 uppercase tracking-widest">Selected</p>
                                    <LinkButton onClick={() => setCreateSetTaskFor([])}>Clear all</LinkButton>
                                </div>
                                {createTaskFor.map((uid) => {
                                    const member = membersWithData.find((m) => m.uid === uid);
                                    if (!member) return null;
                                    return (
                                        <div key={uid} className="flex items-center justify-between bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl">
                                            <div className="flex items-center gap-2">
                                                <ProfileImg src={member.photoURL} alt={member.name} size="xxs" />
                                                <span className="text-sm font-medium">{member.name}</span>
                                            </div>
                                            <LinkButton onClick={() => setCreateSetTaskFor((prev) => prev.filter((id) => id !== uid))}>
                                                Remove
                                            </LinkButton>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <form id="create" onSubmit={sendTask} className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Task details</h2>
                        <Input type="text" name="title" placeholder="Title" required={true} autocomplete="false" size="full" />
                        <Input type="text" name="desc" placeholder="Description (optional)" required={false} autocomplete="false" size="full" />
                        <Input type="number" id="pts" name="pts" placeholder="Points" required={true} autocomplete="false" size="full" />
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400">Due Date (optional)</label>
                            <input
                                type="date"
                                name="dueDate"
                                min={new Date().toISOString().split("T")[0]}
                                className="w-full px-2 py-2 rounded-xl bg-white border-2 border-transparent hover:border-black/30 focus:border-black/30 focus:outline-none text-sm transition-all duration-200"
                            />
                        </div>
                        <Button type="submit" size="sm" color="green">Assign Task</Button>
                        {assignError && <ErrorMessage>{assignError}</ErrorMessage>}
                        <Alert value={phrase4} setValue={setPhrase4} />
                    </form>
                </motion.div>
            )}

            {/* All Tasks */}
            {page.match("tasks") && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                    {/* Search + Filter */}
                    <div className="flex flex-col gap-2">
                        <input
                            type="text"
                            value={taskSearch}
                            onChange={e => setTaskSearch(e.target.value)}
                            placeholder="Search by title or assignee..."
                            className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        />
                        <select
                            value={taskMonthFilter}
                            onChange={e => setTaskMonthFilter(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        >
                            <option value="all">All months</option>
                            {MONTH_OPTIONS.map(opt => (
                                <option key={opt.key} value={opt.key}>{opt.label}</option>
                            ))}
                        </select>
                        <div className="flex gap-2 flex-wrap">
                            {(["all", "submitted", "pending", "done"] as const).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setTaskFilter(f)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors hover:cursor-pointer ${
                                        taskFilter === f
                                            ? "bg-blue-600 text-white"
                                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                    }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {([
                                { key: "date-desc", label: "Newest" },
                                { key: "date-asc",  label: "Oldest" },
                                { key: "title-asc", label: "A-Z" },
                                { key: "title-desc",label: "Z-A" },
                            ]).map(s => (
                                <button
                                    key={s.key}
                                    onClick={() => setTaskSort(s.key)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors hover:cursor-pointer ${
                                        taskSort === s.key
                                            ? "bg-gray-700 text-white"
                                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                    }`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {taskFilter === "submitted" ? (() => {
                        const filtered = allSubmitted.filter(t => {
                            if (!t.complete === false) return false;
                            if (taskMonthFilter !== "all") {
                                const [y, m] = taskMonthFilter.split("-").map(Number);
                                const d = t.submission?.toDate();
                                if (!d || d.getFullYear() !== y || d.getMonth() !== m) return false;
                            }
                            const q = taskSearch.toLowerCase();
                            return !t.complete && (!q || t.title.toLowerCase().includes(q) || t.assignedName.toLowerCase().includes(q));
                        });
                        const sorted = applySortSubmitted(filtered, taskSort);
                        if (sorted.length === 0) return (
                            <p className="text-gray-400 text-sm text-center py-8">No pending submissions.</p>
                        );
                        return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {sorted.map((submitted) => (
                                    <motion.div
                                        key={submitted.id}
                                        className="flex flex-col gap-3 p-4 rounded-2xl border-2 border-yellow-200 bg-white"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <h3 className="font-semibold leading-tight">{submitted.title}</h3>
                                            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                                                {submitted.points} pts
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-500 flex-1">{submitted.description || "No description"}</p>
                                        <div className="text-xs text-gray-400 flex flex-col gap-0.5">
                                            <span>By <strong className="text-gray-600">{submitted.assignedName}</strong></span>
                                            <span>{submitted.submission ? submitted.submission.toDate().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "N/A"}</span>
                                        </div>
                                        <div className="flex gap-2 mt-auto">
                                            <Button onClick={() => acceptTask(submitted)} size="full" color="green">Approve</Button>
                                            <Button onClick={() => declineTask(submitted)} size="full" color="red">Decline</Button>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        );
                    })() : (() => {
                        const filtered = allTasks.filter(t => {
                            const hasSubmission = allSubmitted.some(s => s.id === t.id && !s.complete);
                            const matchesFilter =
                                taskFilter === "all" ? true :
                                taskFilter === "done" ? t.complete :
                                taskFilter === "pending" ? !t.complete && !hasSubmission :
                                !t.complete;
                            if (!matchesFilter) return false;
                            if (taskMonthFilter !== "all") {
                                const [y, m] = taskMonthFilter.split("-").map(Number);
                                const d = t.createdOn?.toDate();
                                if (!d || d.getFullYear() !== y || d.getMonth() !== m) return false;
                            }
                            const q = taskSearch.toLowerCase();
                            return !q || t.title.toLowerCase().includes(q) || t.assignedName.toLowerCase().includes(q);
                        });
                        const sorted = applySortTasks(filtered, taskSort);
                        if (sorted.length === 0) return (
                            <p className="text-gray-400 text-sm text-center py-8">No tasks to show.</p>
                        );
                        return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {sorted.map((task) => {
                                    const submission = allSubmitted.find(s => s.id === task.id && !s.complete);
                                    const overdue = taskIsOverdue(task);
                                    const daysLeft = daysUntilDeleteAt(task);
                                    return (
                                    <motion.div
                                        key={task.id}
                                        className={`flex flex-col gap-3 p-4 rounded-2xl border-2 bg-white ${
                                            task.complete ? "border-green-300" : overdue ? "border-red-300" : submission ? "border-yellow-200" : "border-gray-200"
                                        }`}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <h3 className="font-semibold leading-tight">{task.title}</h3>
                                            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                                                {task.points} pts
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-500 flex-1">{task.description || "No description"}</p>
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <span className="text-xs text-gray-400">{task.assignedName}</span>
                                            <div className="flex gap-1 flex-wrap">
                                                {overdue && !submission && (
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Overdue</span>
                                                )}
                                                {task.extensionRequested && (
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Extension Requested</span>
                                                )}
                                                {task.extensionDeclined && (
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Extension Declined</span>
                                                )}
                                                {(task.declineCount ?? 0) > 0 && (
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                                                        Declined {task.declineCount}×{task.declineCount === 3 ? " · Closed" : ""}
                                                    </span>
                                                )}
                                                {task.status && !task.complete && !submission && (
                                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                                        task.status === "In Progress" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                                                    }`}>
                                                        {task.status}
                                                    </span>
                                                )}
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                                    task.complete ? "bg-green-100 text-green-700" : submission ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"
                                                }`}>
                                                    {task.complete ? "Done" : submission ? "Submitted" : "Pending"}
                                                </span>
                                            </div>
                                        </div>
                                        {task.dueDate && !task.complete && (
                                            <p className={`text-xs ${overdue && !submission ? "text-red-400" : "text-gray-400"}`}>
                                                Due: {task.dueDate.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                                {overdue && !submission && daysLeft !== null && (
                                                    <span className="ml-1">· {daysLeft > 0 ? `Deletes in ${daysLeft}d` : "Deleting soon"}</span>
                                                )}
                                            </p>
                                        )}
                                        {submission && (
                                            <p className="text-xs text-yellow-600">
                                                Submitted: {submission.submission.toDate().toLocaleString("en-US", {
                                                    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
                                                })}
                                            </p>
                                        )}
                                        <p className="text-xs text-gray-300">
                                            {task.createdOn?.toDate().toLocaleString("en-US", {
                                                month: "short", day: "numeric", year: "numeric",
                                                hour: "numeric", minute: "2-digit"
                                            })}
                                        </p>
                                        {task.extensionRequested && (
                                            <div className="flex gap-2">
                                                <Button onClick={() => acceptExtension(task.id, task.points)} size="full" color="green">Accept Extension</Button>
                                                <Button onClick={() => declineExtension(task.id)} size="full" color="red">Decline Extension</Button>
                                            </div>
                                        )}
                                        {submission && (
                                            <div className="flex gap-2 mt-auto">
                                                <Button onClick={() => acceptTask(submission)} size="full" color="green">Approve</Button>
                                                <Button onClick={() => declineTask(submission)} size="full" color="red">Decline</Button>
                                            </div>
                                        )}
                                        {editTaskId === task.id ? (
                                            <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                                                <input
                                                    value={editTitle}
                                                    onChange={e => setEditTitle(e.target.value)}
                                                    placeholder="Title"
                                                    className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400"
                                                />
                                                <textarea
                                                    value={editDesc}
                                                    onChange={e => setEditDesc(e.target.value)}
                                                    placeholder="Description (optional)"
                                                    rows={2}
                                                    className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 resize-none"
                                                />
                                                <div className="flex gap-2">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={editPts}
                                                        onChange={e => setEditPts(Math.max(0, +e.target.value))}
                                                        className="w-1/3 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400"
                                                    />
                                                    <input
                                                        type="date"
                                                        value={editDue}
                                                        onChange={e => setEditDue(e.target.value)}
                                                        className="flex-1 min-w-0 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400"
                                                    />
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button onClick={() => saveTaskEdit(task)} size="full" color="blue" disabled={!editTitle.trim()}>Save</Button>
                                                    <Button onClick={() => setEditTaskId(null)} size="full" color="cancel">Cancel</Button>
                                                </div>
                                            </div>
                                        ) : reassignTaskId === task.id ? (
                                            <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                                                <PersonPicker
                                                    label="Reassign to"
                                                    placeholder="Reassign to…"
                                                    value={reassignTo}
                                                    onChange={setReassignTo}
                                                    emptyText="No one else in this role."
                                                    people={nonAdminMembers.filter(m => m.uid !== task.assignedTo).map(m => ({ uid: m.uid, name: m.name, photoURL: m.photoURL }))}
                                                />
                                                <div className="flex gap-2">
                                                    <Button onClick={() => reassignTask(task)} size="full" color="blue" disabled={!reassignTo}>Reassign</Button>
                                                    <Button onClick={() => { setReassignTaskId(null); setReassignTo(""); }} size="full" color="cancel">Cancel</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex gap-2 pt-3 border-t border-gray-100">
                                                {!task.complete && !submission && (
                                                    <Button onClick={() => startEditTask(task)} size="full" color="blue">Edit</Button>
                                                )}
                                                {!task.complete && !submission && (
                                                    <Button onClick={() => { setEditTaskId(null); setReassignTaskId(task.id); setReassignTo(""); }} size="full" color="gray">Reassign</Button>
                                                )}
                                                <Button onClick={() => removeTask(task)} size="full" color="red">Remove</Button>
                                            </div>
                                        )}
                                    </motion.div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </motion.div>
            )}

            {/* Members */}
            {page.match("members") && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                    {nonAdminMembers.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">No members in this role.</p>
                    ) : nonAdminMembers.map((m) => (
                        <motion.button
                            key={m.uid}
                            type="button"
                            // Each member has their own page: stats, tasks in this role, edit and kick
                            onClick={() => navigate(`/roles/${role.id}/members/${m.uid}`)}
                            className="group flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl border border-gray-200 bg-white transition-all duration-200 hover:border-gray-400 hover:shadow-sm hover:cursor-pointer"
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                        >
                            <ProfileImg src={m.photoURL} alt={m.name} size="xs" />
                            <div className="min-w-0 flex-1">
                                <p className="font-medium truncate">{m.name}</p>
                                <p className="text-xs text-gray-400">{m.points ?? 0} pts · {m.taskCompleted ?? 0} tasks</p>
                            </div>
                            <FontAwesomeIcon icon={faChevronRight} className="shrink-0 text-gray-300 transition-all duration-200 group-hover:text-gray-600 group-hover:translate-x-1" />
                        </motion.button>
                    ))}
                </motion.div>
            )}

            {/* Instructors */}
            {page === "instructors" && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
                    <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Running this role</h2>
                        <p className="text-sm text-gray-500">Instructors here can give and review tasks, edit points, accept members and request resets. Admins can always run every role.</p>
                        {!isAdmin && role.createdBy !== user.uid && (
                            <p className="text-xs text-gray-400">Only the instructor who created this role, or an admin, can remove other instructors. You can always step down yourself.</p>
                        )}
                        {roleInstructors.length === 0 ? (
                            <p className="text-sm text-gray-400">No instructors yet.</p>
                        ) : roleInstructors.map(uid => {
                            const person = instructorProfiles.find(p => p.uid === uid);
                            const lostAccess = !allInstructors.includes(uid);
                            return (
                                <div key={uid} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <ProfileImg src={person?.photoURL} alt={person?.name} size="xxs" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">{person?.name ?? "Loading..."}{uid === user.uid ? " (you)" : ""}</p>
                                            <p className="text-xs text-gray-400">
                                                {role.createdBy === uid ? "Created this role" : "Instructor"}
                                                {lostAccess ? " · No longer an Instructor" : ""}
                                            </p>
                                        </div>
                                    </div>
                                    {(isAdmin || uid === user.uid || (!!role.createdBy && role.createdBy === user.uid)) && (
                                        <Button onClick={() => removeInstructor(uid, person?.name ?? "This instructor")} size="xsm" color="red" extraClasses="shrink-0">Remove</Button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Add an instructor</h2>
                        {addableInstructors.length === 0 ? (
                            <p className="text-sm text-gray-400">Every instructor already has access. Admins can make more people Instructors from the Admin page.</p>
                        ) : (
                            <>
                                <PersonPicker
                                    label="Instructor to add"
                                    placeholder="Select an instructor"
                                    value={addInstructorUid}
                                    onChange={setAddInstructorUid}
                                    people={addableInstructors.map(p => ({
                                        uid: p.uid,
                                        name: p.name,
                                        photoURL: p.photoURL,
                                        hint: (role.members ?? []).includes(p.uid) ? "Already a member" : undefined,
                                    }))}
                                />
                                <Button onClick={addInstructor} size="sm" disabled={!addInstructorUid}>Give Access</Button>
                            </>
                        )}
                    </div>
                </motion.div>
            )}

            {/* Rewards */}
            {page === "rewards" && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
                    <form onSubmit={saveRewardsTitle} className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Rewards title</h2>
                        <p className="text-sm text-gray-500">The heading on the Rewards tab. Leave it empty to show the current month.</p>
                        <input
                            value={rewardsTitle}
                            onChange={e => setRewardsTitle(e.target.value)}
                            maxLength={48}
                            placeholder={`${new Date().toLocaleString("en-US", { month: "long" })} Rewards`}
                            className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        />
                        <Button type="submit" size="sm">Save Title</Button>
                        <Alert value={phrase5} setValue={setPhrase5} />
                    </form>
                    <form onSubmit={setReward} className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Set rewards</h2>
                        {[
                            { name: "first", label: "1st Place" },
                            { name: "second", label: "2nd Place" },
                            { name: "third", label: "3rd Place" },
                        ].map((r, idx) => (
                            <div key={r.name} className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium text-gray-600">
                                    <MedalIcon rank={idx} className="mr-1.5" />
                                    {r.label}
                                </label>
                                <Input type="text" name={r.name} placeholder="Reward description" required={true} autocomplete="false" size="full" />
                            </div>
                        ))}
                        <Button type="submit" size="sm">Save Rewards</Button>
                        <Alert value={phrase3} setValue={setPhrase3} />
                    </form>
                </motion.div>
            )}

            {/* Config */}
            {page.match("config") && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
                    <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Rename role</h2>
                        <form id="rolename" onSubmit={changeRoleName} className="flex flex-col gap-3">
                            <Input type="text" name="newName" placeholder="New role name" required={true} autocomplete="false" size="full" />
                            <Button type="submit" size="sm">Save Name</Button>
                            <Alert value={phrase} setValue={setPhrase} />
                        </form>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Global Leaderboard</h2>
                        <p className="text-sm text-gray-500">When enabled, every member of this role can see the global leaderboard on the home page.</p>
                        <div className="flex items-center justify-between">
                            <span className={`text-sm font-medium ${showInGlobal ? "text-green-600" : "text-gray-400"}`}>
                                {showInGlobal ? "Enabled" : "Disabled"}
                            </span>
                            <Button onClick={toggleGlobalLeaderboard} size="xsm" color={showInGlobal ? "red" : "green"}>
                                {showInGlobal ? "Disable" : "Enable"}
                            </Button>
                        </div>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Reset role</h2>
                        <p className="text-sm text-gray-500">
                            Saves every member's points and tasks completed under a name you choose (shown with the date on the Saved Data tab), then clears this role's tasks, submissions and prizes and sets everyone back to 0.
                            {!isAdmin && " An admin has to approve it first."}
                        </p>
                        {pendingReset ? (
                            <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                <p className="text-sm text-amber-700">Reset requested as "{pendingReset.saveName}". Waiting for an admin.</p>
                                {!isAdmin && <Button onClick={cancelResetRequest} size="xsm" color="cancel" extraClasses="shrink-0">Cancel</Button>}
                            </div>
                        ) : (
                            <Button onClick={resetRole} size="sm">{isAdmin ? "Reset Role" : "Request Reset"}</Button>
                        )}
                        <Alert value={phrase2} setValue={setPhrase2} />
                    </div>

                    {isAdmin && (
                        <div className="bg-white border border-red-100 rounded-2xl p-5 flex flex-col gap-3">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-red-400">Danger Zone</h2>
                            <p className="text-sm text-gray-500">Permanently deletes this role and all associated data, including its saved data.</p>
                            <Button onClick={deleteRole} color="red" size="sm">Delete Role</Button>
                        </div>
                    )}
                </motion.div>
            )}

        </motion.div>
    );
}