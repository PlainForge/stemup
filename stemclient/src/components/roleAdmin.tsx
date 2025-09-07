import { addDoc, arrayRemove, arrayUnion, collection, doc, getDoc, onSnapshot, query, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import { db } from "../firebase";
import { type RoleUserData, type SubmittedTask, type UserData } from "../myDataTypes";
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
                    // merge/update without duplicating
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
                <button onClick={() => setPage("submitted")}>Submitted Tasks</button>
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
                                        <button>Approve</button>
                                        <button>Disapprove</button>
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
                    </div> : ""
                }
                {page.match("kick") ? 
                    <div>
                        <h1>Member Kick</h1>
                    </div> : ""
                }
                {page.match("rewards") ? 
                    <div>
                        <h1>Rewards</h1>
                    </div> : ""
                }
            </div>
        </div>
    )
}

export default RoleAdmin;