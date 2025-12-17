import { useContext } from "react";
import { MainContext } from "../context/MainContext";
import Button from "./Button";
import ProfileImg from "./ProfileImg";
import { motion } from "motion/react";
import { useLocation } from "react-router-dom";
import { firebaseAuthService } from "../lib/firebaseService";


export default function ProfilePage() {
    const context = useContext(MainContext);
    const user = context?.user ?? null;
    const admins = context?.admins ?? [];
    const selectedUser = context?.showAccount ?? null;
    const setShowAccount = context?.setShowAccount ?? null;

    const location = useLocation();
    const roleId = location.pathname.substring(7);

    const swtch = () => {
        if (!setShowAccount) return;
        setShowAccount(null);
    }

    if (!selectedUser || !user) return;

    const kick = async () => {
        const confirmKick = window.confirm(
            `Remove ${selectedUser.name} from this role?`
        );
        if (!confirmKick) return;

        await firebaseAuthService.kickUserFromRole(roleId, selectedUser.uid);
        setShowAccount?.(null);
    }
    
    return (
        <motion.div className="fixed w-screen h-screen bg-[rgba(24,24,24,0.75)] top-0 flex items-center justify-center z-1">
            <motion.div className="flex flex-col items-center justify-center bg-white p-4 gap-4 rounded-2xl"
                onClick={() => null}
            >
                <ProfileImg src={selectedUser.photoURL}/>
                <h1>{selectedUser.name}</h1>
                <div className="flex items-center justify-between w-full">
                    <h2>Total Points:</h2>
                    <h2>{selectedUser.points}</h2>
                </div>
                <div className="flex items-center justify-between w-full">
                    <h2>Total Tasks Completed:</h2>
                    <h2>{selectedUser.taskCompleted}</h2>
                </div>
                {admins.includes(user.uid) && location.pathname.includes("/roles") ? 
                    <Button color="red" onClick={kick}>Kick</Button>
                    : null
                }
                <Button onClick={() => swtch()}>Return</Button>
            </motion.div>
        </motion.div>
    )
}