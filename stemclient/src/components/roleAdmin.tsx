import { addDoc, collection, doc, onSnapshot } from "firebase/firestore";
import { motion } from "motion/react";
import { useEffect, useState, type FormEvent } from "react";
import { auth, db } from "../firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { type RoleUserData, type UserData } from "../myDataTypes";

interface prop {
    role: {name: string, id: string}
    members: RoleUserData[]
}

function RoleAdmin({ role, members } : prop) {
    const [user, setUser] = useState<User | null>(null);
    const [page, setPage] = useState("submitted");
    const [requested, setRequested] = useState<string[]>([]);
    const [userRequested, setUserRequested] = useState<UserData[]>([]);

    //For creating tasks
    const [taskFor, setTaskFor] = useState<RoleUserData | null>(null);

    // Check User Status
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });
        return () => unsub();
    }, [user]);

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
        if (requested.length < 1) return
        const unsubs: (() => void)[] = [];

        requested.forEach((uid) => {
            const ref = doc(db, "users", uid);
            const unsub = onSnapshot(ref, (snap) => {
            if (snap.exists()) {
                setUserRequested((prev) => {
                // merge/update without duplicating
                const others = prev.filter((u) => u.uid !== uid);
                return [...others, { uid, ...(snap.data()) }];
                });
            }
            });
            unsubs.push(unsub);
        });

        return () => unsubs.forEach((u) => u());
    }, [role, requested])

    const sendTask = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget)
        const desc = formData.get("desc") as string;
        const pts = Number(formData.get("pts"));

        if (!taskFor) {
            console.error("No user selected");
            return;
        }

        console.log(taskFor.id, desc, pts, role.id)

        try {
            await addDoc(collection(db, "tasks"), {
                assignedTo: taskFor?.id,
                description: desc,
                points: pts,
                roleId: role.id
            });
        } catch (err) {
            console.log(err)
        }
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
                    <div>
                        <h1>Requests</h1>
                        <div>
                            {userRequested.map((user) => {
                                return (
                                    <div key={user.name}>
                                        <p>{user.name}</p>
                                        <button>accept</button>
                                        <button>decline</button>
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
                            <label htmlFor="user">Assigned To </label>
                            <select id="user" onChange={(e) => {
                                const selectedUser = members.find(m => m.id === e.target.value)
                                setTaskFor(selectedUser || null);
                            }}>
                                {members.map((member) => {
                                    return (
                                        <option key={member.id} value={member.id}>
                                            {member.name}
                                        </option>
                                    )
                                })}
                            </select>
                            <input type="text" name="desc" />
                            <input type="number" name="pts" />
                            <button type="submit">Create</button>
                        </form>
                    </div> : ""
                }
                {page.match("submitted") ? 
                    <div>
                        <h1>Tasks Submitted</h1>
                    </div> : ""
                }
                {page.match("config") ? 
                    <div>
                        <h1>Role Config</h1>
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