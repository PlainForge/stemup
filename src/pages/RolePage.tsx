import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { type Task, type Role, type UserData, type UserRoleData } from "../myDataTypes";
import './styles/rolePage.css'
import { motion } from "motion/react";
import RoleAdminPage from "../components/RoleAdmin";
import DoneButton from "../components/TaskDoneButton";
import useUser from "../hooks/UserHook";
import useAdmins from "../hooks/Admin";
import { useParams } from "react-router-dom";

function RolePage() {
    const { id: roleId } = useParams<{ id: string }>();
    const [user] = useUser()
    const [members, setMembers] = useState<string[]>([]);
    const [membersWithData, setMembersWithData] = useState<UserData[]>([]);
    const [leaders, setLeaders] = useState<UserData[]>([]);
    const [userTasks, setUserTasks] = useState<Task[]>([]);
    const [pageState, setPageState] = useState("home");
    const [role, setRole] = useState<Role | null>(null);
    const [rewards, setRewards] = useState<string[]>([]);
    const [tasksLoading, setTasksLoading] = useState(true);
    const [isCurrentRole, setIsCurrentRole] = useState(false);
    const admins = useAdmins();

    const currentMonth = new Date().toLocaleString("en-US", {month: "long"});
    const pages = ["home", "tasks", "admin"];

    useEffect(() => {
        if (!roleId) return;

        const roleRef = doc(db, "roles", roleId);
        const unsub = onSnapshot(roleRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data() as Omit<Role, "id"> & { members: string[] };
            setRole({ id: snap.id, ...data });
            setMembers(data.members || []);
        } else {
            setRole(null);
            setMembers([]);
        }
        });

        return () => unsub();
    }, [roleId]);

    // Get Members
    useEffect(() => {
        if (members.length === 0 || !roleId) {
        setMembersWithData([]);
        return;
        }

        const unsubs = members.map((uid) => {
        const userRef = doc(db, "users", uid);
        return onSnapshot(userRef, (snap) => {
            if (snap.exists()) {
            const data = snap.data();
            setMembersWithData((prev) => {
                const updated = prev.filter((m) => m.id !== uid);
                const roleData = Array.isArray(data.roles)
                ? data.roles.find((r: UserRoleData) => r.id === roleId) || {}
                : {};
                return [
                ...updated,
                {
                    id: uid,
                    uid,
                    name: data.name || "Unknown User",
                    roles: data.roles || [],
                    points: roleData.points || 0,
                    taskCompleted: roleData.taskCompleted || 0,
                    photoURL: data.photoURL || "",
                    currentRole: data.currentRole || "",
                },
                ];
            });
            }
        });
        });

        return () => unsubs.forEach((unsub) => unsub());
    }, [members, roleId]);

    // Get current role
    useEffect(() => {
        if (!user || !roleId) return;
        const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            setIsCurrentRole(data.currentRole === roleId);
        }
        });
        return () => unsub();
    }, [user, roleId]);

    useEffect(() => {
        if (members.length === 0 || !roleId) {
        setMembersWithData([]);
        return;
        }

        const unsubs = members.map((uid) => {
        const userRef = doc(db, "users", uid);
        return onSnapshot(userRef, (snap) => {
            if (snap.exists()) {
            const data = snap.data();
            setMembersWithData((prev) => {
                const updated = prev.filter((m) => m.id !== uid);
                const roleData = Array.isArray(data.roles)
                ? data.roles.find((r: UserRoleData) => r.id === roleId) || {}
                : {};
                return [
                ...updated,
                {
                    id: uid,
                    uid,
                    name: data.name || "Unknown User",
                    roles: data.roles || [],
                    points: roleData.points || 0,
                    taskCompleted: roleData.taskCompleted || 0,
                    photoURL: data.photoURL || "",
                    currentRole: data.currentRole || "",
                },
                ];
            });
            }
        });
        });

        return () => unsubs.forEach((unsub) => unsub());
    }, [members, roleId]);

    // Get role rewards
    useEffect(() => {
        if (!role) return;

        const rewardRef = doc(db, "rewards", role.id);
        const unsub = onSnapshot(rewardRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setRewards([
                    data.first || "No reward set",
                    data.second || "No reward set",
                    data.third || "No reward set",
                ]);
            } else {
                setRewards(["No reward set", "No reward set", "No reward set"]);
            }
        });

        return () => unsub();
    }, [role])

    // Update Leaderboard
    useEffect(() => {
        if (!membersWithData.length) return;
        const sorted = [...membersWithData].sort(
        (a, b) => (b.points || 0) - (a.points || 0)
        );
        setLeaders(sorted);
    }, [membersWithData]);

    // Get User Tasks
    useEffect(() => {
        if (!roleId || !user) {
        setTasksLoading(false);
        return;
        }

        setTasksLoading(true);
        const q = query(
        collection(db, "tasks"),
        where("roleId", "==", roleId),
        where("assignedTo", "==", user.uid)
        );

        const unsub = onSnapshot(
        q,
        (snap) => {
            setUserTasks(
            snap.docs.map((doc) => ({
                id: doc.id,
                ...(doc.data() as Omit<Task, "id">),
            }))
            );
            setTasksLoading(false);
        },
        (err) => {
            console.error("Error fetching tasks:", err);
            setTasksLoading(false);
        }
        );

        return () => unsub();
    }, [roleId, user]);

    const setCurrentRole = async (id : string) => {
        if (!user) return;
        await updateDoc(doc(db, "users", user.uid), {
            currentRole: id
        })
    }

    if (!user || !role) return <h1>Loading role...</h1>;

    const taskCount = userTasks.filter(task => !task.complete).length;
    let i = 0;

    return (
        <div className="roles-page">
            <div className="header">
                <h1>{role.name}</h1>
                <div className="user-info">
                        {membersWithData.map((m) => {
                            if (m.id.match(user.uid) && !admins.includes(user.uid)) {
                                return Object.values(m.roles || {}).map((x) => {
                                    if (x.id === role.id) {
                                        return (
                                            <div key={x.id} className="user">
                                                <h3>{x.points} points</h3>
                                                <h3>{x.taskCompleted} tasks completed</h3>
                                            </div>
                                        )
                                    }
                                    return null
                                })
                            } else {
                                return null
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
                                    whileHover={{y: -2, cursor: 'pointer'}}
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
                            whileHover={{y: -2, cursor: 'pointer'}}
                            key={page}
                            style={pageState === page ? {fontWeight: "500"} : {fontWeight: "300"}}
                        >
                            {page.toLocaleUpperCase()}
                        </motion.button>
                    }
                })}
                {isCurrentRole ? <strong>CURRENT ROLE</strong> : 
                    <motion.button 
                        onClick={() => setCurrentRole(role.id)}
                        onTap={() => setCurrentRole(role.id)}
                        whileHover={{y: -2, cursor: 'pointer'}}
                    >SET CURRENT ROLE</motion.button>
                }
            </div>
            { pageState.match("home") ?
                <motion.div 
                    className="content"
                    initial={{x:-10,position:'absolute'}}
                    animate={{x:0}}
                >
                    <div className="leaderboard div">
                        <h1 className="title">Leaderboard</h1>
                        
                        <div className="board">
                            {leaders ? leaders.map((u) => {
                                if (admins.includes(u.id)) return
                                i++
                                return (
                                    <div className="user-board" key={u.id}>
                                        <div className="info">
                                            <p><strong>{i}</strong></p>
                                            <img src={u.photoURL} alt="" className="user-photo" />
                                            <p>{u.name}</p>
                                        </div>
                                        <div className="stats">
                                            <p>{u.points} pts</p>
                                            <p className="tasks">{u.taskCompleted} Tasks Completed</p>
                                        </div>
                                    </div>
                                )
                            }) : "Loading"}
                        </div>
                    </div>
                    <div className="rewards div">
                        <h1 className="title">{currentMonth} Rewards</h1>
                        {["First", "Second", "Third"].map((label, idx) => (
                            <div className="reward" key={label}>
                                <h1>{label}</h1>
                                <p>{rewards[idx] ?? "No reward set"}</p>
                            </div>
                        ))}
                    </div>
                    
                </motion.div>
            : "" }
            { pageState.match("tasks") ?
                <motion.div 
                    className="tasks div"
                    initial={{x:-10}}
                    animate={{x:0}}
                >
                    <h1>Your {currentMonth} Tasks</h1>
                    <div className="all-tasks">
                        {tasksLoading ? <p>Loading Tasks...</p> 
                        : userTasks.length > 0 && !admins.includes(user.uid) ? userTasks.map((task) => {
                            return (
                                <motion.div
                                    className={task.complete ? "task-completed" : "task"}
                                    key={task.id}
                                    initial={{x:-10}}
                                    animate={{x:0}}
                                >
                                    <h1>{task.title}</h1>
                                    <h3>Description</h3>
                                    <p>{task.description || "N/A"}</p>
                                    <h4>{task.points} points</h4>
                                    <DoneButton task={task} />
                                </motion.div>
                            )
                        }) : <p>"No tasks assigned to you"</p>}
                    </div>
                </motion.div>
            : "" }
            { pageState.match("admin") ?
                <RoleAdminPage role={role} membersWithData={membersWithData} />
            : "" }
        </div>
    )
}

export default RolePage;