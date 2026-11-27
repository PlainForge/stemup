import type { ReactNode } from "react";
import { deleteField, doc, updateDoc } from "firebase/firestore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faCircleDot, faClock, faFlagCheckered, faPersonRunning, faRotateLeft, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { db } from "../lib/firebase";
import { dueInfo } from "../lib/taskDates";
import type { Task } from "../myDataTypes";
import { Chip, ChipRow, TaskCard, TaskDescription, TaskHeader, type TaskTone } from "./TaskCardParts";
import Dropdown from "./Dropdown";
import DoneButton from "./TaskDoneButton";
import TaskThreadButton from "./TaskThread";

const DAY = 1000 * 60 * 60 * 24;

/**
 * One of the signed-in person's own tasks: its details, a status picker, asking
 * for an extension when it's overdue, and submitting it. Used on a role's Tasks
 * tab and on the Tasks page (where [header] adds the role it's from).
 */
export default function MemberTaskCard({ task, isSubmitted, isNew = false, onSeen, header, threads = false }: {
    task: Task;
    isSubmitted: boolean;
    isNew?: boolean;
    onSeen?: () => void;
    header?: ReactNode;
    /** The role has task questions on: a button along the bottom opens this task's thread */
    threads?: boolean;
}) {
    const overdue = !task.complete && !!task.dueDate && task.dueDate.toDate() < new Date();
    const daysLeft = task.deleteAt ? Math.ceil((task.deleteAt.toDate().getTime() - Date.now()) / DAY) : null;
    const tone: TaskTone = task.complete ? "green" : isSubmitted ? "amber" : overdue ? "red" : task.status === "Almost Done" ? "orange" : "blue";
    const due = task.dueDate && !task.complete && !isSubmitted ? dueInfo(task.dueDate) : null;
    const declines = task.declineCount ?? 0;

    const setStatus = (status: string) =>
        updateDoc(doc(db, "tasks", task.id), { status: status || deleteField() }).catch(err => console.error("Error setting status:", err));
    const requestExtension = () =>
        updateDoc(doc(db, "tasks", task.id), { extensionRequested: true }).catch(err => console.error("Error requesting extension:", err));

    return (
        <TaskCard tone={tone} onMouseEnter={onSeen} faded={task.complete}>
            {header}
            <TaskHeader title={task.title} points={task.points} isNew={isNew} done={task.complete} />
            <TaskDescription text={task.description} />
            {(due || overdue || task.extensionRequested || task.extensionDeclined || declines > 0) && (
                <ChipRow>
                    {due && <Chip tone={due.tone} icon={faCalendarDays}>{due.label}</Chip>}
                    {overdue && (
                        <Chip tone="red" icon={faTriangleExclamation}>
                            {daysLeft === null ? "Overdue" : daysLeft > 0 ? `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : "Expiring soon"}
                        </Chip>
                    )}
                    {task.extensionRequested && <Chip tone="amber" icon={faClock}>Extension requested</Chip>}
                    {task.extensionDeclined && <Chip tone="gray">Extension declined</Chip>}
                    {declines > 0 && <Chip tone="red" icon={faRotateLeft}>Sent back {declines}×{declines === 3 ? " · Closed" : ""}</Chip>}
                </ChipRow>
            )}
            {overdue && !task.extensionRequested && !task.extensionDeclined && (
                <button
                    type="button"
                    onClick={requestExtension}
                    className="self-start flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 hover:cursor-pointer"
                >
                    <FontAwesomeIcon icon={faClock} className="text-xs" />
                    Request an extension
                </button>
            )}
            <div className="mt-auto flex flex-col gap-2">
                {!task.complete && !overdue && !isSubmitted && (
                    <Dropdown
                        label="Status"
                        fullWidth
                        tone="gray"
                        value={task.status ?? ""}
                        onChange={setStatus}
                        options={[
                            { value: "", label: "Not started", icon: faCircleDot },
                            { value: "In Progress", label: "In Progress", icon: faPersonRunning },
                            { value: "Almost Done", label: "Almost Done", icon: faFlagCheckered },
                        ]}
                    />
                )}
                {!overdue && <DoneButton task={task} />}
                {threads && (
                    <div className="-mx-2 -mb-2 border-t border-gray-100 pt-1">
                        <TaskThreadButton task={task} enabled={threads} runsRole={false} />
                    </div>
                )}
            </div>
        </TaskCard>
    );
}
