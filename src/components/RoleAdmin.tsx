import { addDoc, arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, onSnapshot, query, Timestamp, updateDoc, where } from "firebase/firestore";
import { alertDialog, confirmDialog, promptDialog } from "../lib/confirm";
import { roleService, isRoleStaff, canChangeRole, roleOwner, describeRoleChange, isRoleChange } from "../lib/roleService";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useSlidingIndicator } from "../lib/useSlidingIndicator";
import { AnimatePresence, motion } from "motion/react";
import { useContext, useEffect, useState, type FormEvent } from "react";
import { db } from "../lib/firebase";
import { type MessagingFeature, type Role, type RoleInvite, type StemRequest, type SubmittedTask, type Task, type UserData, type UserRoleData } from "../myDataTypes";
import { MainContext } from "../context/MainContext";
import LinkButton from "./LinkButton";
import Button from "./Button";
import Input from "./Input";
import { Alert } from "./PhraseAlert";
import ProfileImg from "./ProfileImg";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDownAZ, faArrowDownWideShort, faArrowDownZA, faArrowRightArrowLeft, faArrowUpWideShort, faCalendar, faCalendarDays, faChevronRight, faComments, faLock, faPalette, faRotate, faTrash, faCircleCheck, faCircleDot, faClock, faFlagCheckered, faInbox, faMagnifyingGlass, faPen, faPersonRunning, faRotateLeft, faTrashCan, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
import PersonPicker from "./PersonPicker";
import Dropdown from "./Dropdown";
import DatePicker from "./DatePicker";
import RoleIcon from "./RoleIcon";
import RoleIconPicker from "./RoleIconPicker";
import BackButton from "./BackButton";
import { CardAction, Chip, ChipRow, TaskCard, TaskDescription, TaskHeader, type TaskTone } from "./TaskCardParts";
import { dueInfo, shortDateTime } from "../lib/taskDates";
import MedalIcon from "./MedalIcon";
import ErrorMessage from "./ErrorMessage";
import InstructorCard from "./InstructorCard";
import { GLOBAL_ROLE_ID } from "../lib/firebaseService";
import TaskThreadButton from "./TaskThread";

/** Today as "YYYY-MM-DD" in local time (the earliest due date for a new task) */
function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function taskIsOverdue(task: Task): boolean {
    return !task.complete && !!task.dueDate && task.dueDate.toDate() < new Date();
}

