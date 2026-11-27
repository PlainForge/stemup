import type { Task } from "../myDataTypes";
import { useContext, useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, deleteField, doc, onSnapshot, query, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import "./styles/doneButton.css"
import { MainContext } from "../context/MainContext";
import Button from "./Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCircleCheck, faHourglassHalf } from "@fortawesome/free-solid-svg-icons";

interface DoneButtonProps {
    task: Task
}

export default function DoneButton({ task } : DoneButtonProps) {
    const context = useContext(MainContext);
    const [tasks, setTasks] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const user = context?.user ?? null;

    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, "tasksSubmitted"),
            where("assignedTo", "==", user.uid)
        );

        const unsub = onSnapshot(q, (snap) => {
            setTasks(snap.docs.map(doc => doc.id))
        });

        return () => unsub();
    }, [user]);

    const submitTask = async () => {
        setSubmitting(true);
        try {
            await setDoc(doc(db, "tasksSubmitted", task.id), {
                assignedTo: task.assignedTo,
                assignedName: task.assignedName,
                description: task.description,
                points: task.points,
                roleId: task.roleId,
                submission: Timestamp.now(),
                complete: false,
                title: task.title
            });
            // Clear the auto-delete timer — an overdue task that's just been submitted
            // shouldn't disappear out from under the admin while it's awaiting review
            if (task.deleteAt) {
                await updateDoc(doc(db, "tasks", task.id), { deleteAt: deleteField() });
            }
        }   catch (err) {
            console.error("Error submitting task:", err);
        } finally {
            setSubmitting(false);
        }
    }

    if (task.complete) {
        return (
            <div className="w-full flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30">
                <FontAwesomeIcon icon={faCircleCheck} />
                Completed
            </div>
        );
    } else if (tasks.includes(task.id)) {
        return (
            <div className="w-full flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
                <FontAwesomeIcon icon={faHourglassHalf} />
                Waiting for approval
            </div>
        );
    } else {
        return (
            <Button
                onClick={submitTask}
                disabled={submitting}
                size="full"
            >
                <span className="flex items-center justify-center gap-2">
                    <FontAwesomeIcon icon={faCheck} />
                    {submitting ? "Submitting..." : "Mark as Done"}
                </span>
            </Button>
        );
    }
}