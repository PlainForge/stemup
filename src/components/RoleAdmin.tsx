import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { motion } from "motion/react";
import { useContext, useEffect, useState, type FormEvent } from "react";
import { db } from "../lib/firebase";
import { type Role, type SubmittedTask, type UserData, type UserRoleData } from "../myDataTypes";
import { MainContext } from "../context/MainContext";
import LinkButton from "./LinkButton";
import Button from "./Button";
import Input from "./Input";
import { Alert } from "./PhraseAlert";
import ProfileImg from "./ProfileImg";
import { firebaseAuthService } from "../lib/firebaseService";

interface prop {
    role: {name: string, id: string},
    membersWithData: UserData[],
    requested: string[],
    setRequested: (ids: string[]) => void,
    submittedTasks: SubmittedTask[],
    setSubmittedTasks: (tasks: SubmittedTask[]) => void,
}

export default function RoleAdminPage({ role, membersWithData, requested, submittedTasks } : prop) {
    const context = useContext(MainContext);
    const [page, setPage] = useState("submitted");
    const [userRequested, setUserRequested] = useState<UserData[]>([]);
    const [createTaskFor, setCreateSetTaskFor] = useState<string[]>([]);
    const [phrase, setPhrase] = useState(""); // Role name change phrase
    const [phrase2, setPhrase2] = useState(""); // Role reset phrase
    const [phrase3, setPhrase3] = useState(""); // Role reward phrase
    const [phrase4, setPhrase4] = useState(""); // Sent task phrase
    const [showInGlobal, setShowInGlobal] = useState(false);

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
            console.error("No users selected");
            return;
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
            await updateDoc(doc(db, "tasks", submitted.id), {
                complete: true
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

    const resetRole = async (roleId : string) => {
        const confirmDelete = window.confirm("Are you sure you want to reset? This cannot be undone.");

        if (!confirmDelete) return;

        try {
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

            userSnaps.forEach(async (snap) => {
                const data = snap.data();
                if (data.roles) {
                    const updatedRoles = data.roles.filter((r: Role) => r.id !== roleId);
                    await updateDoc(doc(db, "users", snap.id), {
                        roles: updatedRoles,
                    });
                }
            });

            const tasksRef = collection(db, "tasks");
            const qTasks = query(tasksRef, where("roleId", "==", roleId));
            const taskSnaps = await getDocs(qTasks);
            taskSnaps.forEach(async (task) => {
                await deleteDoc(doc(db, "tasks", task.id));
            });

            const submittedRef = collection(db, "tasksSubmitted");
            const qSubmitted = query(submittedRef, where("roleId", "==", roleId));
            const submittedSnaps = await getDocs(qSubmitted);
            submittedSnaps.forEach(async (task) => {
                await deleteDoc(doc(db, "tasksSubmitted", task.id));
            });

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

    const nonAdminMembers = membersWithData.filter((m) => !admins.includes(m.uid));

    const adminTabs = [
        { key: "submitted", label: "Submitted", badge: submittedTasks.length },
        { key: "requests", label: "Requests", badge: requested.length },
        { key: "creation", label: "Assign Task", badge: 0 },
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

            {/* Submitted Tasks */}
            {page.match("submitted") && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                    {submittedTasks.filter(t => !t.complete).length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">No pending submissions.</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {submittedTasks.map((submitted) => {
                                if (submitted.complete) return null;
                                return (
                                    <motion.div
                                        key={submitted.id}
                                        className="flex flex-col bg-white border border-gray-100 rounded-2xl p-4 gap-3"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <h3 className="font-semibold leading-tight">{submitted.title}</h3>
                                            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                                                {submitted.points} pts
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-500">{submitted.description || "No description"}</p>
                                        <div className="text-xs text-gray-400 flex flex-col gap-0.5">
                                            <span>By <strong className="text-gray-600">{submitted.assignedName}</strong></span>
                                            <span>{submitted.submission ? submitted.submission.toDate().toLocaleDateString() : "N/A"}</span>
                                        </div>
                                        <div className="flex gap-2 mt-auto">
                                            <Button onClick={() => acceptTask(submitted)} size="full" color="green">Approve</Button>
                                            <Button onClick={() => declineTask(submitted)} size="full" color="red">Decline</Button>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </motion.div>
            )}

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
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Assign to</h2>
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
                        <Button type="submit" size="sm" color="green">Assign Task</Button>
                        <Alert value={phrase4} setValue={setPhrase4} />
                    </form>
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
                            className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-4 py-3 gap-4"
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                        >
                            <div className="flex items-center gap-3">
                                <ProfileImg src={m.photoURL} alt={m.name} size="xs" />
                                <div>
                                    <p className="font-medium">{m.name}</p>
                                    <p className="text-xs text-gray-400">{m.points ?? 0} pts · {m.taskCompleted ?? 0} tasks</p>
                                </div>
                            </div>
                            <Button onClick={() => kickMember(m.uid, m.name)} size="xsm" color="red">Kick</Button>
                        </motion.div>
                    ))}
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
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Monthly reset</h2>
                        <p className="text-sm text-gray-500">Clears all tasks, submissions, and resets every member's points and task count for this role.</p>
                        <Button onClick={() => resetRole(role.id)} size="sm">Monthly Reset</Button>
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