import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import { db } from "../firebase";
import { type Role, type SubmittedTask, type UserData, type UserRoleData } from "../myDataTypes";
import "../styles/rolesAdmin.css"
import useUser from "../hooks/user";
import useAdmins from "../hooks/admins";

interface prop {
    role: {name: string, id: string}
    membersWithData: UserData[]
}

function RoleAdmin({ role, membersWithData } : prop) {
    const [user, userData, loading] = useUser()
    const [page, setPage] = useState("submitted");
    const [requested, setRequested] = useState<string[]>([]);
    const [userRequested, setUserRequested] = useState<UserData[]>([]);
    const [submittedTasks, setSubmittedTasks] = useState<SubmittedTask[]>([]);
    const admins = useAdmins();

    // Get Members to get requested user's data
    useEffect(() => {
        const roleRef = doc(db, "roles", role.id);
        const unsub = onSnapshot(roleRef, (snap) => {
            if (snap.exists()) {
                setRequested(snap.data().pendingRequests || []);
            }
        });

        return () => unsub();
    }, [role.id]);

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

    // Getting the current role's submitted tasks
    useEffect(() => {
        const q = query(
            collection(db, "tasksSubmitted"),
            where("roleId", "==", role.id),
            where("complete", "==", false)
        )

        const unsub = onSnapshot(q, (snap) => {
            setSubmittedTasks(
                snap.docs.map((doc) => ({
                    id: doc.id,
                    ...(doc.data() as Omit<SubmittedTask, "id">),
                }))
            )
        })
        return () => unsub();
    }, [role])

    // Sending a task to a user in the current role
    const sendTask = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const form = e.currentTarget;
        const formData = new FormData(e.currentTarget)
        const desc = formData.get("desc") as string;
        const title = formData.get("title") as string;
        const pts = Number(formData.get("pts"));
        const assignedId = formData.get("user") as string;

        const selectedUser = membersWithData.find(m => m.id === assignedId);
        if (!selectedUser) {
            console.error("No user selected");
            return;
        }
        if (!title) {
            console.error("No title")
        } else if (pts < 0) {
            console.error("Points need to be positive");
        }

        try {
            await addDoc(collection(db, "tasks"), {
                assignedTo: selectedUser.id,
                assignedName: selectedUser.name,
                description: desc,
                points: pts,
                roleId: role.id,
                createdOn: Timestamp.now(),
                complete: false,
                title: title
            });
            form.reset();
        } catch (err) {
            console.log(err)
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
            form.reset();
        } catch (err) {
            console.log(err);
        }
    }

    if (!user || !userData || loading) {
        return <h1>Loading...</h1>
    }

    return (
        <motion.div
            initial={{x:-10}}
            animate={{x:0}}
            className="role-admin-page"
        >
            <motion.div 
                className="control-buttons"
                initial={{x:-10}}
                animate={{x:0}}
            >
                <motion.button 
                    onClick={() => setPage("requests")} 
                    onTap={() => setPage("requests")}
                    whileHover={{scale: 1.1, cursor: "pointer"}}
                    style={page === "requests" ? {fontWeight: "bolder"} : {fontWeight: "normal"}}
                >Requests <span>{requested.length}</span></motion.button>
                <motion.button 
                    onClick={() => setPage("creation")} 
                    onTap={() => setPage("creation")}
                    whileHover={{scale: 1.1, cursor: "pointer"}}
                    style={page === "creation" ? {fontWeight: "bolder"} : {fontWeight: "normal"}}
                >Task Creation</motion.button>
                <motion.button 
                    onClick={() => setPage("submitted")}
                    onTap={() => setPage("submitted")}
                    whileHover={{scale: 1.1, cursor: "pointer"}}
                    style={page === "submitted" ? {fontWeight: "bolder"} : {fontWeight: "normal"}}
                >Submitted Tasks <span>{submittedTasks.length}</span></motion.button>
                <motion.button 
                    onClick={() => setPage("config")}
                    onTap={() => setPage("config")}
                    whileHover={{scale: 1.1, cursor: "pointer"}}
                    style={page === "config" ? {fontWeight: "bolder"} : {fontWeight: "normal"}}
                >Role Config</motion.button>
                <motion.button 
                    onClick={() => setPage("kick")}
                    onTap={() => setPage("kick")}
                    whileHover={{scale: 1.1, cursor: "pointer"}}
                    style={page === "kick" ? {fontWeight: "bolder"} : {fontWeight: "normal"}}
                >Member Kick</motion.button>
                <motion.button 
                    onClick={() => setPage("rewards")}
                    onTap={() => setPage("rewards")}
                    whileHover={{scale: 1.1, cursor: "pointer"}}
                    style={page === "rewards" ? {fontWeight: "bolder"} : {fontWeight: "normal"}}
                >Rewards</motion.button>
            </motion.div>
            <motion.div className="content">
                {page.match("requests") ? 
                    <motion.div 
                        className="request-container"
                        initial={{x: -10}}
                        animate={{x:0}}
                    >
                        <h1>Requests</h1>
                        <div className="requested-users">
                            {userRequested.map((user) => {
                                return (
                                    <motion.div 
                                        key={user.name} 
                                        className="requested-user"
                                        initial={{x: -10}}
                                        animate={{x:0}}
                                    >
                                        <h3>{user.name}</h3>
                                        <div className="req-user-buttons">
                                            <motion.button 
                                                onClick={() => acceptRequest(user.uid)} 
                                                onTap={() => acceptRequest(user.uid)}
                                                whileHover={{cursor: "pointer"}}
                                                className="req-accept"
                                            >accept</motion.button>
                                            <motion.button 
                                                onClick={() => declineRequest(user.uid)}
                                                onTap={() => declineRequest(user.uid)} 
                                                whileHover={{cursor: "pointer"}}
                                                className="req-decline"
                                            >decline</motion.button>
                                        </div>
                                        
                                    </motion.div>
                                )
                            })}
                        </div>
                    </motion.div> : null
                }
                {page.match("creation") ? 
                    <motion.div 
                        className="creation"
                        initial={{x: -10}}
                        animate={{x:0}}
                    >
                        <h1>Task Creation</h1>
                        <form className="creation-form" id="create" onSubmit={sendTask}>
                            <select name="user" defaultValue="">
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
                            <input type="text" name="title" placeholder="Title" required/>
                            <input type="text" name="desc" placeholder="Description"/>
                            <input type="number" id="pts" name="pts" placeholder="Points" required/>
                            <motion.button 
                                type="submit" 
                                className="submit" 
                                whileHover={{cursor: "pointer"}}
                            >Create</motion.button>
                        </form>
                    </motion.div> : ""
                }
                {page.match("submitted") ? 
                    <motion.div 
                        className="submitted-container"
                        initial={{x: -10}}
                        animate={{x:0}}
                    >
                        <h1>Tasks Submitted</h1>
                        <div className="submitted-tasks">
                            {submittedTasks.map((submitted) => {
                                if (submitted.complete) return null
                                return (
                                    <motion.div 
                                        className="submitted-task" 
                                        key={submitted.id}
                                        initial={{x: -10}}
                                        animate={{x:0}}
                                    >
                                        <h1>{submitted.title}</h1>
                                        <h4>{submitted.description}</h4>
                                        <p>{submitted.points} pts</p>
                                        <p className="task-date">Submitted on {submitted.submission ? submitted.submission.toDate().toString() : 'N/A'}</p>
                                        <p>by {submitted.assignedName}</p>
                                        <div className="task-buttons">
                                            <motion.button 
                                                onClick={() => acceptTask(submitted)}
                                                onTap={() => acceptTask(submitted)} 
                                                className="task-approve"
                                                whileHover={{cursor: "pointer"}}
                                            >Approve</motion.button>
                                            <motion.button 
                                                onClick={() => declineTask(submitted)}
                                                onTap={() => declineTask(submitted)} 
                                                className="task-disapprove"
                                                whileHover={{cursor: "pointer"}}
                                            >Disapprove</motion.button>
                                        </div>
                                    </motion.div>
                                )
                            })}
                        </div>
                    </motion.div> : ""
                }
                {page.match("config") ? 
                    <motion.div 
                        className="role-config"
                        initial={{x: -10}}
                        animate={{x:0}}
                    >
                        <h1>Role Config</h1>
                        <form className="set-role-name" id="rolename" onSubmit={changeRoleName}>
                            <input type="text" name="newName" placeholder="Change Role Name" required/>
                            <button type="submit">Change Role Name</button>
                        </form>
                        <button className="reset-role" onClick={() => resetRole(role.id)}>Monthly Reset</button>
                        <button className="del-role" onClick={() => deleteRole(role.id)}>Delete Role</button>
                    </motion.div> : ""
                }
                {page.match("kick") ? 
                    <motion.div
                        initial={{x: -10}}
                        animate={{x:0}}
                    >
                        <h1>Member Kick</h1>
                        <p>wip</p>
                    </motion.div> : ""
                }
                {page.match("rewards") ? 
                    <motion.div
                        className="rewards-container"
                        initial={{x: -10}}
                        animate={{x:0}}
                    >
                        <h1>Rewards</h1>
                        <form className="set-reward-container" onSubmit={setReward}>
                            <input type="text" name="first" placeholder="first" required />
                            <input type="text" name="second" placeholder="second" required />
                            <input type="text" name="third" placeholder="third" required />
                            <button type="submit">Set Reward</button>
                        </form>
                    </motion.div> : ""
                }
            </motion.div>
        </motion.div>
    )
}

export default RoleAdmin;