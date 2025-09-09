import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { type Task, type RoleUserData, type Role } from "../myDataTypes";
import '../styles/rolesPage.css'
import '../styles/global.css'
import { motion } from "motion/react";
import RoleAdmin from "./roleAdmin";
import DoneButton from "./doneButton";
import useUser from "../hooks/user";
import useAdmins from "../hooks/admins";

interface RolePageProps {
    role: Role | null
}

function RolePage({ role } : RolePageProps) {
    const [user, loading] = useUser()
    const [members, setMembers] = useState<RoleUserData[]>([]);
    const [leaders, setLeaders] = useState<RoleUserData[]>([]);
    const [roleTasks, setRoleTasks] = useState<Task[]>([]);
    const [pageState, setPageState] = useState("home");
    const [upRole, setUpRole] = useState<Role>();
    const [rewards, setRewards] = useState<string[]>([]);
    const admins = useAdmins();

    const currentMonth = new Date().toLocaleString("en-US", {month: "long"});
    const pages = ["home", "tasks", "admin"];
    let rewardIndex = 0;

    // Get Members
    useEffect(() => {
        if (!role) return;
        const roleRef = doc(db, "roles", role.id);
        const unsub = onSnapshot(roleRef, (snap) => {
            if (snap.exists()) {
                setMembers(snap.data().members || []);
            }
        });

        return () => unsub();
    }, [user, role]);

    useEffect(() => {
        if (!role) return;
        const rewardRef = doc(db, "rewards", role.id);
        const unsub = onSnapshot(rewardRef, (snap) => {
            const temp : string[] = []
            if (snap.exists()) {
                const data = snap.data();
                temp.push(data.first);
                temp.push(data.second);
                temp.push(data.third);
                setRewards(temp)
            }
        })

        return () => unsub();
    }, [user, role])

    // Update Leaderboard
    useEffect(() => {
        if (!role) return;
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
        if (!role) return;
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
    } , [role])

    useEffect(() => {
        if (!role) return;

        const roleRef = doc(db, "roles", role.id);
        const unsub = onSnapshot(roleRef, (snap) => {
            if (snap.exists()) {
                // Merge role id with updated fields
                const updatedRole: Role = {
                    id: snap.id,
                    ...(snap.data() as Omit<Role, "id">),
                };
                setUpRole(updatedRole);
            }
        });

        return () => unsub();
    }, [role]);

    if (!user || !role || !upRole) return;
    if (loading) {
        return <h1>Loading...</h1>
    }

    const userTasks = roleTasks.filter(task => task.assignedTo === user.uid);
    const taskCount = userTasks.length;
    let i = 0;

    return (
        <div className="roles-page">
            <div className="header">
                <h1>{upRole.name}</h1>
                <div className="user-info">
                        {members.map((m) => {
                            if (m.id.match(user.uid) && !admins.includes(user.uid)) {
                                return (
                                    <div key={m.id} className="user">
                                        <h3>{m.points} points</h3>
                                        <h3>{m.taskCompleted} tasks completed</h3>
                                    </div>
                                )
                            }
                        })}
                        {admins.includes(user.uid) ? <p>Admin View</p> : null}
                </div>
            </div>
            <div className="nav-buttons div">
                {pages.map((page) => {
                    if (!admins.includes(user.uid) && page.match("admin")) return
                    if (page.match("tasks")) {
                        if (admins.includes(user.uid)) return null
                        return (
                            <div className="tasks-container" key={page}>
                                <motion.button 
                                    onClick={() => setPageState(page)}
                                    onTap={() => setPageState(page)}
                                    whileHover={{scale: 1.1, cursor: 'pointer'}}
                                    style={pageState === "tasks" ? {fontWeight: "bolder"} : {fontWeight: "normal"}}
                                >
                                    {page.toLocaleUpperCase()}
                                </motion.button>
                                {taskCount > 0 ? <p>{taskCount}</p> : ""}
                            </div>
                        )
                    } else {
                        return <motion.button 
                            onClick={() => setPageState(page)}
                            onTap={() => setPageState(page)}
                            whileHover={{scale: 1.1, cursor: 'pointer'}}
                            key={page}
                            style={pageState === page ? {fontWeight: "bolder"} : {fontWeight: "normal"}}
                        >
                            {page.toLocaleUpperCase()}
                        </motion.button>
                    }
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
                        </div>
                        
                        <div className="board">
                            {leaders.map((u) => {
                                if (admins.includes(u.id)) return
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
                        {rewards.map((reward) => {
                            rewardIndex++;
                            return <h1 key={rewards.indexOf(reward)}>{rewardIndex} {reward}</h1>
                        })}
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
                                        key={task.id}
                                    >
                                        <h1>{task.title}</h1>
                                        <h3>Description</h3>
                                        <p>{task.description}</p>
                                        <p>{task.points} points</p>
                                        <DoneButton task={task} />
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