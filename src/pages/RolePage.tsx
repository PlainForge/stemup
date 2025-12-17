import { useContext, useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { type Task, type Role, type UserData, type UserRoleData, type SubmittedTask } from "../myDataTypes";
import { motion } from "motion/react";
import RoleAdminPage from "../components/RoleAdmin";
import DoneButton from "../components/TaskDoneButton";
import { useNavigate, useParams } from "react-router-dom";
import Loading from "./Loading";
import { MainContext } from "../context/MainContext";
import LinkButton from "../components/LinkButton";
import Button from "../components/Button";
import ProfileButton from "../components/ProfileButton";

export default function RolePage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();

    const { id: roleId } = useParams<{ id: string }>();
    const [members, setMembers] = useState<string[]>([]);
    const [membersWithData, setMembersWithData] = useState<UserData[]>([]);
    const [leaders, setLeaders] = useState<UserData[]>([]);
    const [userTasks, setUserTasks] = useState<Task[]>([]);
    const [pageState, setPageState] = useState("leaderboard");
    const [role, setRole] = useState<Role | null>(null);
    const [rewards, setRewards] = useState<string[]>([]);
    const [tasksLoading, setTasksLoading] = useState(true);
    const [isCurrentRole, setIsCurrentRole] = useState(false);
    const [isMember, setIsMember] = useState<boolean | null>(null);

    const [requested, setRequested] = useState<string[]>([]);
    const [submittedTasks, setSubmittedTasks] = useState<SubmittedTask[]>([]);

    const currentMonth = new Date().toLocaleString("en-US", {month: "long"});

    const user = context?.user ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? [];

    useEffect(() => {
        if (!roleId || !user) return;

        const roleRef = doc(db, "roles", roleId);

        const unsub = onSnapshot(roleRef, (snap) => {
            if (!snap.exists()) {
                setRole(null);
                setMembers([]);
                setIsMember(false);
                return;
            }

            const data = snap.data() as Omit<Role, "id"> & { members: string[] };

            setRole({ id: snap.id, ...data });
            setMembers(data.members || []);
            setIsMember((data.members || []).includes(user.uid));
        });

        return unsub;
    }, [roleId, user]);

    useEffect(() => {
        setMembersWithData((prev) =>
            prev.filter((m) => members.includes(m.uid))
        );
    }, [members]);

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

    // Get Members to get requested user's data
    useEffect(() => {
        if (!role) return;
        const roleRef = doc(db, "roles", role.id);
        const unsub = onSnapshot(roleRef, (snap) => {
            if (snap.exists()) {
                setRequested(snap.data().pendingRequests || []);
            }
        });

        return () => unsub();
    }, [role, setRequested]);

    // Getting the current role's submitted tasks
    useEffect(() => {
        if (!role) return;
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
    }, [role, setSubmittedTasks]);

    useEffect(() => {
        if (!loading && role && !isMember) {
            navigate("/roles", { replace: true });
        }
    }, [isMember, role, loading, navigate]);

    const setCurrentRole = async (id : string) => {
        if (!user) return;
        await updateDoc(doc(db, "users", user.uid), {
            currentRole: id
        })
    }

    if (loading || isMember === null) return <Loading />;
    if (!isMember || !user || !role ) return null;

    const taskCount = userTasks.filter(task => !task.complete).length;
    let i = 0;

    return (
        <div className="w-full flex flex-col gap-2">
            <div className="w-full flex justify-evenly">
                <h1 className="text-2xl"><span className="font-bold">Role</span> {role.name}</h1>
                {membersWithData.map((m) => {
                    if (m.id.match(user.uid) && !admins.includes(user.uid)) {
                        return Object.values(m.roles || {}).map((x) => {
                            if (x.id === role.id) {
                                return (
                                    <div key={x.id} className="flex gap-4">
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
                {admins.includes(user.uid) ? <p className="font-bold">Admin View</p> : null}
            </div>
            <div className="w-full flex items-center justify-center gap-6">
                <LinkButton
                    onClick={() => setPageState("leaderboard")}
                    moreClass={pageState === "leaderboard" ? "font-semibold" : "font-regular"}
                >
                    Leaderboard
                </LinkButton>
                <LinkButton
                    onClick={() => setPageState("rewards")}
                    moreClass={pageState === "rewards" ? "font-semibold" : "font-regular"}
                >
                    Rewards
                </LinkButton>
                {!admins.includes(user.uid) ? 
                    <LinkButton
                        onClick={() => setPageState("tasks")}
                        moreClass={pageState === "tasks" ? "font-semibold flex items-center" : "font-regular flex items-center"}
                    >
                        Tasks
                        {taskCount > 0 ? <p className="ml-2 bg-green-400 px-2 py-0.5 rounded-full">{taskCount}</p> : null}
                    </LinkButton>
                    :
                    <div className="relative">
                        {requested.length > 0 || submittedTasks.length > 0 ?
                        <span className="absolute flex size-3 -top-2 -right-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
                            <span className="relative inline-flex size-3 rounded-full bg-sky-500"></span>
                        </span>
                        : null}
                        <LinkButton
                        onClick={() => setPageState("admin")}
                        moreClass={
                            `
                            ${pageState === "admin" ? "font-semibold" : "font-regular"} 
                            `
                        }
                        >
                            Admin
                        </LinkButton>
                    </div>
                }
                {isCurrentRole ? 
                    <motion.p 
                        whileHover={{cursor: "default"}}
                        initial={{scale:0}}
                        animate={{scale:1}}
                    >
                        <strong>Your Role</strong>
                    </motion.p> 
                    : 
                    <Button
                        size="xsm"
                        onClick={() => setCurrentRole(role.id)}
                    >Set Role</Button>
                }
            </div>
            { 
                pageState.match("leaderboard") ?
                <motion.div 
                    className="w-full flex flex-col items-center"
                >
                    <div className="w-full flex flex-col items-center">
                        <h1 className="text-2xl">Leaderboard</h1>

                        <div className="w-11/12 md:w-1/2 flex flex-col">
                            {leaders ? leaders.map((u) => {
                                if (admins.includes(u.id)) return;
                                i++
                                if (i < 4) {
                                return (
                                    <div className="w-full justify-between flex flex-col md:flex-row border-b py-2" key={u.id}>
                                        <div className="flex justify-between items-center gap-4">
                                            <p className="mr-2 text-2xl"><strong>{i}</strong></p>
                                            <ProfileButton user={u} size="xs"/>
                                        </div>
                                        <div className="flex gap-4 items-center justify-center">
                                            <p><span className="font-bold">{u.points}</span> pts</p>
                                            <p><span className="font-bold">{u.taskCompleted}</span> Tasks Completed</p>
                                        </div>
                                    </div>
                                )
                                } else {
                                    return (
                                        <div className={`w-full justify-between flex flex-col md:flex-row border-b py-2`} key={u.id}>
                                            <div className="flex justify-between items-center gap-4">
                                                <p className={`${i > 9 ? "mr-0" : "mr-2"}`}><strong>{i}</strong></p>
                                                <ProfileButton user={u} size="xxs"/>
                                            </div>
                                            <div className="flex gap-4 items-center justify-center">
                                                <p><span className="font-bold">{u.points}</span> pts</p>
                                            <p><span className="font-bold">{u.taskCompleted}</span> Tasks Completed</p>
                                            </div>
                                        </div>
                                    )
                                }
                            }) : "Loading..."}
                        </div>
                    </div>
                    
                    
                </motion.div> 
                :
                pageState.match("rewards") ?
                <motion.div 
                    className="w-full flex flex-col items-center"
                >
                    <h1 className="text-2xl">{currentMonth} Rewards</h1>
                    {["First", "Second", "Third"].map((label, idx) => {
                        const filteredLeaders = leaders.filter(
                            (leader) => !admins.includes(leader.uid)
                        );
                        const winners = filteredLeaders[idx];
                        return (
                            <div className="w-11/12 md:w-1/2 flex justify-between mb-4 border-b" key={label}>
                                <div className="flex flex-col">
                                    <h1 className="text-2xl font-medium">{label}</h1>
                                    <p>{winners ? winners.name : "No user"}</p>
                                </div>
                                <p>{rewards[idx] ?? "No reward set"}</p>
                            </div>
                        )
                    })}
                </motion.div>
                :
                pageState.match("tasks") ?
                <motion.div 
                    className="w-full flex flex-col items-center"
                >   
                    <h1 className="text-2xl font-semibold">Your {currentMonth} Tasks</h1>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 my-4 p-4 w-full">
                        {tasksLoading ? <p>Loading Tasks...</p> 
                        : userTasks.length > 0 && !admins.includes(user.uid) ? userTasks.map((task) => {
                            return (
                                <motion.div
                                    className={`${task.complete ? "border-green-500" : "border-red-500"} flex flex-col border-2 p-4 rounded-2xl`}
                                    key={task.id}
                                >
                                    <h1 className="text-2xl text-center"><span className="font-bold">Title:</span> {task.title}</h1>
                                    <div className="flex flex-col gap-2 mb-4">
                                        <h4 className="font-medium">Description:</h4>
                                        <p>{task.description || "N/A"}</p>
                                        <h4 className="sub-title">{task.points} points</h4>
                                    </div>
                                    <DoneButton task={task} />
                                </motion.div>
                            )
                        }) : <p className="text-2xl">No tasks assigned to you</p>}
                    </div>
                </motion.div>
                :
                pageState.match("admin") ?
                <RoleAdminPage 
                    role={role} 
                    membersWithData={membersWithData} 
                    requested={requested} 
                    setRequested={setRequested} 
                    submittedTasks={submittedTasks}
                    setSubmittedTasks={setSubmittedTasks}
                />
                : "" }
        </div>
    )
}