import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot, query, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import { db } from "../firebase";
import { type Role, type RoleUserData, type SubmittedTask, type UserData } from "../myDataTypes";
import "../styles/rolesAdmin.css"
import {admins} from '../admins.json';
import useUser from "../hooks/user";

interface prop {
    role: {name: string, id: string}
    members: RoleUserData[]
}

function RoleAdmin({ role, members } : prop) {
    const [user, loading] = useUser()
    const [page, setPage] = useState("submitted");
    const [requested, setRequested] = useState<string[]>([]);
    const [userRequested, setUserRequested] = useState<UserData[]>([]);
    const [submittedTasks, setSubmittedTasks] = useState<SubmittedTask[]>([]);

    // Get Members
    useEffect(() => {
        const roleRef = doc(db, "roles", role.id);
        const unsub = onSnapshot(roleRef, (snap) => {
            if (snap.exists()) {
                setRequested(snap.data().pendingRequests || []);
            }
        });

        return () => unsub();
    }, [user, role]);

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

    useEffect(() => {
        const q = query(
            collection(db, "tasksSubmitted"),
            where("roleId", "==", role.id)
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

    const sendTask = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const form = e.currentTarget;
        const formData = new FormData(e.currentTarget)
        const desc = formData.get("desc") as string;
        const title = formData.get("title") as string;
        const pts = Number(formData.get("pts"));
        const assignedId = formData.get("user") as string;

        const selectedUser = members.find(m => m.id === assignedId);
        if (!selectedUser) {
            console.error("No user selected");
            return;
        }

        try {
            await addDoc(collection(db, "tasks"), {
                assignedTo: selectedUser.id,
                assignedName: selectedUser.name,
                description: desc,
                points: pts,
                roleId: role.id,
                createdOn: Timestamp.now(),
                title: title
            });
            form.reset();
        } catch (err) {
            console.log(err)
        }
    }

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
                members: arrayUnion({
                    id: thisUser.uid,
                    name: thisUser.name,
                    photoURL: thisUser.photoURL,
                    points: 0,
                    taskCompleted: 0
                })
            }, {merge:true})
            await updateDoc(doc(db, "users", id), {
                roles: arrayUnion({id: role.id, name: role.name})
            })
        } catch (err) {
            console.log(err);
        }
    }

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

    const acceptTask = async (submitted : SubmittedTask) => {
        if (!submitted) return;
        const addedPts = submitted.points;
        const thisUser = submitted.assignedTo;
        const thisRoleId = submitted.roleId;

        try {
            await deleteDoc(doc(db, "tasks", submitted.id));
            await deleteDoc(doc(db, "tasksSubmitted", submitted.id));

            const roleRef = doc(db, "roles", thisRoleId);
            const roleSnap = await getDoc(roleRef);

            if (!roleSnap.exists()) return;

            const data = roleSnap.data();
            const members : RoleUserData[] = data.members || [];

            const updatedMembers = members.map((m) => {
                if (m.id === thisUser) {
                    return {
                        ...m,
                        points: (m.points || 0) + addedPts,
                        taskCompleted: (m.taskCompleted || 0) + 1,
                    };
                }
                return m;
            });
            await updateDoc(roleRef, {
                members: updatedMembers
            })
            await updateDoc(doc(db, "users", thisUser), {
                points: increment(addedPts)
            })
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

    const deleteRole = async (roleId : string) => {
        const confirmDelete = window.confirm("Are you sure you want to delete your account? This cannot be undone.");

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

    if (!user || loading) {
        return <h1>Loading...</h1>
    }

    return (
        <div>
            <motion.div 
                className="control-buttons"
                initial={{x:-10}}
                animate={{x:0}}
            >
                <button onClick={() => setPage("requests")}>Requests {requested.length}</button>
                <button onClick={() => setPage("creation")}>Task Creation</button>
                <button onClick={() => setPage("submitted")}>Submitted Tasks {submittedTasks.length}</button>
                <button onClick={() => setPage("config")}>Role Config</button>
                <button onClick={() => setPage("kick")}>Member Kick</button>
                <button onClick={() => setPage("rewards")}>Rewards</button>
            </motion.div>
            <div className="content">
                {page.match("requests") ? 
                    <div className="request-container">
                        <h1>Requests</h1>
                        <div className="requested-users">
                            {userRequested.map((user) => {
                                return (
                                    <div key={user.name} className="req-user">
                                        <p>{user.name}</p>
                                        <button onClick={() => acceptRequest(user.uid)}>accept</button>
                                        <button onClick={() => declineRequest(user.uid)}>decline</button>
                                    </div>
                                )
                            })}
                        </div>
                    </div> : ""
                }
                {page.match("creation") ? 
                    <div className="creation">
                        <h1>Task Creation</h1>
                        <form className="creation-form" id="create" onSubmit={sendTask}>
                            <select name="user" defaultValue="">
                                <option value="" disabled>Select a member</option>
                                {members.map((member) => {  
                                    if (admins.includes(member.id)) return null
                                    return (
                                        <option key={member.id} value={member.id}>
                                            {member.name}
                                        </option>
                                    )
                                })}
                            </select>
                            <input type="text" name="title" placeholder="Title"/>
                            <input type="text" name="desc" placeholder="Description"/>
                            <input type="number" name="pts" placeholder="Points"/>
                            <button type="submit">Create</button>
                        </form>
                    </div> : ""
                }
                {page.match("submitted") ? 
                    <div className="submitted-container">
                        <h1>Tasks Submitted</h1>
                        <div>
                            {submittedTasks.map((submitted) => {
                                return (
                                    <div className="submitted-tasks" key={submitted.id}>
                                        <h1>{submitted.title}</h1>
                                        <h3>{submitted.description}</h3>
                                        <p>{submitted.points} pts</p>
                                        <p>Submitted on {submitted.submission ? submitted.submission.toDate().toString() : 'N/A'} by {submitted.assignedName}</p>
                                        <button onClick={() => acceptTask(submitted)}>Approve</button>
                                        <button onClick={() => declineTask(submitted)}>Disapprove</button>
                                    </div>
                                )
                            })}
                        </div>
                    </div> : ""
                }
                {page.match("config") ? 
                    <div>
                        <h1>Role Config</h1>
                        <form className="set-role-name" id="rolename" onSubmit={changeRoleName}>
                            <input type="text" name="newName" placeholder="Change Role Name"/>
                            <button type="submit">Change</button>
                        </form>
                        <button onClick={() => deleteRole(role.id)}>Delete Role</button>
                    </div> : ""
                }
                {page.match("kick") ? 
                    <div>
                        <h1>Member Kick</h1>
                        <p>wip</p>
                    </div> : ""
                }
                {page.match("rewards") ? 
                    <div>
                        <h1>Rewards</h1>
                        <form className="set-reward-container" onSubmit={setReward}>
                            <input type="text" name="first" placeholder="first" />
                            <input type="text" name="second" placeholder="second" />
                            <input type="text" name="third" placeholder="third" />
                            <button type="submit">Set Reward</button>
                        </form>
                    </div> : ""
                }
            </div>
        </div>
    )
}

export default RoleAdmin;