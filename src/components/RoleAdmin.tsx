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

    

    // Get Users that requested
    useEffect(() => {
        if (requested.length < 1) {
            setUserRequested([]);
            return;
        }
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

    return (
        <motion.div
            className="w-full"
        >
            <motion.div 
                className="w-full flex gap-4 px-8 flex-col items-center justify-center md:flex-row"
            >
                <LinkButton
                    onClick={() => setPage("requests")} 
                    moreClass={page === "requests" ? "font-semibold" : "font-regular"}
                >
                    Requests <span className="bg-blue-300 px-1 py-0.5 rounded-full">{requested.length}</span>
                </LinkButton>
                <LinkButton
                    onClick={() => setPage("creation")}
                    moreClass={page === "creation" ? "font-semibold" : "font-regular"}
                >
                    Task Creation
                </LinkButton>
                <LinkButton
                    onClick={() => setPage("submitted")}
                    moreClass={page === "submitted" ? "font-semibold" : "font-regular"}
                >
                    Submitted Tasks <span className="bg-blue-300 px-1 py-0.5 rounded-full">{submittedTasks.length}</span>
                </LinkButton>
                <LinkButton
                    onClick={() => setPage("config")}
                    moreClass={page === "config" ? "font-semibold" : "font-regular"}
                >
                    Role Config
                </LinkButton>
                <LinkButton
                    onClick={() => setPage("rewards")}
                    moreClass={page === "rewards" ? "font-semibold" : "font-regular"}
                >
                    Rewards
                </LinkButton>
            </motion.div>
            <motion.div className="w-full px-4 mt-4">
                {page.match("requests") ? 
                    <motion.div 
                        className="w-full flex flex-col items-center"
                    >
                        <h1 className="text-2xl font-semibold">Requests</h1>
                        <div className="flex flex-col space-y-4 mt-4">
                            {
                                userRequested.length <= 0 ?
                                <p>No pending requests</p>
                            : 
                                userRequested.map((user) => {
                                    return (
                                        <motion.div 
                                            key={user.name} 
                                            className="flex flex-col items-center bg-gray-100 p-4 rounded-xl gap-4"
                                            initial={{x: -10}}
                                            animate={{x:0}}
                                        >
                                            <div className="flex items-center justify-between gap-4">
                                                <ProfileImg src={user.photoURL} alt={user.name} size="xs" />
                                                <h3 className="text-2xl font-medium">{user.name}</h3>
                                            </div>
                                            <div className="flex flex-col space-y-2">
                                                <Button
                                                    onClick={() => acceptRequest(user.uid)} 
                                                >
                                                    accept
                                                </Button>
                                                <Button
                                                    onClick={() => declineRequest(user.uid)}
                                                    color="red"
                                                >
                                                    decline
                                                </Button>
                                            </div>
                                            
                                        </motion.div>
                                    )
                                })
                            }
                        </div>
                    </motion.div> 
                    : 
                    page.match("creation") ? 
                    <motion.div 
                        className="w-full flex flex-col items-center"
                    >
                        <h1 className="text-2xl font-semibold">Task Creation</h1>
                        <form className="flex flex-col gap-4 mt-4 w-full items-center" 
                            id="create" 
                            onSubmit={sendTask}
                        >
                            <select 
                                name="user" 
                                defaultValue=""
                                onChange={(e) => {
                                    const uid = e.target.value;
                                    if (uid && !createTaskFor.includes(uid)) {
                                        setCreateSetTaskFor((prev) => [...prev, uid]);
                                    }
                                }}
                                className="w-sm bg-gray-100 p-2 rounded-xl focus:rounded-none transition-all duration-200"
                            >
                                <option value="" disabled>Select a member</option>
                                {membersWithData.map((member) => {  
                                    if (!member.uid) return
                                    if (admins.includes(member.uid)) return null
                                    return (
                                        <option key={member.uid} value={member.uid}>
                                            {member.name}
                                        </option>
                                    )
                                })}
                            </select>
                            {createTaskFor.length > 0 && (
                                <div className="flex flex-col w-full items-center">
                                    <h4 className="text-2xl">Selected Members:</h4>
                                    <div className="flex flex-col space-y-2 my-2">
                                        {createTaskFor.map((uid) => {
                                            const member = membersWithData.find((m) => m.uid === uid);
                                            if (!member) return null;
                                            return (
                                                <motion.div
                                                    key={uid}
                                                    className="flex items-center justify-between bg-gray-100 p-2 rounded-xl w-sm"
                                                >
                                                    <div className="flex items-center justify-center gap-2">
                                                        <ProfileImg src={member.photoURL} alt={member.name} size="xxs" />
                                                        <span className="title-card">{member.name}</span>
                                                    </div>
                                                    
                                                    <LinkButton
                                                        onClick={() =>
                                                            setCreateSetTaskFor((prev) =>
                                                                prev.filter((id) => id !== uid)
                                                            )
                                                        }
                                                    >
                                                        Remove
                                                    </LinkButton>
                                                </motion.div>
                                            );
                                        })}
                                    </div>

                                    <Button
                                        onClick={() => setCreateSetTaskFor([])}
                                        size="sm"
                                    >
                                        Clear All
                                    </Button>
                                </div>
                            )}

                            <Input 
                                type="text" 
                                name="title" 
                                placeholder="Title" 
                                required={true}
                                autocomplete="false"
                            />
                            <Input 
                                type="text" 
                                name="desc" 
                                placeholder="Description"
                                required={false}
                                autocomplete="false"
                            />
                            <Input 
                                type="number" 
                                id="pts" 
                                name="pts" 
                                placeholder="Points" 
                                required={true}
                                autocomplete="false"
                            />
                            <Button
                                type="submit" 
                                size="sm"
                                color="green"
                            >
                                Create
                            </Button>
                        </form>
                        <Alert value={phrase4} setValue={setPhrase4}/>
                    </motion.div> 
                    :
                    page.match("submitted") ? 
                    <motion.div 
                        className="w-full flex flex-col items-center"
                    >
                        <h1 className="text-2xl font-semibold">Tasks Submitted</h1>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 my-4 w-full">
                            {submittedTasks.map((submitted) => {
                                if (submitted.complete) return null
                                return (
                                    <motion.div 
                                        className="flex flex-col bg-gray-100 p-4 rounded-xl space-y-2" 
                                        key={submitted.id}
                                    >
                                        <h1 className="w-full text-2xl font-medium text-center">{submitted.title}</h1>
                                        <div className="flex flex-col space-y-1">
                                            <h4 className="font-medium">Description:</h4>
                                            <p className="border-b">{submitted.description}</p>
                                            <h4 className="font-medium">Points:</h4>
                                            <p className="border-b">{submitted.points} pts</p>
                                        </div>
                                        <div className="flex flex-col space-y-1">
                                            <h4 className="font-medium">Submission Date</h4>
                                            <p className="border-b">{submitted.submission ? submitted.submission.toDate().toString() : 'N/A'}</p>
                                        </div>
                                        <div>
                                            <h4 className="font-medium">Submitted by</h4>
                                            <div className="flex items-center gap-2">
                                                <p>{submitted.assignedName}</p>
                                            </div>
                                        </div>
                                        <div className="w-full flex justify-between">
                                            <Button
                                                onClick={() => acceptTask(submitted)}
                                                size="sm"
                                                color="green"
                                            >
                                                Approve
                                            </Button>
                                            <Button
                                                onClick={() => declineTask(submitted)}
                                                size="sm"
                                                color="red"
                                            >
                                                Disapprove
                                            </Button>
                                        </div>
                                    </motion.div>
                                )
                            })}
                        </div>
                    </motion.div> 
                    : 
                    page.match("config") ? 
                    <motion.div 
                        className="w-full flex flex-col items-center space-y-4"
                    >
                        <h1 className="text-2xl font-semibold">Role Config</h1>
                        <form className="flex flex-col space-y-2 items-center" id="rolename" onSubmit={changeRoleName}>
                            <Input 
                                type="text" 
                                name="newName" 
                                placeholder="Change Role Name" 
                                required={true}
                                autocomplete="false"
                            />
                            <Button type="submit">
                                Change Role Name
                            </Button>
                            <Alert value={phrase} setValue={setPhrase}/>
                        </form>
                        <Button 
                            onClick={() => resetRole(role.id)}
                        >
                            Monthly Reset
                        </Button>
                        <Alert value={phrase2} setValue={setPhrase2}/>
                        <Button 
                            onClick={() => deleteRole(role.id)}
                            color="red"
                        >
                            Delete Role
                        </Button>
                    </motion.div> 
                    : 
                    page.match("rewards") ? 
                    <motion.div
                        className="w-full flex flex-col items-center"
                        initial={{x: -10}}
                        animate={{x:0}}
                    >
                        <h1 className="text-2xl font-semibold">Rewards</h1>
                        <form className="flex flex-col items-center space-y-4 mt-4" onSubmit={setReward}>
                            <Input 
                                type="text" 
                                name="first" 
                                placeholder="first" 
                                required={true}
                                autocomplete="false" 
                            />
                            <Input 
                                type="text" 
                                name="second" 
                                placeholder="second" 
                                required={true}
                                autocomplete="false"
                            />
                            <Input 
                                type="text" 
                                name="third" 
                                placeholder="third" 
                                required={true}
                                autocomplete="false"
                            />
                            <Button type="submit">Set Reward</Button>
                        </form>
                        <Alert value={phrase3} setValue={setPhrase3}/>
                    </motion.div> : ""
                }
            </motion.div>
        </motion.div>
    )
}