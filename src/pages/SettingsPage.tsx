import { useContext, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { MainContext } from "../context/MainContext";
import { firebaseAuthService } from "../lib/firebaseService";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import Loading from "./Loading";
import Button from "../components/Button";
import { Alert } from "../components/PhraseAlert";
import { useNavigate } from "react-router-dom";
import ProfileImg from "../components/ProfileImg";
import Input from "../components/Input";

export default function Settings() {
    const context = useContext(MainContext);
    const user = context?.user ?? null;
    const userData = context?.userData ?? null;
    const loading = context?.loading ?? true;
    const navigate = useNavigate?.();

    const [roleName, setRoleName] = useState("");
    const [name, setName] = useState(userData?.name ?? "");
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(userData?.photoURL ?? null);
    const [phrase, setPhrase] = useState("");

    const fileRef = useRef<HTMLInputElement | null>(null);

    // Fetch role display name
    useEffect(() => {
        const loadRole = async () => {
            if (!userData?.currentRole) return setRoleName("");
            const snap = await getDoc(doc(db, "roles", userData.currentRole));
            setRoleName(snap.exists() ? snap.data().name : "");
        };
        loadRole();
    }, [userData?.currentRole]);

    if (!user || !userData || loading || !context) return <Loading />;
    const setLoading = context.setLoading;

    // Image preview
    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] || null;
        setFile(f);

        if (f) {
            setPreview(URL.createObjectURL(f));
        }
    };

    // Save changes
    const handleSave = async () => {
        const result = await firebaseAuthService.setAccountInformation(name, file, user, userData);

        if (!result) return;
        context?.setUserData({
            ...userData,
            name,
            photoURL: preview ?? userData.photoURL
        });

        setPhrase("Changes saved successfully!");
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
    };

    const handleCancelChanges = () => {
        setName(userData.name);
        setFile(null);
        setPreview(userData.photoURL || null);

        if (fileRef.current) fileRef.current.value = "";
    };

    const resetRole = async () => {
        await updateDoc(doc(db, "users", user.uid), { currentRole: "" });
        context.setUserData(prev =>
            prev ? { ...prev, currentRole: "" } : prev
        );
    };

    const deleteAccount = async () => {
        const result = window.confirm("Are you sure? This action is permanent.")
        if (!result) return;

        try {
            setLoading(true);
            await firebaseAuthService.deleteAccount(user, userData);
            navigate("/"); // OR redirect after deletion
        } catch (err) {
            console.error("Delete error:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            className="w-full mx-auto px-5 py-10"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
        >
            <h1 className="text-[32px] font-bold mb-1 pl-5">Account Settings</h1>
            <p className="text-[#666] mb-5 pl-5">
                Account ID: <span className="text-black font-semibold">{user.uid}</span>
            </p>

            <div className="bg-white rounded-[18px] p-8 shadow-[0_4px_16px_rgba(0,0,0,0.08)] flex flex-col gap-6">

                <form className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-8 md:gap-[30px]">
                    <div className="flex flex-col gap-4">
                        <label className="text-sm font-semibold">Your Name</label>
                        <Input
                            size="full"
                            type="text"
                            maxLength={16}
                            value={name}
                            setValue={setName}
                            required={true}
                            autocomplete="false"
                        />

                        <label className="text-sm font-semibold">Current Role</label>
                        <div className="flex items-center justify-between bg-[#f7f7f7] p-[12px_14px] rounded-[10px]">
                            <span>{roleName || "No role selected"}</span>
                            <Button
                                onClick={resetRole}
                                color="red"
                                size="xsm"
                                type="button"
                            >
                                Reset Role
                            </Button>
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-[140px] h-[140px] bg-[#f0f0f0] rounded-full overflow-hidden">
                            {preview ? (
                                <ProfileImg src={preview} />
                            ) : (
                                <ProfileImg />
                            )}
                        </div>

                        <label className="px-3.5 py-2.5 bg-[#222] text-white rounded-xl text-sm cursor-pointer text-center hover:bg-blue-600 hover:rounded-lg transition-all duration-200">
                            Change Photo
                            <input
                                type="file"
                                accept="image/*"
                                ref={fileRef}
                                className="hidden"
                                onChange={handleFile}
                            />
                        </label>
                    </div>

                </form>

                <Button
                    onClick={deleteAccount}
                    color="red"
                    size="sm"
                >
                    Delete My Account
                </Button>

                <div className="flex flex-col-reverse md:flex-row md:items-center gap-3">
                    <Button
                        onClick={handleCancelChanges}
                        color="gray"
                        size="xsm"
                    >
                        Cancel
                    </Button>

                    <Button
                        onClick={handleSave}
                        color="blue"
                        size="sm"
                    >
                        Save Changes
                    </Button>
                    <Alert value={phrase} setValue={setPhrase} />
                </div>

            </div>
        </motion.div>
    );
}
