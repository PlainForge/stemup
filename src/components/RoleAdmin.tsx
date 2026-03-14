import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { AnimatePresence, motion } from "motion/react";
import { useContext, useEffect, useState, type FormEvent } from "react";
import { db } from "../lib/firebase";
import { type Role, type SubmittedTask, type Task, type UserData, type UserRoleData } from "../myDataTypes";
import { MainContext } from "../context/MainContext";
import LinkButton from "./LinkButton";
import Button from "./Button";
import Input from "./Input";
import { Alert } from "./PhraseAlert";
import ProfileImg from "./ProfileImg";
import { firebaseAuthService } from "../lib/firebaseService";
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
    role: {name: string, id: string},
    membersWithData: UserData[],
    requested: string[],
    setRequested: (ids: string[]) => void,
}

export default function RoleAdminPage({ role, membersWithData, requested } : prop) {
    const context = useContext(MainContext);
    const [page, setPage] = useState("requests");
    const [userRequested, setUserRequested] = useState<UserData[]>([]);
    const [createTaskFor, setCreateSetTaskFor] = useState<string[]>([]);
    const [assignError, setAssignError] = useState("");
    const [phrase, setPhrase] = useState(""); // Role name change phrase
    const [phrase2, setPhrase2] = useState(""); // Role reset phrase
    const [phrase3, setPhrase3] = useState(""); // Role reward phrase
    const [phrase4, setPhrase4] = useState(""); // Sent task phrase
    const [showInGlobal, setShowInGlobal] = useState(false);
    const [allTasks, setAllTasks] = useState<Task[]>([]);
    const [taskFilter, setTaskFilter] = useState<"all" | "pending" | "done" | "submitted">("all");
    const [taskSearch, setTaskSearch] = useState("");
    const [taskMonthFilter, setTaskMonthFilter] = useState("all");
    const [taskSort, setTaskSort] = useState("date-desc");
    const [allSubmitted, setAllSubmitted] = useState<SubmittedTask[]>([]);
    const [editingMember, setEditingMember] = useState<string | null>(null);
    const [editPoints, setEditPoints] = useState(0);
    const [editTaskCount, setEditTaskCount] = useState(0);
    const [origEditPoints, setOrigEditPoints] = useState(0);
    const [origEditTaskCount, setOrigEditTaskCount] = useState(0);

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

    // Listen for global leaderboard flag
    useEffect(() => {
        const unsub = onSnapshot(doc(db, "roles", role.id), (snap) => {
            if (snap.exists()) setShowInGlobal(snap.data().showInGlobalLeaderboard ?? false);
        });
        return () => unsub();
    }, [role.id]);

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
            await updateDoc(doc(db, "roles", role.id), {
                pendingRequests: arrayRemove(id)
            })
            await setDoc(doc(db, "roles", role.id), {
                members: arrayUnion(thisUser.uid)
            }, {merge:true})
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

    const declineTask = async (submitted : SubmittedTask) => {
        if (!submitted) return

        try {
            await deleteDoc(doc(db, "tasksSubmitted", submitted.id));
        } catch (err) {
            console.log(err)
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

    const resetRole = async (roleId : string) => {
        const confirmDelete = window.confirm("Are you sure you want to force reset? This cannot be undone.");

        if (!confirmDelete) return;

        try {
            // Save leaderboard snapshot before resetting
            const snapshotAdmins = context?.admins ?? [];
            const nonAdminMembers = membersWithData
                .filter(m => !snapshotAdmins.includes(m.uid))
                .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

            const month = new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
            const now = Timestamp.now();
            const deleteAt = Timestamp.fromDate(new Date(now.toMillis() + 365 * 24 * 60 * 60 * 1000));

            await addDoc(collection(db, "leaderboardSnapshots"), {
                roleId,
                month,
                createdAt: now,
                deleteAt,
                entries: nonAdminMembers.map((u, idx) => ({
                    uid: u.uid,
                    name: u.name,
                    photoURL: u.photoURL ?? "",
                    points: u.points ?? 0,
                    taskCompleted: u.taskCompleted ?? 0,
                    rank: idx + 1,
                })),
            });

            const updates: Promise<void>[] = [];

            const tasksQ = query(collection(db, "tasks"), where("roleId", "==", roleId));
            const tasksSnap = await getDocs(tasksQ);
            tasksSnap.forEach((taskDoc) => {
                updates.push(deleteDoc(doc(db, "tasks", taskDoc.id)));
            });

            const submittedQ = query(collection(db, "tasksSubmitted"), where("roleId", "==", roleId));
            const submittedSnap = await getDocs(submittedQ);
            submittedSnap.forEach((taskDoc) => {
                updates.push(deleteDoc(doc(db, "tasksSubmitted", taskDoc.id)));
            });

            // Reset rewards
            const rewardRef = doc(db, "rewards", roleId);
            updates.push(
                updateDoc(rewardRef, {
                    first: "No reward set",
                    second: "No reward set",
                    third: "No reward set",
                })
            );

            // Reset all users' points and taskCompleted for this role
            const usersSnap = await getDocs(collection(db, "users"));
            usersSnap.forEach((userDoc) => {
                const data = userDoc.data();
                const roles: UserRoleData[] = Array.isArray(data.roles) ? data.roles : [];

                const updatedRoles = roles.map((r) => {
                    if (r.id === roleId) {
                        return {
                            ...r,
                            points: 0,
                            taskCompleted: 0,
                        };
                    }
                    return r;
                });

                updates.push(
                    updateDoc(doc(db, "users", userDoc.id), { roles: updatedRoles })
                );
            });

            await Promise.all(updates);

            setPhrase2("Role has been reset successfully");
            console.log(`Role ${roleId} has been reset.`);
        } catch (err) {
            console.error("Error resetting role:", err);
        }
    }

    const deleteRole = async (roleId : string) => {
        const confirmDelete = window.confirm("Are you sure you want to delete this role? This cannot be undone.");

        if (!confirmDelete) return;

        try {
            const usersRef = collection(db, "users");
            const userSnaps = await getDocs(usersRef);

            const userUpdates = userSnaps.docs
                .filter(snap => snap.data().roles)
                .map(snap => {
                    const updatedRoles = snap.data().roles.filter((r: Role) => r.id !== roleId);
                    return updateDoc(doc(db, "users", snap.id), { roles: updatedRoles });
                });

            const tasksSnap = await getDocs(query(collection(db, "tasks"), where("roleId", "==", roleId)));
            const taskDeletes = tasksSnap.docs.map(task => deleteDoc(doc(db, "tasks", task.id)));

            const submittedSnap = await getDocs(query(collection(db, "tasksSubmitted"), where("roleId", "==", roleId)));
            const submittedDeletes = submittedSnap.docs.map(task => deleteDoc(doc(db, "tasksSubmitted", task.id)));

            await Promise.all([...userUpdates, ...taskDeletes, ...submittedDeletes]);

            await deleteDoc(doc(db, "roles", roleId));

            console.log(`Role ${roleId} and all related data deleted successfully`);
        } catch (err) {
            console.error(err);
        }
    }

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

    const toggleGlobalLeaderboard = async () => {
        await updateDoc(doc(db, "roles", role.id), { showInGlobalLeaderboard: !showInGlobal });
    };

    const kickMember = async (uid: string, name: string) => {
        const confirm = window.confirm(`Remove ${name} from this role?`);
        if (!confirm) return;
        await firebaseAuthService.kickUserFromRole(role.id, uid);
    };

    const openEditMember = (m: UserData) => {
        const roleData = m.roles?.find((r: UserRoleData) => r.id === role.id);
        const rp = roleData?.points ?? 0;
        const rt = roleData?.taskCompleted ?? 0;
        setEditingMember(m.uid);
        setEditPoints(rp);
        setEditTaskCount(rt);
        setOrigEditPoints(rp);
        setOrigEditTaskCount(rt);
    };

    const saveRoleOnly = async (uid: string) => {
        const member = membersWithData.find(m => m.uid === uid);
        if (!member) return;
        const updatedRoles = (member.roles || []).map((r: UserRoleData) =>
            r.id === role.id ? { ...r, points: editPoints, taskCompleted: editTaskCount } : r
        );
        await updateDoc(doc(db, "users", uid), { roles: updatedRoles });
        setEditingMember(null);
    };

    const saveRoleAndGlobal = async (uid: string) => {
        const member = membersWithData.find(m => m.uid === uid);
        if (!member) return;
        const deltaPoints = editPoints - origEditPoints;
        const deltaTaskCount = editTaskCount - origEditTaskCount;
        const updatedRoles = (member.roles || []).map((r: UserRoleData) =>
            r.id === role.id ? { ...r, points: editPoints, taskCompleted: editTaskCount } : r
        );
        await updateDoc(doc(db, "users", uid), {
            roles: updatedRoles,
            points: Math.max(0, (member.points ?? 0) + deltaPoints),
            taskCompleted: Math.max(0, (member.taskCompleted ?? 0) + deltaTaskCount),
        });
        setEditingMember(null);
    };

    const nonAdminMembers = membersWithData.filter((m) => !admins.includes(m.uid));

    const adminTabs = [
        { key: "requests", label: "Requests", badge: requested.length },
        { key: "creation", label: "Assign Task", badge: 0 },
        { key: "tasks", label: "Tasks", badge: allSubmitted.filter(t => !t.complete).length },
        { key: "members", label: "Members", badge: 0 },
        { key: "rewards", label: "Rewards", badge: 0 },
        { key: "config", label: "Config", badge: 0 },
    ];

    return (
        <motion.div className="w-full flex flex-col gap-4">

            {/* Admin sub-tab bar */}
            <div className="flex flex-wrap items-center gap-1 border-b border-gray-200">
                {adminTabs.map((tab) => (
                    <div key={tab.key} className="relative shrink-0">
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
                        {page === tab.key && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                        )}
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
                                const allUids = membersWithData
                                    .filter(m => m.uid && !admins.includes(m.uid))
                                    .map(m => m.uid as string);
                                setCreateSetTaskFor(allUids);
                            }}>Select all</LinkButton>
                        </div>
                        <select
                            name="user"
                            defaultValue=""
                            onChange={(e) => {
                                const uid = e.target.value;
                                if (uid && !createTaskFor.includes(uid)) {
                                    setCreateSetTaskFor((prev) => [...prev, uid]);
                                }
                            }}
                            className="w-full bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        >
                            <option value="" disabled>Select a member</option>
                            {membersWithData.map((member) => {
                                if (!member.uid || admins.includes(member.uid)) return null;
                                return <option key={member.uid} value={member.uid}>{member.name}</option>;
                            })}
                        </select>

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
                                { key: "title-asc", label: "A → Z" },
                                { key: "title-desc",label: "Z → A" },
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
                                                {overdue && (
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Overdue</span>
                                                )}
                                                {task.extensionRequested && (
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Extension Requested</span>
                                                )}
                                                {task.extensionDeclined && (
                                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Extension Declined</span>
                                                )}
                                                {task.status && (
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
                                            <p className={`text-xs ${overdue ? "text-red-400" : "text-gray-400"}`}>
                                                Due: {task.dueDate.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                                {overdue && daysLeft !== null && (
                                                    <span className="ml-1">· {daysLeft > 0 ? `Deletes in ${daysLeft}d` : "Deleting soon"}</span>
                                                )}
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
                        <motion.div
                            key={m.uid}
                            className="bg-white border border-gray-100 rounded-2xl"
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                        >
                            <div className="flex items-center justify-between px-4 py-3 gap-4">
                                <div className="flex items-center gap-3">
                                    <ProfileImg src={m.photoURL} alt={m.name} size="xs" />
                                    <div>
                                        <p className="font-medium">{m.name}</p>
                                        <p className="text-xs text-gray-400">{m.points ?? 0} pts · {m.taskCompleted ?? 0} tasks</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button onClick={() => openEditMember(m)} size="xsm" color="gray">Edit</Button>
                                    <Button onClick={() => kickMember(m.uid, m.name)} size="xsm" color="red">Kick</Button>
                                </div>
                            </div>
                        </motion.div>
                    ))}

                    {/* Edit member modal */}
                    <AnimatePresence>
                        {editingMember && (() => {
                            const m = membersWithData.find(x => x.uid === editingMember);
                            if (!m) return null;
                            return (
                                <motion.div
                                    key="edit-overlay"
                                    className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.25, ease: "easeOut" }}
                                    onClick={() => setEditingMember(null)}
                                >
                                    {/* Card */}
                                    <motion.div
                                        className="relative z-10 bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col gap-5"
                                        initial={{ scale: 0.92, y: 20, opacity: 0 }}
                                        animate={{ scale: 1, y: 0, opacity: 1 }}
                                        exit={{ scale: 0.95, y: 10, opacity: 0 }}
                                        transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.8 }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <div className="flex items-center gap-3">
                                            <ProfileImg src={m.photoURL} alt={m.name} size="xs" />
                                            <div>
                                                <p className="font-semibold">{m.name}</p>
                                                <p className="text-xs text-gray-400">Role stats · Global: {m.points ?? 0} pts, {m.taskCompleted ?? 0} tasks</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="flex flex-col gap-1.5 flex-1">
                                                <label className="text-xs text-gray-400 uppercase tracking-widest">Points</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={editPoints}
                                                    onChange={e => setEditPoints(Math.max(0, +e.target.value))}
                                                    className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1.5 flex-1">
                                                <label className="text-xs text-gray-400 uppercase tracking-widest">Tasks Completed</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={editTaskCount}
                                                    onChange={e => setEditTaskCount(Math.max(0, +e.target.value))}
                                                    className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                                                />
                                            </div>
                                        </div>
                                        {(editPoints !== origEditPoints || editTaskCount !== origEditTaskCount) && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
                                                <p className="font-semibold mb-0.5">Global impact if saved with global:</p>
                                                <p>
                                                    Points: {m.points ?? 0} → {Math.max(0, (m.points ?? 0) + (editPoints - origEditPoints))}
                                                    {" · "}
                                                    Tasks: {m.taskCompleted ?? 0} → {Math.max(0, (m.taskCompleted ?? 0) + (editTaskCount - origEditTaskCount))}
                                                </p>
                                            </div>
                                        )}
                                        <div className="flex flex-col gap-2">
                                            <Button size="full" onClick={() => saveRoleOnly(m.uid)}>Save to Role Only</Button>
                                            <Button size="full" color="gray" onClick={() => saveRoleAndGlobal(m.uid)}>Save to Role + Global</Button>
                                            <button onClick={() => setEditingMember(null)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors py-1 hover:cursor-pointer">Cancel</button>
                                        </div>
                                    </motion.div>
                                </motion.div>
                            );
                        })()}
                    </AnimatePresence>
                </motion.div>
            )}

            {/* Rewards */}
            {page.match("rewards") && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <form onSubmit={setReward} className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Set monthly rewards</h2>
                        {[
                            { name: "first", label: "🥇 1st Place" },
                            { name: "second", label: "🥈 2nd Place" },
                            { name: "third", label: "🥉 3rd Place" },
                        ].map((r) => (
                            <div key={r.name} className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium text-gray-600">{r.label}</label>
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
                        <p className="text-sm text-gray-500">When enabled, members of this role can see the global leaderboard on the home page.</p>
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
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Force reset</h2>
                        <p className="text-sm text-gray-500">Saves a leaderboard snapshot, then clears all tasks, submissions, and resets every member's points and task count for this role.</p>
                        <Button onClick={() => resetRole(role.id)} size="sm">Force Reset</Button>
                        <Alert value={phrase2} setValue={setPhrase2} />
                    </div>

                    <div className="bg-white border border-red-100 rounded-2xl p-5 flex flex-col gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-red-400">Danger Zone</h2>
                        <p className="text-sm text-gray-500">Permanently deletes this role and all associated data.</p>
                        <Button onClick={() => deleteRole(role.id)} color="red" size="sm">Delete Role</Button>
                    </div>
                </motion.div>
            )}

        </motion.div>
    );
}