function daysUntilDeleteAt(task: Task): number | null {
    if (!task.deleteAt) return null;
    return Math.ceil((task.deleteAt.toDate().getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function applySortTasks<T extends { title: string; createdOn?: { toDate(): Date } }>(tasks: T[], sort: string): T[] {
    return [...tasks].sort((a, b) => {
        if (sort === "title-asc") return a.title.localeCompare(b.title);
        if (sort === "title-desc") return b.title.localeCompare(a.title);
        const aMs = a.createdOn?.toDate().getTime() ?? 0;
        const bMs = b.createdOn?.toDate().getTime() ?? 0;
        return sort === "date-asc" ? aMs - bMs : bMs - aMs;
    });
}

function applySortSubmitted<T extends { title: string; submission?: { toDate(): Date } }>(tasks: T[], sort: string): T[] {
    return [...tasks].sort((a, b) => {
        if (sort === "title-asc") return a.title.localeCompare(b.title);
        if (sort === "title-desc") return b.title.localeCompare(a.title);
        const aMs = a.submission?.toDate().getTime() ?? 0;
        const bMs = b.submission?.toDate().getTime() ?? 0;
        return sort === "date-asc" ? aMs - bMs : bMs - aMs;
    });
}

const MONTH_OPTIONS = Array.from({ length: 13 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    return {
        label: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
        key: `${d.getFullYear()}-${d.getMonth()}`,
    };
});

interface prop {
    role: Role,
    membersWithData: UserData[],
    requested: string[],
}

/**
 * Everything for running a role: join requests, tasks, members, instructors,
 * rewards and settings. Shown as the role page's Instructor tab for the role's
 * instructors, and on the admin role page (/admin/roles/:id) for admins.
 */
export default function RoleAdminPage({ role, membersWithData, requested } : prop) {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    // /admin/roles/:id or /instructor/roles/:id: member pages open under the same tab
    const { pathname } = useLocation();
    // Changes this role's instructors have asked its owner for (a reset, a rename, ...)
    const [roleRequests, setRoleRequests] = useState<StemRequest[]>([]);
    const [busyRequest, setBusyRequest] = useState<string | null>(null);
    // Which messaging switch or request is being saved (Config > Messages)
    const [messagingBusy, setMessagingBusy] = useState<MessagingFeature | null>(null);
    // Clearing the group chat (Config > Messages), and what it removed
    const [clearingChat, setClearingChat] = useState(false);
    const [chatCleared, setChatCleared] = useState("");
    const [instructorProfiles, setInstructorProfiles] = useState<{ uid: string; name: string; photoURL: string }[]>([]);
    // Open invitations to this role, and everyone who could be invited
    const [invites, setInvites] = useState<RoleInvite[]>([]);
    const [activeUsers, setActiveUsers] = useState<{ uid: string; name: string; photoURL: string }[]>([]);
    const [inviteUid, setInviteUid] = useState("");
    const [inviteInstructorUid, setInviteInstructorUid] = useState("");
    const [inviting, setInviting] = useState(false);
    // The instructor whose card is open (Instructors tab)
    const [cardUid, setCardUid] = useState<string | null>(null);
    const [rewardsTitle, setRewardsTitle] = useState(role.rewardsTitle ?? "");
    const [phrase5, setPhrase5] = useState(""); // Rewards title phrase
    // The open tab lives in the URL (?tab=), so coming back from a member's page lands on the same tab
    const [searchParams, setSearchParams] = useSearchParams();
    const page = searchParams.get("tab") ?? "requests";
    const setPage = (tab: string) => setSearchParams(p => {
        const next = new URLSearchParams(p);
        next.set("tab", tab);
        next.delete("section");
        return next;
    }, { replace: true });
    // The Config tab is a list of categories, each with its own page (?section=), like Settings
    const configSection = searchParams.get("section");
    const setConfigSection = (section: string | null) => setSearchParams(p => {
        const next = new URLSearchParams(p);
        if (section) next.set("section", section); else next.delete("section");
        return next;
    }, { replace: true });
    const [userRequested, setUserRequested] = useState<UserData[]>([]);
    const [createTaskFor, setCreateSetTaskFor] = useState<string[]>([]);
    const [assignError, setAssignError] = useState("");
    const [phrase, setPhrase] = useState(""); // Role name change phrase
    const [phrase2, setPhrase2] = useState(""); // Role reset phrase
    const [phrase3, setPhrase3] = useState(""); // Role reward phrase
    const [phrase4, setPhrase4] = useState(""); // Sent task phrase
    const showInGlobal = role.showInGlobalLeaderboard ?? false;
    const [allTasks, setAllTasks] = useState<Task[]>([]);
    const [taskFilter, setTaskFilter] = useState<"all" | "pending" | "done" | "submitted">("all");
    const [taskSearch, setTaskSearch] = useState("");
    // Only this member's tasks ("" for everyone)
    const [taskMember, setTaskMember] = useState("");
    // The Assign Task form's due date ("YYYY-MM-DD", "" for none)
    const [newDue, setNewDue] = useState("");
    const [taskMonthFilter, setTaskMonthFilter] = useState("all");
    const [taskSort, setTaskSort] = useState("date-desc");
    const [allSubmitted, setAllSubmitted] = useState<SubmittedTask[]>([]);
    const [reassignTaskId, setReassignTaskId] = useState<string | null>(null);
    const [reassignTo, setReassignTo] = useState("");
    const tabBar = useSlidingIndicator(page);
    const [editTaskId, setEditTaskId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDesc, setEditDesc] = useState("");
    const [editPts, setEditPts] = useState(0);
    const [editDue, setEditDue] = useState("");

    // Listen for all tasks in this role
    useEffect(() => {
        const q = query(collection(db, "tasks"), where("roleId", "==", role.id));
        const unsub = onSnapshot(q, (snap) => {
            setAllTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
        });
        return () => unsub();
    }, [role.id]);

    // Listen for all submitted tasks in this role (including approved)
    useEffect(() => {
        const q = query(collection(db, "tasksSubmitted"), where("roleId", "==", role.id));
        const unsub = onSnapshot(q, (snap) => {
            setAllSubmitted(snap.docs.map(d => ({ id: d.id, ...d.data() } as SubmittedTask)));
        });
        return () => unsub();
    }, [role.id]);

    // Changes waiting on the role's owner (or an admin) to approve
    useEffect(() => {
        const q = query(collection(db, "requests"), where("roleId", "==", role.id));
        return onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as StemRequest)).filter(r => isRoleChange(r.type));
            list.sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
            setRoleRequests(list);
        }, (err) => console.error("Error loading role requests:", err));
    }, [role.id]);

    // Names and photos for the people who can run this role, and for every instructor that could be added
    const allInstructors = context?.instructors ?? [];
    const instructorsKey = Array.from(new Set([...(role.instructors ?? []), ...allInstructors])).join(",");
    useEffect(() => {
        const uids = instructorsKey ? instructorsKey.split(",") : [];
        let cancelled = false;
        Promise.all(uids.map(uid => getDoc(doc(db, "users", uid)))).then(snaps => {
            if (cancelled) return;
            setInstructorProfiles(snaps.filter(s => s.exists()).map(s => ({
                uid: s.id,
                name: (s.data()!.name as string) ?? "Unknown User",
                photoURL: (s.data()!.photoURL as string) ?? "",
            })));
        });
        return () => { cancelled = true; };
    }, [instructorsKey]);

    useEffect(() => setRewardsTitle(role.rewardsTitle ?? ""), [role.rewardsTitle]);

    useEffect(() => onSnapshot(query(collection(db, "invites"), where("roleId", "==", role.id)), snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as RoleInvite));
        list.sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
        setInvites(list);
    }, err => console.error("Error loading invitations:", err)), [role.id]);

    // Active users (everyone still on the global leaderboard), for the Members tab's invite picker
    const inviteTabOpen = page === "members";
    useEffect(() => {
        if (!inviteTabOpen) return;
        let cancelled = false;
        getDocs(collection(db, "users")).then(snap => {
            if (cancelled) return;
            setActiveUsers(snap.docs
                .filter(d => (Array.isArray(d.data().roles) ? d.data().roles as UserRoleData[] : []).some(r => r.id === GLOBAL_ROLE_ID))
                .map(d => ({ uid: d.id, name: (d.data().name as string) ?? "Unknown User", photoURL: (d.data().photoURL as string) ?? "" }))
                .sort((a, b) => a.name.localeCompare(b.name)));
        }).catch(err => console.error("Error loading users:", err));
        return () => { cancelled = true; };
    }, [inviteTabOpen]);

    const me = context?.user ?? null;
    const myName = context?.userData?.name ?? "";
    const isAdmin = !!me && (context?.admins ?? []).includes(me.uid);
    // Admins and the role's owner change things directly; other instructors send a request
    const canChange = canChangeRole(role, me?.uid, context?.admins ?? []);
    const ownerUid = roleOwner(role);
    const ownerName = instructorProfiles.find(p => p.uid === ownerUid)?.name;
    // Who approves the other instructors' requests: the owner, or admins when there's none
    const approverName = ownerUid ? (ownerName ? `${ownerName} (the role's owner)` : "The role's owner") : "An admin";
    const waitingOn = ownerUid ? (ownerName ?? "the role's owner") : "an admin";

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
            setAssignError("Please select at least one member.");
            return;
        }
        setAssignError("");

        const dueDateStr = formData.get("dueDate") as string;
        let dueDate: Timestamp | null = null;
        let deleteAt: Timestamp | null = null;
        if (dueDateStr) {
            const [y, m, d] = dueDateStr.split("-").map(Number);
            const dueDateObj = new Date(y, m - 1, d, 23, 59, 59);
            dueDate = Timestamp.fromDate(dueDateObj);
            deleteAt = Timestamp.fromDate(new Date(dueDateObj.getTime() + 7 * 24 * 60 * 60 * 1000));
        }

        try {

            for (const uid of createTaskFor) {
                const selectedUser = membersWithData.find((m) => m.uid === uid);
                if (!selectedUser) continue;

                await addDoc(collection(db, "tasks"), {
                    assignedTo: selectedUser.uid,
                    ...(me ? { assignedBy: me.uid } : {}),
                    assignedName: selectedUser.name,
                    description: desc,
                    points: pts,
                    roleId: role.id,
                    createdOn: Timestamp.now(),
                    complete: false,
                    title,
                    ...(dueDate ? { dueDate, deleteAt } : {}),
                });
            }

            // Reset
            setPhrase4("Task(s) created successfully");
            form.reset();
            setNewDue("");
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

        const form = e.currentTarget;
        if (newName.trim().length < 1) return;
        try {
            if (canChange) {
                await roleService.renameRole(role.id, newName);
                setPhrase("Role name updated successfully");
            } else {
                await roleService.requestRoleChange("renameRole", me!.uid, myName, role, { newName: newName.trim() });
                setPhrase(`Rename requested. ${approverName} will review it.`);
            }
            form.reset();
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
            // One write, so the notification function sees them join rather than a decline
            await updateDoc(doc(db, "roles", role.id), {
                pendingRequests: arrayRemove(id),
                members: arrayUnion(thisUser.uid),
            })
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
            const oneYear = Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
            await updateDoc(doc(db, "tasks", submitted.id), {
                complete: true,
                deleteAt: oneYear,
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

    const declineTask = async (submitted: SubmittedTask) => {
        if (!submitted) return;
        try {
            const taskSnap = await getDoc(doc(db, "tasks", submitted.id));
            const currentCount: number = (taskSnap.data()?.declineCount ?? 0);
            const newCount = currentCount + 1;

            if (newCount >= 3) {
                const oneYear = Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
                await updateDoc(doc(db, "tasks", submitted.id), {
                    complete: true,
                    declineCount: newCount,
                    deleteAt: oneYear,
                    extensionRequested: false,
                });
                await deleteDoc(doc(db, "tasksSubmitted", submitted.id));
            } else {
                await updateDoc(doc(db, "tasks", submitted.id), { declineCount: newCount });
                await deleteDoc(doc(db, "tasksSubmitted", submitted.id));
            }
        } catch (err) {
            console.log(err);
        }
    }

    const acceptExtension = async (taskId: string, currentPoints: number) => {
        const newDueDate = Timestamp.fromDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
        const newDeleteAt = Timestamp.fromDate(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000));
        await updateDoc(doc(db, "tasks", taskId), {
            dueDate: newDueDate,
            deleteAt: newDeleteAt,
            extensionRequested: false,
            points: Math.round(currentPoints * 0.6),
        });
    };

    const declineExtension = async (taskId: string) => {
        await updateDoc(doc(db, "tasks", taskId), {
            extensionDeclined: true,
            extensionRequested: false,
        });
    };

    // Admins and the role's owner make changes straight away; its other instructors ask the owner
    const resetRole = async () => {
        const saveName = await promptDialog(
            canChange
                ? "Every member's points and tasks completed in this role are saved under this name on the Saved Data tab, then cleared along with all tasks and prizes."
                : `Name this save. ${approverName} will review the reset; once approved, every member's points and tasks completed are saved under this name on the Saved Data tab, then cleared along with all tasks and prizes.`,
            {
                title: canChange ? "Reset Role" : "Request Reset",
                confirmLabel: canChange ? "Reset" : "Send Request",
                danger: canChange,
                input: { placeholder: `e.g. ${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}` },
            }
        );
        if (saveName === null) return;
        if (!saveName.trim()) {
            await alertDialog("Please enter a name for the saved data.", "Name needed");
            return;
        }
        try {
            if (canChange) {
                await roleService.resetRole(role.id, saveName.trim());
                setPhrase2("Role reset. Its data is on the Saved Data tab.");
            } else {
                await roleService.requestRoleReset(me!.uid, myName, role, saveName);
                setPhrase2(`Reset requested. ${approverName} will review it.`);
            }
        } catch (err) {
            console.error("Error resetting role:", err);
            await alertDialog("Couldn't reset the role. Please try again.", "Reset failed");
        }
    };

    const withdrawRequest = async (req: StemRequest) => {
        await roleService.deleteRequest(req.id);
    };

    const approveRoleRequest = async (req: StemRequest) => {
        if (req.type === "resetRole" || req.type === "kickMember") {
            const ok = await confirmDialog(
                req.type === "resetRole"
                    ? `Reset ${role.name}? Its leaderboard is saved as "${req.saveName}", then all tasks, prizes and members' points in it are cleared.`
                    : `Remove ${req.targetName ?? "this member"} from ${role.name}? Their tasks in this role are deleted.`,
                { title: req.type === "resetRole" ? "Approve Reset" : "Approve Kick", confirmLabel: req.type === "resetRole" ? "Reset" : "Kick", danger: true }
            );
            if (!ok) return;
        }
        setBusyRequest(req.id);
        try {
            await roleService.approveRequest(req);
        } catch (err) {
            console.error("Error approving request:", err);
            await alertDialog("Couldn't approve the request. Please try again.", "Something went wrong");
        } finally {
            setBusyRequest(null);
        }
    };

    const declineRoleRequest = async (req: StemRequest) => {
        setBusyRequest(req.id);
        try {
            await roleService.declineRequest(req.id);
        } catch (err) {
            console.error("Error declining request:", err);
        } finally {
            setBusyRequest(null);
        }
    };

    const deleteRole = async () => {
        const confirmDelete = await confirmDialog("Are you sure you want to delete this role? This cannot be undone.", { title: "Delete Role", confirmLabel: "Delete", danger: true });
        if (!confirmDelete) return;
        try {
            await roleService.deleteRole(role.id);
            navigate("/admin", { replace: true });
        } catch (err) {
            console.error(err);
            await alertDialog("Couldn't delete the role. Please try again.", "Delete failed");
        }
    };

    const saveRewardsTitle = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        try {
            if (canChange) {
                await roleService.setRewardsTitle(role.id, rewardsTitle);
                setPhrase5(rewardsTitle.trim() ? "Title updated" : "Title reset to the current month");
            } else {
                await roleService.requestRoleChange("rewardsTitle", me!.uid, myName, role, { title: rewardsTitle.trim() });
                setPhrase5(`Title change requested. ${approverName} will review it.`);
                setRewardsTitle(role.rewardsTitle ?? "");
            }
        } catch (err) {
            console.error(err);
        }
    };

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

    const roleInstructors = role.instructors ?? [];
    const roleMembers = role.members ?? [];
    const invitedUids = new Set(invites.map(i => i.uid));
    const memberInvites = invites.filter(i => i.as === "member");
    const instructorInvites = invites.filter(i => i.as === "instructor");
    // Anyone active who isn't in the role yet (admins are in every role already)
    const invitableMembers = activeUsers.filter(p => !roleMembers.includes(p.uid) && !admins.includes(p.uid) && !invitedUids.has(p.uid));
    // Any Instructor who doesn't run this role yet, whether or not they're in it
    const invitableInstructors = instructorProfiles.filter(p => allInstructors.includes(p.uid) && !roleInstructors.includes(p.uid) && !admins.includes(p.uid) && !invitedUids.has(p.uid));

    const sendInvite = async (uid: string, as: RoleInvite["as"]) => {
        const person = (as === "instructor" ? instructorProfiles : activeUsers).find(p => p.uid === uid);
        if (!person) return;
        setInviting(true);
        try {
            await roleService.sendInvite(role, person, as, { uid: user.uid, name: userData.name ?? "" });
            if (as === "instructor") setInviteInstructorUid(""); else setInviteUid("");
        } catch (err) {
            console.error("Error sending invitation:", err);
            await alertDialog("Couldn't send the invitation. Please try again.", "Something went wrong");
        } finally {
            setInviting(false);
        }
    };

    const cancelInvite = async (invite: RoleInvite) => {
        const ok = await confirmDialog(`Withdraw ${invite.userName || "their"} invitation to ${role.name}?`, { title: "Cancel Invitation?", confirmLabel: "Withdraw", danger: true });
        if (!ok) return;
        await roleService.cancelInvite(role.id, invite.uid).catch(err => console.error("Error cancelling invitation:", err));
    };

    const inviteList = (list: RoleInvite[]) => list.length > 0 && (
        <div className="flex flex-col gap-2">
            <p className="text-xs text-gray-400 uppercase tracking-widest">Waiting for a reply</p>
            {list.map(inv => {
                const photo = activeUsers.find(p => p.uid === inv.uid)?.photoURL ?? instructorProfiles.find(p => p.uid === inv.uid)?.photoURL;
                return (
                    <div key={inv.id} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl">
                        <div className="flex items-center gap-2 min-w-0">
                            <ProfileImg src={photo} alt={inv.userName} size="xxs" />
                            <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{inv.userName || "Someone"}</p>
                                <p className="text-xs text-gray-400 truncate">Invited by {inv.invitedBy === user.uid ? "you" : inv.invitedByName || "an instructor"}</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => cancelInvite(inv)}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors hover:cursor-pointer shrink-0"
                        >
                            Withdraw
                        </button>
                    </div>
                );
            })}
        </div>
    );

    // Requests the signed-in person can approve, and the ones they sent and can withdraw
    const toReview = canChange ? roleRequests.filter(r => r.uid !== user.uid) : [];
    const mine = roleRequests.filter(r => r.uid === user.uid);
    const pendingReset = mine.find(r => r.type === "resetRole") ?? (canChange ? null : roleRequests.find(r => r.type === "resetRole")) ?? null;

    const toggleGlobalLeaderboard = async () => {
        await updateDoc(doc(db, "roles", role.id), { showInGlobalLeaderboard: !showInGlobal });
    };

    // Owner and admin only: hides the role from the Roles page, so people only join by invitation
    const inviteOnly = role.inviteOnly ?? false;
    const toggleInviteOnly = async () => {
        try {
            await updateDoc(doc(db, "roles", role.id), { inviteOnly: !inviteOnly });
        } catch (err) {
            console.error("Error changing who can find this role:", err);
            await alertDialog("Couldn't change that. Please try again.", "Something went wrong");
        }
    };

    // Group chat and task questions: the owner and admins switch them; other instructors ask
    const messaging = { chat: role.chatEnabled === true, taskThreads: role.taskThreadsEnabled === true };
    const changeMessaging = async (feature: MessagingFeature) => {
        const enabled = !messaging[feature];
        setMessagingBusy(feature);
        try {
            if (canChange) await roleService.setRoleMessaging(role.id, feature, enabled);
            else await roleService.requestRoleChange("roleMessaging", me!.uid, myName, role, { feature, enabled });
        } catch (err) {
            console.error("Error changing messaging:", err);
            await alertDialog(canChange ? "Couldn't change that. Please try again." : "Couldn't send the request. Please try again.", "Something went wrong");
        } finally {
            setMessagingBusy(null);
        }
    };

    // Owner and admin only: wipes the group chat for everyone
    const clearChat = async () => {
        const ok = await confirmDialog(
            `Delete every message in ${role.name}'s group chat? This removes them for everyone in the role and can't be undone.`,
            { title: "Clear Group Chat", confirmLabel: "Clear Chat", danger: true },
        );
        if (!ok) return;
        setClearingChat(true);
        try {
            const n = await roleService.clearRoleChat(role.id);
            setChatCleared(n === 0 ? "The group chat was already empty." : `Cleared ${n} message${n === 1 ? "" : "s"}.`);
            setTimeout(() => setChatCleared(""), 4000);
        } catch (err) {
            console.error("Error clearing the group chat:", err);
            await alertDialog("Couldn't clear the group chat. Please try again.", "Something went wrong");
        } finally {
            setClearingChat(false);
        }
    };

    const assignee = (uid: string, name: string, note?: string) => (
        <div className="flex items-center gap-2 min-w-0">
            <ProfileImg src={membersWithData.find(m => m.uid === uid)?.photoURL} alt={name} size="xxs" />
            <span className="text-sm font-medium truncate">{name}</span>
            {note && <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">{note}</span>}
        </div>
    );

    // Admins and the role's instructors aren't given tasks or ranked
    const nonAdminMembers = membersWithData.filter((m) => !isRoleStaff(role, m.uid, admins));

    // Remove a task entirely (completed or not). Points already awarded are left as-is.
    const removeTask = async (task: Task) => {
        const ok = await confirmDialog(
            `Remove "${task.title}" assigned to ${task.assignedName}?${task.complete ? " Points already awarded stay with the member." : ""}`,
            { title: "Remove Task", confirmLabel: "Remove", danger: true }
        );
        if (!ok) return;
        try {
            await Promise.all([
                deleteDoc(doc(db, "tasks", task.id)),
                deleteDoc(doc(db, "tasksSubmitted", task.id)),
            ]);
        } catch (err) {
            console.error("Error removing task:", err);
        }
    };

    const startEditTask = (task: Task) => {
        const d = task.dueDate?.toDate();
        setReassignTaskId(null);
        setEditTaskId(task.id);
        setEditTitle(task.title);
        setEditDesc(task.description ?? "");
        setEditPts(task.points);
        setEditDue(d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");
    };

    // Save edits to an unfinished task (and any pending submission so approval awards the new points)
    const saveTaskEdit = async (task: Task) => {
        const title = editTitle.trim();
        if (!title || editPts < 0 || task.complete || allSubmitted.some(s => s.id === task.id && !s.complete)) return;
        const fields: { title: string; description: string; points: number } = { title, description: editDesc.trim(), points: editPts };
        try {
            if (editDue) {
                const [y, m, d] = editDue.split("-").map(Number);
                const due = new Date(y, m - 1, d, 23, 59, 59);
                await updateDoc(doc(db, "tasks", task.id), {
                    ...fields,
                    dueDate: Timestamp.fromDate(due),
                    deleteAt: Timestamp.fromDate(new Date(due.getTime() + 7 * 24 * 60 * 60 * 1000)),
                });
            } else {
                await updateDoc(doc(db, "tasks", task.id), { ...fields, dueDate: deleteField(), deleteAt: deleteField() });
            }
            if (allSubmitted.some(s => s.id === task.id && !s.complete)) {
                await updateDoc(doc(db, "tasksSubmitted", task.id), fields);
            }
            setEditTaskId(null);
        } catch (err) {
            console.error("Error editing task:", err);
        }
    };

    // Hand an unfinished, not-yet-submitted task to another member, clearing progress state
    const reassignTask = async (task: Task) => {
        const target = membersWithData.find(m => m.uid === reassignTo);
        if (!target || target.uid === task.assignedTo || task.complete) return;
        if (allSubmitted.some(s => s.id === task.id && !s.complete)) return;
        try {
            await updateDoc(doc(db, "tasks", task.id), {
                assignedTo: target.uid,
                assignedName: target.name,
                status: deleteField(),
                extensionRequested: deleteField(),
                extensionDeclined: deleteField(),
            });
            setReassignTaskId(null);
            setReassignTo("");
        } catch (err) {
            console.error("Error reassigning task:", err);
        }
    };

    const adminTabs = [
        { key: "requests", label: "Requests", badge: requested.length + toReview.length },
        { key: "creation", label: "Assign Task", badge: 0 },
        { key: "tasks", label: "Tasks", badge: allSubmitted.filter(t => !t.complete).length },
        { key: "members", label: "Members", badge: 0 },
        { key: "instructors", label: "Instructors", badge: 0 },
        { key: "rewards", label: "Rewards", badge: 0 },
        { key: "config", label: "Config", badge: 0 },
    ];

    return (
        <motion.div className="w-full flex flex-col gap-4">

            {/* Admin sub-tab bar */}
            <div ref={tabBar.ref} className="relative flex flex-wrap items-center gap-1 border-b border-gray-200">
                <span aria-hidden className={`${tabBar.indicatorClass} bg-blue-600`} style={tabBar.indicatorStyle} />
                {adminTabs.map((tab) => (
                    <div key={tab.key} data-active={page === tab.key ? "true" : "false"} className="relative shrink-0">
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
                    </div>
                ))}
            </div>

            {/* Requests */}
            {page.match("requests") && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                    {/* Changes the role's other instructors asked for, for the owner (or an admin) to approve */}
                    {(toReview.length > 0 || mine.length > 0) && (
                        <div className="flex flex-col gap-3">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Instructor requests</h2>
                            {[...toReview, ...mine].map(req => {
                                const isMine = req.uid === user.uid;
                                return (
                                    <motion.div
                                        key={req.id}
                                        className="flex flex-col gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3"
                                        initial={{ x: -10, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <p className="text-sm font-medium">{describeRoleChange(req, isMine)}</p>
                                            {req.type === "roleIcon" && (
                                                <span className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
                                                    <RoleIcon role={role} size="sm" solid /> → <RoleIcon role={{ icon: req.icon, iconColor: req.iconColor }} size="sm" solid />
                                                </span>
                                            )}
                                            <span className="text-xs text-gray-400 shrink-0">
                                                {req.createdAt?.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            {isMine ? (
                                                <>
                                                    <span className="text-xs text-amber-600 self-center flex-1">Waiting for {waitingOn}</span>
                                                    <Button onClick={() => withdrawRequest(req)} size="xsm" color="cancel">Withdraw</Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Button onClick={() => approveRoleRequest(req)} size="xsm" color="green" disabled={busyRequest === req.id}>
                                                        {busyRequest === req.id ? "Working..." : "Approve"}
                                                    </Button>
                                                    <Button onClick={() => declineRoleRequest(req)} size="xsm" color="red" disabled={busyRequest === req.id}>Decline</Button>
                                                </>
                                            )}
                                        </div>
                                    </motion.div>
                                );
                            })}
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mt-2">Join requests</h2>
                        </div>
                    )}
                    {userRequested.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">No pending join requests.</p>
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
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Assign to</h2>
                            <LinkButton onClick={() => {
                                const allUids = nonAdminMembers.map(m => m.uid as string);
                                setCreateSetTaskFor(allUids);
                            }}>Select all</LinkButton>
                        </div>
                        <PersonPicker
                            label="Member to assign"
                            placeholder="Select a member"
                            value=""
                            resetAfterPick
                            chosen={createTaskFor}
                            emptyText="No members in this role yet."
                            people={nonAdminMembers.map(m => ({ uid: m.uid, name: m.name, photoURL: m.photoURL, hint: `${m.points ?? 0} pts` }))}
                            onChange={uid => {
                                // Picking someone already selected takes them off again
                                setCreateSetTaskFor(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
                            }}
                        />

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
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-400">Due Date (optional)</label>
                            <DatePicker name="dueDate" value={newDue} onChange={setNewDue} min={todayKey()} placeholder="No due date" />
                        </div>
                        <Button type="submit" size="sm" color="green">Assign Task</Button>
                        {assignError && <ErrorMessage>{assignError}</ErrorMessage>}
                        <Alert value={phrase4} setValue={setPhrase4} />
                    </form>
                </motion.div>
            )}

            {/* All Tasks */}
            {page.match("tasks") && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                    {/* Search + Filter */}
                    <div className="flex flex-col gap-2">
                        {/* Whose tasks: a member filter, like the invite picker */}
                        <PersonPicker
                            label="Member"
                            placeholder="All members"
                            allLabel="All members"
                            value={taskMember}
                            onChange={setTaskMember}
                            emptyText="No members in this role yet."
                            people={nonAdminMembers.map(m => ({ uid: m.uid, name: m.name, photoURL: m.photoURL }))}
                        />
                        {/* Task titles: a plain field with no fill, like the picker's search */}
                        <label className="flex items-center gap-2.5 rounded-xl border border-gray-200 px-3 py-2 transition-colors hover:border-gray-400 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10">
                            <FontAwesomeIcon icon={faMagnifyingGlass} className="text-xs text-gray-400" />
                            <input
                                type="text"
                                value={taskSearch}
                                onChange={e => setTaskSearch(e.target.value)}
                                placeholder="Search task titles..."
                                aria-label="Search task titles"
                                className="w-full min-w-0 bg-transparent text-sm focus:outline-none"
                            />
                            {taskSearch && (
                                <button
                                    type="button"
                                    onClick={() => setTaskSearch("")}
                                    aria-label="Clear search"
                                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 hover:cursor-pointer"
                                >
                                    <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                                </button>
                            )}
                        </label>
                        {/* Month and sort side by side (stacked on narrow phones) */}
                        <div className="flex flex-col min-[420px]:flex-row gap-2">
                            <div className="flex-1 min-w-0">
                                <Dropdown
                                    label="Month"
                                    fullWidth
                                    tone="gray"
                                    value={taskMonthFilter}
                                    onChange={setTaskMonthFilter}
                                    options={[
                                        { value: "all", label: "All months", icon: faCalendarDays },
                                        ...MONTH_OPTIONS.map(opt => ({ value: opt.key, label: opt.label, icon: faCalendar })),
                                    ]}
                                />
                            </div>
                            <div className="min-[420px]:w-44 shrink-0">
                                <Dropdown
                                    label="Sort"
                                    fullWidth
                                    tone="gray"
                                    value={taskSort}
                                    onChange={setTaskSort}
                                    options={[
                                        { value: "date-desc", label: "Newest first", icon: faArrowDownWideShort },
                                        { value: "date-asc", label: "Oldest first", icon: faArrowUpWideShort },
                                        { value: "title-asc", label: "Title A–Z", icon: faArrowDownAZ },
                                        { value: "title-desc", label: "Title Z–A", icon: faArrowDownZA },
                                    ]}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {(["all", "submitted", "pending", "done"] as const).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setTaskFilter(f)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors hover:cursor-pointer ${
                                        taskFilter === f
                                            ? "bg-blue-600 text-white"
                                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                    }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    {taskFilter === "submitted" ? (() => {
                        const filtered = allSubmitted.filter(t => {
                            if (!t.complete === false) return false;
                            if (taskMonthFilter !== "all") {
                                const [y, m] = taskMonthFilter.split("-").map(Number);
                                const d = t.submission?.toDate();
                                if (!d || d.getFullYear() !== y || d.getMonth() !== m) return false;
                            }
                            const q = taskSearch.trim().toLowerCase();
                            return !t.complete && (!taskMember || t.assignedTo === taskMember) && (!q || t.title.toLowerCase().includes(q));
                        });
                        const sorted = applySortSubmitted(filtered, taskSort);
                        if (sorted.length === 0) return (
                            <p className="text-gray-400 text-sm text-center py-8">No pending submissions.</p>
                        );
                        return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {sorted.map((submitted) => (
                                    <motion.div key={submitted.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                                        <TaskCard tone="amber">
                                            <TaskHeader title={submitted.title} points={submitted.points} />
                                            <TaskDescription text={submitted.description} />
                                            {assignee(submitted.assignedTo, submitted.assignedName)}
                                            <ChipRow>
                                                <Chip tone="amber" icon={faInbox}>Submitted {shortDateTime(submitted.submission)}</Chip>
                                            </ChipRow>
                                            <div className="flex gap-2 mt-auto pt-1">
                                                <Button onClick={() => acceptTask(submitted)} size="full" color="green">Approve</Button>
                                                <Button onClick={() => declineTask(submitted)} size="full" color="red">Decline</Button>
                                            </div>
                                        </TaskCard>
                                    </motion.div>
                                ))}
                            </div>
                        );
                    })() : (() => {
                        const filtered = allTasks.filter(t => {
                            const hasSubmission = allSubmitted.some(s => s.id === t.id && !s.complete);
                            const matchesFilter =
                                taskFilter === "all" ? true :
                                taskFilter === "done" ? t.complete :
                                taskFilter === "pending" ? !t.complete && !hasSubmission :
                                !t.complete;
                            if (!matchesFilter) return false;
                            if (taskMonthFilter !== "all") {
                                const [y, m] = taskMonthFilter.split("-").map(Number);
                                const d = t.createdOn?.toDate();
                                if (!d || d.getFullYear() !== y || d.getMonth() !== m) return false;
                            }
                            const q = taskSearch.trim().toLowerCase();
                            return (!taskMember || t.assignedTo === taskMember) && (!q || t.title.toLowerCase().includes(q));
                        });
                        const sorted = applySortTasks(filtered, taskSort);
                        if (sorted.length === 0) return (
                            <p className="text-gray-400 text-sm text-center py-8">No tasks to show.</p>
                        );
                        return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {sorted.map((task) => {
                                    const submission = allSubmitted.find(s => s.id === task.id && !s.complete);
                                    const overdue = taskIsOverdue(task);
                                    const daysLeft = daysUntilDeleteAt(task);
                                    const declines = task.declineCount ?? 0;
                                    const tone: TaskTone = task.complete ? "green" : submission ? "amber" : overdue ? "red"
                                        : task.status === "Almost Done" ? "orange" : task.status === "In Progress" ? "blue" : "gray";
                                    const due = task.dueDate && !task.complete && !submission ? dueInfo(task.dueDate) : null;
                                    return (
                                    <motion.div key={task.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                                    <TaskCard tone={tone} faded={task.complete}>
                                        <TaskHeader title={task.title} points={task.points} done={task.complete} />
                                        <TaskDescription text={task.description} />
                                        {assignee(task.assignedTo, task.assignedName, task.createdOn ? `Given ${shortDateTime(task.createdOn)}` : undefined)}
                                        <ChipRow>
                                            {task.complete ? <Chip tone="green" icon={faCircleCheck}>Done</Chip>
                                                : submission ? <Chip tone="amber" icon={faInbox}>Submitted {shortDateTime(submission.submission)}</Chip>
                                                : task.status === "In Progress" ? <Chip tone="blue" icon={faPersonRunning}>In Progress</Chip>
                                                : task.status === "Almost Done" ? <Chip tone="orange" icon={faFlagCheckered}>Almost Done</Chip>
                                                : <Chip icon={faCircleDot}>Not started</Chip>}
                                            {due && <Chip tone={due.tone} icon={faCalendarDays}>{due.label}</Chip>}
                                            {overdue && !submission && (
                                                <Chip tone="red" icon={faTriangleExclamation}>
                                                    {daysLeft === null ? "Overdue" : daysLeft > 0 ? `Deletes in ${daysLeft}d` : "Deleting soon"}
                                                </Chip>
                                            )}
                                            {task.extensionRequested && <Chip tone="amber" icon={faClock}>Extension requested</Chip>}
                                            {task.extensionDeclined && <Chip>Extension declined</Chip>}
                                            {declines > 0 && <Chip tone="red" icon={faRotateLeft}>Sent back {declines}×{declines === 3 ? " · Closed" : ""}</Chip>}
                                        </ChipRow>
                                        {task.extensionRequested && (
                                            <div className="flex gap-2">
                                                <Button onClick={() => acceptExtension(task.id, task.points)} size="full" color="green">Accept Extension</Button>
                                                <Button onClick={() => declineExtension(task.id)} size="full" color="red">Decline Extension</Button>
                                            </div>
                                        )}
                                        {submission && (
                                            <div className="flex gap-2 mt-auto">
                                                <Button onClick={() => acceptTask(submission)} size="full" color="green">Approve</Button>
                                                <Button onClick={() => declineTask(submission)} size="full" color="red">Decline</Button>
                                            </div>
                                        )}
                                        {role.taskThreadsEnabled && (
                                            <div className="-mx-2 -mb-2 mt-auto">
                                                <TaskThreadButton task={task} enabled runsRole />
                                            </div>
                                        )}
                                        {editTaskId === task.id ? (
                                            <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                                                <input
                                                    value={editTitle}
                                                    onChange={e => setEditTitle(e.target.value)}
                                                    placeholder="Title"
                                                    className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400"
                                                />
                                                <textarea
                                                    value={editDesc}
                                                    onChange={e => setEditDesc(e.target.value)}
                                                    placeholder="Description (optional)"
                                                    rows={2}
                                                    className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 resize-none"
                                                />
                                                <div className="flex gap-2">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={editPts}
                                                        onChange={e => setEditPts(Math.max(0, +e.target.value))}
                                                        className="w-1/3 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <DatePicker value={editDue} onChange={setEditDue} align="right" placeholder="No due date" />
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button onClick={() => saveTaskEdit(task)} size="full" color="blue" disabled={!editTitle.trim()}>Save</Button>
                                                    <Button onClick={() => setEditTaskId(null)} size="full" color="cancel">Cancel</Button>
                                                </div>
                                            </div>
                                        ) : reassignTaskId === task.id ? (
                                            <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                                                <PersonPicker
                                                    label="Reassign to"
                                                    placeholder="Reassign to…"
                                                    value={reassignTo}
                                                    onChange={setReassignTo}
                                                    emptyText="No one else in this role."
                                                    people={nonAdminMembers.filter(m => m.uid !== task.assignedTo).map(m => ({ uid: m.uid, name: m.name, photoURL: m.photoURL }))}
                                                />
                                                <div className="flex gap-2">
                                                    <Button onClick={() => reassignTask(task)} size="full" color="blue" disabled={!reassignTo}>Reassign</Button>
                                                    <Button onClick={() => { setReassignTaskId(null); setReassignTo(""); }} size="full" color="cancel">Cancel</Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex gap-1 pt-2 mt-auto border-t border-gray-100">
                                                {!task.complete && !submission && (
                                                    <CardAction onClick={() => startEditTask(task)} icon={faPen}>Edit</CardAction>
                                                )}
                                                {!task.complete && !submission && (
                                                    <CardAction onClick={() => { setEditTaskId(null); setReassignTaskId(task.id); setReassignTo(""); }} icon={faArrowRightArrowLeft}>Reassign</CardAction>
                                                )}
                                                <CardAction onClick={() => removeTask(task)} icon={faTrashCan} danger>Remove</CardAction>
                                            </div>
                                        )}
                                    </TaskCard>
                                    </motion.div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </motion.div>
            )}

            {/* Members */}
            {page.match("members") && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
                    <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3 mb-2">
                        <div>
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Invite someone</h2>
                            <p className="text-sm text-gray-500 mt-1">They'll find the invitation on their Roles page and can accept or decline it.</p>
                        </div>
                        <PersonPicker
                            label="Person to invite"
                            placeholder="Select someone to invite"
                            value={inviteUid}
                            onChange={setInviteUid}
                            emptyText="Everyone is already in this role or invited."
                            people={invitableMembers}
                        />
                        <Button onClick={() => sendInvite(inviteUid, "member")} size="sm" disabled={!inviteUid || inviting}>
                            {inviting ? "Sending..." : "Send Invite"}
                        </Button>
                        {inviteList(memberInvites)}
                    </div>
                    {nonAdminMembers.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">No members in this role.</p>
                    ) : nonAdminMembers.map((m) => (
                        <motion.button
                            key={m.uid}
                            type="button"
                            // Each member has their own page: stats, tasks in this role, edit and kick
                            onClick={() => navigate(`${pathname.replace(/\/+$/, "")}/members/${m.uid}`)}
                            className="group flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl border border-gray-200 bg-white transition-all duration-200 hover:border-gray-400 hover:shadow-sm hover:cursor-pointer"
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                        >
                            <ProfileImg src={m.photoURL} alt={m.name} size="xs" />
                            <div className="min-w-0 flex-1">
                                <p className="font-medium truncate">{m.name}</p>
                                <p className="text-xs text-gray-400">{m.points ?? 0} pts · {m.taskCompleted ?? 0} tasks</p>
                            </div>
                            <FontAwesomeIcon icon={faChevronRight} className="shrink-0 text-gray-300 transition-all duration-200 group-hover:text-gray-600 group-hover:translate-x-1" />
                        </motion.button>
                    ))}
                </motion.div>
            )}

            {/* Instructors */}
            {page === "instructors" && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
                    <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Running this role</h2>
                        <p className="text-sm text-gray-500">Instructors here can give, edit and review tasks, accept members and set prizes. The role's owner can also rename or reset it, edit members' stats, kick members and change the rewards title; other instructors send the owner a request for those. Admins can always run every role.</p>
                        {isAdmin ? (
                            <p className="text-xs text-gray-400">{ownerUid ? "Open an instructor to make them the owner or take them off this role." : "This role has no owner, so its instructors' change requests come to admins. Open an instructor to make them the owner."}</p>
                        ) : (
                            <p className="text-xs text-gray-400">{ownerUid === user.uid ? "Open an instructor to hand the role on to them or take them off it." : "Only the role's owner, or an admin, can remove other instructors. To step down yourself, ask an admin."} Open anyone to see their stats.</p>
                        )}
                        {roleInstructors.length === 0 ? (
                            <p className="text-sm text-gray-400">No instructors yet.</p>
                        ) : roleInstructors.map(uid => {
                            const person = instructorProfiles.find(p => p.uid === uid);
                            const lostAccess = !allInstructors.includes(uid);
                            return (
                                <button
                                    key={uid}
                                    type="button"
                                    onClick={() => setCardUid(uid)}
                                    className="group flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-left transition-colors hover:border-gray-400 hover:cursor-pointer"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <ProfileImg src={person?.photoURL} alt={person?.name} size="xxs" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">{person?.name ?? "Loading..."}{uid === user.uid ? " (you)" : ""}</p>
                                            <p className="text-xs text-gray-400">
                                                {ownerUid === uid ? <span className="font-semibold text-purple-600">Owner</span> : "Instructor"}
                                                {lostAccess ? " · No longer an Instructor" : ""}
                                            </p>
                                        </div>
                                    </div>
                                    <FontAwesomeIcon icon={faChevronRight} className="shrink-0 text-gray-300 transition-all duration-200 group-hover:text-gray-600 group-hover:translate-x-1" />
                                </button>
                            );
                        })}
                    </div>
                    <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                        <div>
                            <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Invite an instructor</h2>
                            <p className="text-sm text-gray-500 mt-1">Any Instructor can be invited to help run this role, whether or not they're in it. They join once they accept.</p>
                        </div>
                        <PersonPicker
                            label="Instructor to invite"
                            placeholder="Select an instructor"
                            value={inviteInstructorUid}
                            onChange={setInviteInstructorUid}
                            emptyText="Every Instructor already runs this role or has been invited."
                            people={invitableInstructors}
                        />
                        <Button onClick={() => sendInvite(inviteInstructorUid, "instructor")} size="sm" disabled={!inviteInstructorUid || inviting}>
                            {inviting ? "Sending..." : "Send Invite"}
                        </Button>
                        {inviteList(instructorInvites)}
                    </div>
                    <InstructorCard uid={cardUid} onClose={() => setCardUid(null)} role={role} />
                </motion.div>
            )}

            {/* Rewards */}
            {page === "rewards" && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
                    <form onSubmit={saveRewardsTitle} className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Rewards title</h2>
                        <p className="text-sm text-gray-500">
                            The heading on the Rewards tab. Leave it empty to show the current month.
                            {!canChange && ` ${approverName} has to approve a new title.`}
                        </p>
                        <input
                            value={rewardsTitle}
                            onChange={e => setRewardsTitle(e.target.value)}
                            maxLength={48}
                            placeholder={`${new Date().toLocaleString("en-US", { month: "long" })} Rewards`}
                            className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
                        />
                        <Button type="submit" size="sm">{canChange ? "Save Title" : "Request Title Change"}</Button>
                        <Alert value={phrase5} setValue={setPhrase5} />
                    </form>
                    <form onSubmit={setReward} className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Set rewards</h2>
                        {[
                            { name: "first", label: "1st Place" },
                            { name: "second", label: "2nd Place" },
                            { name: "third", label: "3rd Place" },
                        ].map((r, idx) => (
                            <div key={r.name} className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium text-gray-600">
                                    <MedalIcon rank={idx} className="mr-1.5" />
                                    {r.label}
                                </label>
                                <Input type="text" name={r.name} placeholder="Reward description" required={true} autocomplete="false" size="full" />
                            </div>
                        ))}
                        <Button type="submit" size="sm">Save Rewards</Button>
                        <Alert value={phrase3} setValue={setPhrase3} />
                    </form>
                </motion.div>
            )}

            {/* Config */}
            {page.match("config") && (() => {
                const sections = [
                    { key: "general", label: "General", hint: `Name and global leaderboard (${showInGlobal ? "on" : "off"})`, icon: faPen },
                    { key: "icon", label: "Icon", hint: "The icon and color on the Roles page and this role's page", icon: faPalette },
                    { key: "messages", label: "Messages", hint: `Group chat ${messaging.chat ? "on" : "off"} · Task questions ${messaging.taskThreads ? "on" : "off"}`, icon: faComments },
                    ...(canChange ? [{ key: "privacy", label: "Privacy", hint: inviteOnly ? "Invite only: hidden from the Roles page" : "Public: anyone can find it and ask to join", icon: faLock }] : []),
                    { key: "reset", label: "Reset Role", hint: pendingReset ? `Reset waiting for ${waitingOn}` : "Save the leaderboard and start fresh", icon: faRotate },
                    ...(isAdmin ? [{ key: "delete", label: "Delete Role", hint: "Permanently delete this role and its data", icon: faTrash, danger: true }] : []),
                ] as { key: string; label: string; hint: string; icon: typeof faPen; danger?: boolean }[];
                const open = sections.find(x => x.key === configSection) ?? null;
                const slide = { duration: 0.2, ease: [0.32, 0.72, 0, 1] as const };
                return (
                <AnimatePresence mode="wait" initial={false}>
                {!open ? (
                    <motion.div key="config-list" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={slide} className="flex flex-col gap-3">
                        {sections.map(sec => (
                            <button
                                key={sec.key}
                                type="button"
                                onClick={() => setConfigSection(sec.key)}
                                className={`group flex items-center gap-4 w-full text-left px-5 py-4 rounded-2xl border bg-white transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 hover:cursor-pointer ${
                                    sec.danger ? "border-red-100 hover:border-red-300" : "border-gray-200 hover:border-gray-400"
                                }`}
                            >
                                {sec.key === "icon" ? (
                                    <RoleIcon role={role} className="transition-transform group-hover:scale-105" />
                                ) : (
                                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                                        sec.danger
                                            ? "bg-red-50 text-red-500 group-hover:bg-red-500 group-hover:text-white dark:bg-red-500/15"
                                            : "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white"
                                    }`}>
                                        <FontAwesomeIcon icon={sec.icon} />
                                    </span>
                                )}
                                <span className="min-w-0 flex-1">
                                    <span className={`block font-semibold ${sec.danger ? "text-red-600 dark:text-red-400" : ""}`}>{sec.label}</span>
                                    <span className="block text-sm text-gray-500 truncate">{sec.hint}</span>
                                </span>
                                <FontAwesomeIcon icon={faChevronRight} className="shrink-0 text-gray-300 transition-all duration-200 group-hover:text-gray-600 group-hover:translate-x-1" />
                            </button>
                        ))}
                    </motion.div>
                ) : (
                    <motion.div key={`config-${open.key}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={slide} className="flex flex-col gap-4">
                        <div className="flex flex-col items-start gap-3">
                            <BackButton label="Config" onClick={() => setConfigSection(null)} />
                            <h2 className={`text-xl font-bold ${open.danger ? "text-red-600 dark:text-red-400" : ""}`}>{open.label}</h2>
                        </div>

                        {open.key === "icon" && <RoleIconPicker role={role} />}

                        {open.key === "general" && (
                            <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4">
                                <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Role name</h3>
                                <p className="text-sm text-gray-500 -mt-2">Currently <span className="font-semibold text-gray-800">{role.name}</span>.{!canChange && ` ${approverName} has to approve a new name.`}</p>
                                <form id="rolename" onSubmit={changeRoleName} className="flex flex-col gap-3">
                                    <Input type="text" name="newName" placeholder="New role name" required={true} autocomplete="false" size="full" />
                                    <Button type="submit" size="sm">{canChange ? "Save Name" : "Request Rename"}</Button>
                                    <Alert value={phrase} setValue={setPhrase} />
                                </form>
                            </div>
                        )}
                        {open.key === "general" && (
                            <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4">
                                <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Global Leaderboard</h3>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="font-semibold">Show the global leaderboard</p>
                                        <p className="text-sm text-gray-500">When on, every member of this role can see the global leaderboard on the Home page.</p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={showInGlobal}
                                        aria-label="Show the global leaderboard to this role's members"
                                        onClick={toggleGlobalLeaderboard}
                                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 hover:cursor-pointer ${showInGlobal ? "bg-green-500" : "bg-gray-300"}`}
                                    >
                                        <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform duration-200 ${showInGlobal ? "translate-x-6" : "translate-x-1"}`} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {open.key === "privacy" && canChange && (
                            <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="font-semibold">Invite only</p>
                                        <p className="text-sm text-gray-500">
                                            When on, {role.name} is hidden from the Roles page for anyone who isn't in it, and nobody can ask to join. People join only when an instructor or admin invites them from the Members tab.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={inviteOnly}
                                        aria-label="Make this role invite only"
                                        onClick={toggleInviteOnly}
                                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 hover:cursor-pointer ${inviteOnly ? "bg-green-500" : "bg-gray-300"}`}
                                    >
                                        <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform duration-200 ${inviteOnly ? "translate-x-6" : "translate-x-1"}`} />
                                    </button>
                                </div>
                                {inviteOnly && (role.pendingRequests ?? []).length > 0 && (
                                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 dark:text-amber-300 dark:bg-amber-500/15 dark:border-amber-500/40">
                                        {(role.pendingRequests ?? []).length} join request{(role.pendingRequests ?? []).length === 1 ? " is" : "s are"} still waiting from before. You can still accept or decline {(role.pendingRequests ?? []).length === 1 ? "it" : "them"} in the Members tab.
                                    </p>
                                )}
                            </div>
                        )}

                        {open.key === "messages" && (
                            <div className="flex flex-col gap-3">
                                {([
                                    {
                                        feature: "chat" as const,
                                        title: "Group chat",
                                        text: `A chat with everyone in ${role.name}, on a Chat tab on the role's page. New messages show up as notifications in the iOS app (never by email). Instructors and admins can delete any message.`,
                                    },
                                    {
                                        feature: "taskThreads" as const,
                                        title: "Task questions",
                                        text: "A Questions button on each task, where the person doing it and whoever gave it can talk about it. Nobody else can read it. New messages show up as notifications in the iOS app (never by email).",
                                    },
                                ]).map(({ feature, title, text }) => {
                                    const on = messaging[feature];
                                    const pending = roleRequests.find(r => r.type === "roleMessaging" && r.feature === feature);
                                    return (
                                        <div key={feature} className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="min-w-0">
                                                    <p className="font-semibold flex items-center gap-2">
                                                        {title}
                                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${on
                                                            ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30"
                                                            : "bg-gray-50 text-gray-500 border-gray-200"}`}>{on ? "On" : "Off"}</span>
                                                    </p>
                                                    <p className="text-sm text-gray-500">{text}</p>
                                                </div>
                                                {canChange && (
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-checked={on}
                                                        aria-label={`${title} in ${role.name}`}
                                                        disabled={messagingBusy === feature}
                                                        onClick={() => changeMessaging(feature)}
                                                        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 hover:cursor-pointer disabled:opacity-60 ${on ? "bg-green-500" : "bg-gray-300"}`}
                                                    >
                                                        <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? "translate-x-6" : "translate-x-1"}`} />
                                                    </button>
                                                )}
                                            </div>
                                            {!canChange && (pending ? (
                                                <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 dark:bg-amber-500/15 dark:border-amber-500/40">
                                                    <p className="text-sm text-amber-700 dark:text-amber-300">
                                                        {pending.uid === user.uid ? "You asked" : `${pending.userName || "An instructor"} asked`} to turn it {pending.enabled ? "on" : "off"}. Waiting for {waitingOn}.
                                                    </p>
                                                    {pending.uid === user.uid && <Button onClick={() => withdrawRequest(pending)} size="xsm" color="cancel" extraClasses="shrink-0">Withdraw</Button>}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    <p className="text-xs text-gray-400">Only {approverName === "An admin" ? "an admin" : "the role's owner or an admin"} can turn this {on ? "off" : "on"}. You can ask them.</p>
                                                    <Button onClick={() => changeMessaging(feature)} size="sm" color={on ? "gray" : "blue"} disabled={messagingBusy === feature}>
                                                        {messagingBusy === feature ? "Sending..." : on ? "Request to Turn Off" : "Request to Turn On"}
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                                {canChange && (
                                    <div className="bg-white border border-red-100 rounded-2xl p-5 flex flex-col gap-3">
                                        <h3 className="text-sm font-semibold uppercase tracking-widest text-red-500">Clear group chat</h3>
                                        <p className="text-sm text-gray-500">
                                            Deletes every message in {role.name}'s group chat for everyone in the role. This can't be undone. The chat stays {messaging.chat ? "on" : "off"}, and task questions aren't affected.
                                        </p>
                                        <Button onClick={clearChat} color="red" size="sm" disabled={clearingChat}>
                                            {clearingChat ? "Clearing..." : "Clear Group Chat"}
                                        </Button>
                                        {chatCleared && <p className="text-sm text-green-600 dark:text-green-400">{chatCleared}</p>}
                                    </div>
                                )}
                            </div>
                        )}

                        {open.key === "reset" && (
                            <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                                <p className="text-sm text-gray-500">
                                    Saves every member's points and tasks completed under a name you choose (shown with the date on the Saved Data tab), then clears this role's tasks, submissions and prizes and sets everyone back to 0.
                                    {!canChange && ` ${approverName} has to approve it first.`}
                                </p>
                                {pendingReset ? (
                                    <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                        <p className="text-sm text-amber-700">
                                            {pendingReset.uid === user.uid ? "Reset requested" : `${pendingReset.userName || "An instructor"} requested a reset`} as "{pendingReset.saveName}". Waiting for {waitingOn}.
                                        </p>
                                        {pendingReset.uid === user.uid && <Button onClick={() => withdrawRequest(pendingReset)} size="xsm" color="cancel" extraClasses="shrink-0">Cancel</Button>}
                                    </div>
                                ) : (
                                    <Button onClick={resetRole} size="sm">{canChange ? "Reset Role" : "Request Reset"}</Button>
                                )}
                                <Alert value={phrase2} setValue={setPhrase2} />
                            </div>
                        )}

                        {open.key === "delete" && isAdmin && (
                            <div className="bg-white border border-red-100 rounded-2xl p-5 flex flex-col gap-3">
                                <p className="text-sm text-gray-500">Permanently deletes {role.name} and all of its data, including its tasks, prizes and saved data. This can't be undone.</p>
                                <Button onClick={deleteRole} color="red" size="sm">Delete Role</Button>
                            </div>
                        )}
                    </motion.div>
                )}
                </AnimatePresence>
                );
            })()}

        </motion.div>
    );
}