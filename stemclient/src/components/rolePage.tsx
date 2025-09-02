import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { type Task, type RoleUserData } from "../myDataTypes";
import '../styles/rolesPage.css'
import '../styles/global.css'
import { motion } from "motion/react";
import { admins } from "../admins.json"
import RoleAdmin from "./roleAdmin";

interface RolePageProps {
    role: {name: string, id: string}
}

function RolePage({ role } : RolePageProps) {
    const [user, setUser] = useState<User | null>(null);
    const [members, setMembers] = useState<RoleUserData[]>([]);
    const [leaders, setLeaders] = useState<RoleUserData[]>([]);
    const [roleTasks, setRoleTasks] = useState<Task[]>([]);
    const [pageState, setPageState] = useState("home");
    const currentMonth = new Date().toLocaleString("en-US", {month: "long"});
    const pages = ["home", "tasks", "admin"];

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
                setMembers(snap.data().members || []);
            }
        });

        return () => unsub();
    }, [user, role]);

    // Update Leaderboard
    useEffect(() => {
        const roleRef = doc(db, "roles", role.id);
        const unsub = onSnapshot(roleRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                const members = (data.members || []) as RoleUserData[];

                const sorted = [...members].sort((a, b) => (b.points || 0) - (a.points || 0));

                setLeaders(sorted);
            }
        });
        return () => unsub();
    }, [role]);

    // Get User Tasks
    useEffect(() => {
        const q = query(
            collection(db, "tasks"),
            where("roleId", "==", role.id)
        )

        const unsub = onSnapshot(q, (snap) => {
            setRoleTasks(
                snap.docs.map((doc) => ({
                    id: doc.id,
                    ...(doc.data() as Omit<Task, "id">),
                }))
            )
        })
        return () => unsub();
    })

    if (!user) return;

    const userTasks = roleTasks.filter(task => task.assignedTo === user.uid);
    const taskCount = userTasks.length;
    let i = 0;

    return (
        <div className="roles-page">
            <div className="header">
                <h1>{role.name}</h1>
                <div className="user-info">
                        {members.map((m) => {
                            if (m.id.match(user.uid)) {
                                return (
                                    <div key={m.id} className="user">
                                        <h3>{m.points} points</h3>
                                        <h3>{m.taskCompleted} tasks completed</h3>
                                    </div>
                                )
                            }
                        })}
                </div>
            </div>
            <div className="nav-buttons div">
                {pages.map((page) => {
                    if (!admins.includes(user.uid)) return
                    if (page.match("tasks")) {
                        return (
                            <div className="tasks-container">
                                <motion.button 
                                    onClick={() => setPageState(page)}
                                    whileHover={{scale: 1.1, cursor: 'pointer'}}
                                    key={page}
                                >
                                    {page.toLocaleUpperCase()}
                                </motion.button>
                                <p>{taskCount}</p>
                            </div>
                        )
                    }
                    return <motion.button 
                        onClick={() => setPageState(page)}
                        whileHover={{scale: 1.1, cursor: 'pointer'}}
                        key={page}
                    >
                        {page.toLocaleUpperCase()}
                    </motion.button>
                })}
            </div>
            { pageState.match("home") ?
                <motion.div 
                    className="content"
                    initial={{x:-10,position:'absolute'}}
                    animate={{x:0}}
                >
                    <div className="leaderboard div">
                        <h1>Leaderboard</h1>
                        <div className="label">
                            <p></p>
                            <p>Name</p>
                            <p>Points</p>
                        </div>
                        
                        <div className="board">
                            {leaders.map((u) => {
                                i++
                                return (
                                    <div className="user-board" key={u.id}>
                                        <h4>{i}</h4>
                                        <img src={u.photoURL} alt="" className="user-photo" />
                                        <p>{u.name}</p>
                                        <p>{u.points} pts</p>
                                        <p className="tasks">{u.taskCompleted} Completed Tasks</p>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                    <div className="rewards div">
                        <h1>{currentMonth} Rewards</h1>
                    </div>
                    
                </motion.div>
            : "" }
            { pageState.match("tasks") ?
                <motion.div 
                    className="tasks div"
                    initial={{x:-10}}
                    animate={{x:0}}
                >
                    <h1>Your Tasks</h1>
                    <div className="all-tasks">
                        {taskCount > 0 ? roleTasks.map((task) => {
                            if (task.assignedTo.match(user.uid)) {
                                return (
                                    <div
                                        className="task"
                                        key={task.description}
                                    >
                                        <h1>{task.description}</h1>
                                        <p>{task.points} points</p>
                                        <button>Done</button>
                                    </div>
                                )
                            }
                        }) : "No tasks assigned to you"}
                    </div>
                </motion.div>
            : "" }
            { pageState.match("admin") ?
                <RoleAdmin role={role} members={members} />
            : "" }
        </div>
    )
}

export default RolePage;