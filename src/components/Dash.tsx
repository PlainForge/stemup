import { useContext } from "react";
import { motion } from "motion/react";
import { MainContext } from "../context/MainContext";
import ProfileImg from "./ProfileImg";

const DEFAULT_AVATAR = "https://ui-avatars.com/api/?name=User&background=90caf9&color=fff";

export default function Dash() {
    const context = useContext(MainContext);

    if (!context) return null;
    const {user, userData} = context;

    if (!user || !userData) return

    return (
        <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex flex-col w-full items-center justify-center space-y-8"
        >
            <h1 className="font-bold text-2xl">Your Stats</h1>
            <div className="flex flex-col items-center justify-center space-x-0 md:space-x-4 space-y-4 md:space-y-0 sm:flex-row">
                {userData?.photoURL ? (
                    <ProfileImg src={userData.photoURL || DEFAULT_AVATAR} alt="Profile Picture" />
                ) : (
                    <ProfileImg alt="No Profile Picture" />
                )}
                <h3 className="text-2xl">{userData?.name ? userData.name : ""}</h3>
            </div>
            
            
            <motion.div className="flex justify-between items-center w-full border-b">
                <h3 className="text-2xl">Total Points</h3>
                <p>{userData?.points ? userData.points : 0}</p>
            </motion.div>
            <motion.div className="flex justify-between items-center w-full border-b">
                <h3 className="text-2xl">Task Completed</h3>
                <p>{userData?.taskCompleted ? userData.taskCompleted : 0}</p>
            </motion.div>
        </motion.div>
    )
}