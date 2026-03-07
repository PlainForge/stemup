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
            className="w-full max-w-2xl mx-auto px-4 py-8"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
        >
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Account Settings</h1>
                <p className="text-xs text-gray-400 mt-1 font-mono break-all">{user.uid}</p>
            </div>

            <div className="flex flex-col gap-4">

                {/* Profile card */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-5">Profile</h2>
                    <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
                        {/* Avatar */}
                        <div className="flex flex-col items-center gap-2 shrink-0">
                            <ProfileImg src={preview ?? undefined} />
                            <label className="px-3 py-1.5 bg-gray-900 text-white rounded-xl text-xs cursor-pointer hover:bg-blue-600 transition-all duration-200">
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

                        {/* Fields */}
                        <form className="flex flex-col gap-4 flex-1 w-full">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium text-gray-600">Display Name</label>
                                <Input
                                    size="full"
                                    type="text"
                                    maxLength={16}
                                    value={name}
                                    setValue={setName}
                                    required={true}
                                    autocomplete="false"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium text-gray-600">Current Role</label>
                                <div className="flex items-center justify-between bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl">
                                    <span className="text-sm">{roleName || <span className="text-gray-400">No role selected</span>}</span>
                                    <Button onClick={resetRole} color="red" size="xsm" type="button">
                                        Reset
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>

                {/* Save / Cancel */}
                <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={handleSave} color="blue" size="sm">
                        Save Changes
                    </Button>
                    <Button onClick={handleCancelChanges} color="gray" size="xsm">
                        Cancel
                    </Button>
                    <Alert value={phrase} setValue={setPhrase} />
                </div>

                {/* Danger zone */}
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6 mt-2">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-red-400 mb-1">Danger Zone</h2>
                    <p className="text-sm text-gray-500 mb-4">Once you delete your account, there is no going back.</p>
                    <Button onClick={deleteAccount} color="red" size="sm">
                        Delete My Account
                    </Button>
                </div>

            </div>
        </motion.div>
    );
}
