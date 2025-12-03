import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import "./styles/settingsPage.css"
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { motion } from "motion/react";
import { firebaseAuthService } from "../lib/firebaseService";
import { MainContext } from "../context/MainContext";
import Loading from "./Loading";


export default function Settings() {
    const context = useContext(MainContext);
    const [roleName, setRoleName] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const user = context?.user ?? null;
    const userData = context?.userData ?? null;
    const loading = context?.loading ?? true;
    const [name, setName] = useState<string | undefined>(userData? userData.name : undefined);

    useEffect(() => {
        const fetchRoleName = async () => {
            if (!userData?.currentRole) {
                setRoleName("");
                return;
            }

            const roleRef = doc(db, "roles", userData.currentRole);
            const roleSnap = await getDoc(roleRef);

            setRoleName(roleSnap.exists() ? roleSnap.data().name : "");
        };

        fetchRoleName();
    }, [userData?.currentRole]);

    if (!user || !userData || loading) {
        return <Loading />
    }

    const handleDeleteAccount = async () => {
        const confirmDelete = window.confirm("Are you sure you want to delete your account? This cannot be undone.");

        if (!confirmDelete) return;
        await firebaseAuthService.deleteAccount(user, userData);
    };

    const changeAccount = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        await firebaseAuthService.setAccountInformation(name, file, user, userData);
        // Reset file input
        setFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const cancelCurrent = () => {
        if (!userData) return;

        setName(userData.name);
        setFile(null)
    }

    const handleCurrentRole = async () => {
        const userRef = doc(db, "users", user.uid)
        await updateDoc(userRef, {
            currentRole: ""
        })
    }

    return (
        <motion.div className="main-settings-container"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
        >
            <div className="title-container title-container-change">
                <h1 className="title-main">Account Settings</h1>
                <p className="sub-title"><strong>Account ID</strong>: {user.uid}</p>
            </div>
            <div className="settings-container">
                <div className="settings-current">
                    <div className="settings-account">
                        <form className="settings-form" onSubmit={changeAccount}>
                            <div className="settings-user">
                                <div className="current-account-1">
                                    <h3>Your Name</h3>
                                    <input 
                                        type="name" 
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="input-lg"
                                        maxLength={16}
                                        required
                                    />
                                </div>
                                <div className="current-account-2">
                                    {userData?.photoURL ? (
                                        <img src={userData.photoURL} alt="Profile" className={"pfp-image"} />
                                    ) : (
                                        <div style={{ background: "#fff" }} className="pfp-image" />
                                    )}
                                    <label className="button-sm">
                                        Upload a new Photo
                                        <input 
                                            ref={fileInputRef}
                                            itemID="newPfp"
                                            name="newPfp"
                                            type="file" 
                                            accept="image/*" 
                                            onChange={(e) => setFile(e.target.files?.[0] || null)} 
                                            className="hidden-button"
                                        />
                                    </label>
                                </div>
                            </div>
                            <div className="form-options">
                                <button className="button-sm button-error" onClick={cancelCurrent}>Cancel</button>
                                <button type="submit" className="button-sm">Save</button>
                            </div>
                        </form>
                        <div className="other-options">
                            <div className="current-role">
                                <button onClick={handleCurrentRole} className="button-sm button-error">Reset current role</button>
                                <h3 className="title-card">Current Role: {roleName}</h3>
                            </div>
                            <button onClick={handleDeleteAccount} className="button-sm button-error">Delete my account</button>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}