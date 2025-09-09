import { motion } from "motion/react";
import type { Task } from "../myDataTypes";
import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { collection, doc, onSnapshot, query, setDoc, Timestamp, where } from "firebase/firestore";

interface DoneButtonProps {
    task: Task
}

function DoneButton({ task } : DoneButtonProps) {
    const [tasks, setTasks] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;

        const q = query(
            collection(db, "tasksSubmitted"),
            where("assignedTo", "==", user.uid)
        );

        const unsub = onSnapshot(q, (snap) => {
            setTasks(snap.docs.map(doc => doc.id))
        });

        return () => unsub();
    }, []);

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
                title: task.title
            });
        }   catch (err) {
            console.error("Error submitting task:", err);
        } finally {
            setSubmitting(false);
        }
    }

    if (tasks.includes(task.id)) {
        return <p>Waiting for approval</p>
    } else {
        return (
            <motion.button 
                onClick={submitTask} 
                onTap={submitTask}
                disabled={submitting}
            >
                {submitting ? "Submitting..." : "Done"}
            </motion.button>
        );
    }
}

export default DoneButton;