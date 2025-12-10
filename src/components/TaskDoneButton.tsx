import type { Task } from "../myDataTypes";
import { useContext, useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, doc, onSnapshot, query, setDoc, Timestamp, where } from "firebase/firestore";
import "./styles/doneButton.css"
import { MainContext } from "../context/MainContext";
import Button from "./Button";

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
        }   catch (err) {
            console.error("Error submitting task:", err);
        } finally {
            setSubmitting(false);
        }
    }

    if (task.complete) {
        return <h3 className="w-full border-2 p-2 rounded-xl text-center cursor-default bg-green-500">Completed</h3>
    } else if (tasks.includes(task.id)) {
        return <h3 className="w-full border-2 p-2 rounded-xl text-center cursor-default">Waiting for approval...</h3>
    } else {
        return (
            <Button
                onClick={submitTask} 
                disabled={submitting}
                size="full"
            >
                {submitting ? "Submitting..." : "Done"}
            </Button>
        );
    }
}