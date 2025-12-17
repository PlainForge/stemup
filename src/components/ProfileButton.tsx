import { motion } from "motion/react";
import ProfileImg from "./ProfileImg";
import type { UserData } from "../myDataTypes";
import { useContext } from "react";
import { MainContext } from "../context/MainContext";

interface ProfileButtonProps {
    user: UserData,
    size: string,
}

export default function ProfileButton({user, size} : ProfileButtonProps) {
    const context = useContext(MainContext);
    const setShowAccount = context?.setShowAccount ?? null;
    const swtch = () => {
        if (!setShowAccount) return;
        setShowAccount(user);
    }
    return (
        <motion.div
            className={`flex gap-4 items-center cursor-pointer`}
            whileHover={{scale: 1.04}}
            onClick={() => swtch()}
        >
            <ProfileImg src={user.photoURL} alt={user.name} size={size} />
            <p className="text-2xl font-medium">{user.name}</p>
        </motion.div>
    )
}