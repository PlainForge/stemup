import { useContext } from "react";
import { MainContext } from "../context/MainContext";
import Button from "./Button";
import ProfileImg from "./ProfileImg";
import { motion } from "motion/react";
import { useLocation, useParams } from "react-router-dom";
import { firebaseAuthService } from "../lib/firebaseService";


export default function ProfilePage() {
    const context = useContext(MainContext);
    const user = context?.user ?? null;
    const admins = context?.admins ?? [];
    const selectedUser = context?.showAccount ?? null;
    const setShowAccount = context?.setShowAccount ?? null;

    const location = useLocation();
    const { id: roleId } = useParams<{ id: string }>();

    const swtch = () => {
        if (!setShowAccount) return;
        setShowAccount(null);
    }

    if (!selectedUser || !user) return;

    const kick = async () => {
        const confirmKick = window.confirm(
            `Remove ${selectedUser.name} from this role?`
        );
        if (!confirmKick || !roleId) return;

        await firebaseAuthService.kickUserFromRole(roleId, selectedUser.uid);
        setShowAccount?.(null);
    }
    
    return (
        <motion.div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={swtch}
        >
            <motion.div
                className="flex flex-col items-center bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs gap-4"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => e.stopPropagation()}
            >
                <ProfileImg src={selectedUser.photoURL} />
                <h1 className="text-xl font-bold">{selectedUser.name}</h1>

                <div className="w-full grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Points</p>
                        <p className="text-2xl font-bold">{selectedUser.points}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Tasks</p>
                        <p className="text-2xl font-bold">{selectedUser.taskCompleted}</p>
                    </div>
                </div>

                <div className="flex gap-2 w-full">
                    {admins.includes(user.uid) && location.pathname.includes("/roles") &&
                        <Button color="red" size="full" onClick={kick}>Kick</Button>
                    }
                    <Button color="gray" size="full" onClick={swtch}>Close</Button>
                </div>
            </motion.div>
        </motion.div>
    )
}