import { useContext, useEffect, useRef, useState } from "react";
import { alertDialog, confirmDialog, promptDialog } from "../lib/confirm";
import { motion } from "motion/react";
import { MainContext } from "../context/MainContext";
import { firebaseAuthService } from "../lib/firebaseService";
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { signOut } from "firebase/auth";
import Loading from "./Loading";
import Button from "../components/Button";
import { Alert } from "../components/PhraseAlert";
import { useNavigate } from "react-router-dom";
import ProfileImg from "../components/ProfileImg";
import Input from "../components/Input";
import SemesterResetModal from "../components/SemesterResetModal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBug, faCheck, faCopy, faCircleHalfStroke, faMoon, faRightFromBracket, faSun, faWrench } from "@fortawesome/free-solid-svg-icons";
import Dropdown from "../components/Dropdown";
import type { ThemeMode } from "../context/MainProvider";
import { NOTIFICATION_TYPES, type StemRequest } from "../myDataTypes";
import { roleService } from "../lib/roleService";
import { BLOCKED_NAME_MESSAGE, isProfaneName } from "../lib/nameFilter";
import { AccessBadge } from "./AdminPage";

/** A gray inset row with a title, a hint under it, and an on/off switch. */
function SwitchRow({ label, hint, checked, onChange, disabled = false }: {
    label: string;
    hint: string;
    checked: boolean;
    onChange: (on: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl">
            <div className="min-w-0">
                <p className="text-sm">{label}</p>
                <p className="text-xs text-gray-400 break-words">{hint}</p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${disabled ? "opacity-50 cursor-not-allowed" : "hover:cursor-pointer"} ${checked ? "bg-green-500" : "bg-gray-300"}`}
            >
                <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
            </button>
        </div>
    );
}

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
    const [showResetModal, setShowResetModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [instructorRequest, setInstructorRequest] = useState<StemRequest | null>(null);
    const [reason, setReason] = useState("");
    const [requesting, setRequesting] = useState(false);
    const [uidCopied, setUidCopied] = useState(false);

    const copyUid = async () => {
        if (!user) return;
        await navigator.clipboard.writeText(user.uid);
        setUidCopied(true);
        setTimeout(() => setUidCopied(false), 1500);
    };

    const admins = context?.admins ?? [];
    const themeMode = context?.themeMode ?? "system";
    const setThemeMode = context?.setThemeMode;
    const setBugReportOpen = context?.setBugReportOpen;
    const isAdmin = user ? admins.includes(user.uid) : false;
    const access = context?.access ?? "user";

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

    // A User's open request to become an Instructor
    useEffect(() => {
        if (!user || access !== "user") {
            setInstructorRequest(null);
            return;
        }
        const q = query(collection(db, "requests"), where("uid", "==", user.uid));
        return onSnapshot(q, (snap) => {
            const found = snap.docs.map(d => ({ id: d.id, ...d.data() } as StemRequest)).find(r => r.type === "instructor");
            setInstructorRequest(found ?? null);
        }, (err) => console.error("Error loading your request:", err));
    }, [user, access]);

    if (!user || !userData || loading || !context) return <Loading />;

    const requestInstructor = async () => {
        if (!reason.trim()) {
            await alertDialog("Please tell the admins why you'd like to be an Instructor.", "Reason needed");
            return;
        }
        setRequesting(true);
        try {
            await roleService.requestInstructor(user.uid, userData.name, reason);
            setReason("");
        } catch (err) {
            console.error(err);
            await alertDialog("Couldn't send your request. Please try again.", "Request not sent");
        } finally {
            setRequesting(false);
        }
    };

    const notifyPrefs = userData.notifications ?? {};
    // field is "email", "push" or "types.<kind>"
    const setNotify = async (field: string, on: boolean) => {
        try {
            await updateDoc(doc(db, "users", user.uid), { [`notifications.${field}`]: on });
        } catch (err) {
            console.error(err);
            await alertDialog("Couldn't save your notification settings. Please try again.", "Not saved");
        }
    };

    const showGlobal = userData.showGlobalLeaderboard !== false;
    const toggleGlobal = async () => {
        await updateDoc(doc(db, "users", user.uid), { showGlobalLeaderboard: !showGlobal });
    };

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
        if (isProfaneName(name)) {
            await alertDialog(BLOCKED_NAME_MESSAGE, "Name not saved");
            return;
        }
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

    const handleUndoChanges = () => {
        setName(userData.name);
        setFile(null);
        setPreview(userData.photoURL || null);

        if (fileRef.current) fileRef.current.value = "";
    };

    const hasChanges = name !== userData.name || file !== null;

    const resetRole = async () => {
        await updateDoc(doc(db, "users", user.uid), { currentRole: "" });
        context.setUserData(prev =>
            prev ? { ...prev, currentRole: "" } : prev
        );
    };

    const handleSignOut = async () => {
        await signOut(auth);
        navigate("/login");
        window.location.reload();
    };

    const deleteAccount = async () => {
        const result = await confirmDialog("This permanently deletes your account, tasks, and role memberships. This cannot be undone.", { title: "Delete Account?", confirmLabel: "Delete", danger: true })
        if (!result) return;

        // Progress shows on the button, not the app-wide loading screen: that screen
        // replaces the whole app, including the password dialog, which then never appears
        try {
            setDeleting(true);
            const deleted = await firebaseAuthService.deleteAccount(user, userData, () =>
                promptDialog("Please enter your password to confirm deletion:", {
                    title: "Confirm Deletion",
                    confirmLabel: "Delete",
                    danger: true,
                    input: { type: "password", placeholder: "Password", autoComplete: "current-password" },
                })
            );
            if (deleted) navigate("/login");
        } catch (err) {
            console.error("Delete error:", err);
            await alertDialog(err instanceof Error ? err.message : "Couldn't delete your account. Please try again.", "Account not deleted");
        } finally {
            setDeleting(false);
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
                <button
                    type="button"
                    title="User ID (click to copy)"
                    onClick={copyUid}
                    className="mt-2 inline-flex items-center gap-1.5 max-w-full text-xs text-gray-400 font-mono bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 cursor-pointer hover:border-gray-300 hover:text-gray-500 transition-colors"
                >
                    <span className="break-all text-left">{user.uid}</span>
                    <FontAwesomeIcon icon={uidCopied ? faCheck : faCopy} className={`shrink-0 ${uidCopied ? "text-green-500" : ""}`} aria-label={uidCopied ? "Copied" : "Copy"} />
                </button>
            </div>

            <div className="flex flex-col gap-4">

                {/* Profile card */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-5">Profile</h2>
                    <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
                        {/* Avatar */}
                        <div className="flex flex-col items-center gap-2 shrink-0">
                            <ProfileImg src={preview ?? undefined} alt={userData?.name} />
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

                    {/* Save / Undo — only while there are unsaved changes (or a save confirmation to show) */}
                    {(hasChanges || phrase !== "") && (
                        <div className="flex flex-wrap items-center gap-3 mt-5 pt-5 border-t border-gray-100">
                            {hasChanges && (
                                <>
                                    <Button onClick={handleSave} color="blue" size="sm">
                                        Save Changes
                                    </Button>
                                    <Button onClick={handleUndoChanges} color="gray" size="xsm">
                                        Undo
                                    </Button>
                                </>
                            )}
                            <Alert value={phrase} setValue={setPhrase} />
                        </div>
                    )}
                </div>

                {/* Access level: User < Instructor < Admin */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-5">Access</h2>
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl">
                            <span className="text-sm">Your role</span>
                            <AccessBadge level={access} />
                        </div>
                        <p className="text-sm text-gray-500 -mt-1">
                            {access === "admin" && "You can join any role, run every role from the Admin page, and make people Instructors."}
                            {access === "instructor" && "You can request new roles, run the roles you've been given, and add other instructors to them."}
                            {access === "user" && "You can join roles, complete tasks and earn points. Instructors create and run roles."}
                        </p>

                        {access === "instructor" && (
                            <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl">
                                <div className="min-w-0">
                                    <p className="text-sm">Global leaderboard</p>
                                    <p className="text-xs text-gray-400">Show it on the Home page</p>
                                </div>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={showGlobal}
                                    aria-label="Show the global leaderboard on Home"
                                    onClick={toggleGlobal}
                                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors hover:cursor-pointer ${showGlobal ? "bg-green-500" : "bg-gray-300"}`}
                                >
                                    <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${showGlobal ? "translate-x-6" : "translate-x-1"}`} />
                                </button>
                            </div>
                        )}

                        {access === "user" && (instructorRequest ? (
                            <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 px-4 py-3 rounded-xl">
                                <p className="text-sm text-amber-700">Your request to become an Instructor is waiting for an admin.</p>
                                <Button onClick={() => roleService.deleteRequest(instructorRequest.id)} color="gray" size="xsm" type="button" extraClasses="shrink-0">Withdraw</Button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <label htmlFor="instructor-reason" className="text-sm font-medium text-gray-600">Become an Instructor</label>
                                <textarea
                                    id="instructor-reason"
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    placeholder="Why would you like to be an Instructor?"
                                    maxLength={500}
                                    rows={3}
                                    className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors resize-none"
                                />
                                <div>
                                    <Button onClick={requestInstructor} color="blue" size="sm" type="button" disabled={requesting}>
                                        {requesting ? "Sending..." : "Send Request"}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Notifications: email here, push from the iOS app; both off until turned on */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-5">Notifications</h2>
                    <div className="flex flex-col gap-4">
                        <SwitchRow
                            label="Email notifications"
                            hint={userData.email || user.email || "No email on this account"}
                            checked={notifyPrefs.email === true}
                            onChange={(v) => setNotify("email", v)}
                        />
                        <SwitchRow
                            label="Push notifications"
                            hint={notifyPrefs.push ? "On for your iPhone. Turn them off here or in the iOS app." : "Turn them on in the StemUP iOS app."}
                            checked={notifyPrefs.push === true}
                            disabled={!notifyPrefs.push}
                            onChange={(v) => setNotify("push", v)}
                        />
                        <p className="text-sm text-gray-500 -mb-1">
                            {notifyPrefs.email || notifyPrefs.push ? "Choose what to be notified about:" : "Turn on email or push to be notified about:"}
                        </p>
                        {NOTIFICATION_TYPES.map(t => (
                            <SwitchRow
                                key={t.key}
                                label={t.label}
                                hint={t.hint}
                                checked={notifyPrefs.types?.[t.key] !== false}
                                onChange={(v) => setNotify(`types.${t.key}`, v)}
                            />
                        ))}
                    </div>
                </div>

                {/* App (all screen sizes; desktop also has the floating theme/bug-report buttons) */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-5">App</h2>
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl">
                            <span className="text-sm">Appearance</span>
                            <Dropdown<ThemeMode>
                                label="Appearance"
                                value={themeMode}
                                onChange={(mode) => setThemeMode?.(mode)}
                                options={[
                                    { value: "system", label: "Device Theme", icon: faCircleHalfStroke },
                                    { value: "light", label: "Light", icon: faSun },
                                    { value: "dark", label: "Dark", icon: faMoon },
                                ]}
                            />
                        </div>
                        <div className="flex items-center justify-between bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl">
                            <span className="text-sm">{isAdmin ? "Bug Reports" : "Report a bug"}</span>
                            <Button onClick={() => setBugReportOpen?.(true)} color="blue" size="sm" type="button" extraClasses="flex items-center justify-center gap-2 whitespace-nowrap shrink-0">
                                <FontAwesomeIcon icon={isAdmin ? faWrench : faBug} />
                                {isAdmin ? "View" : "Report"}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Account */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-5">Account</h2>
                    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl">
                        <span className="text-sm">Sign out of this device</span>
                        <Button onClick={handleSignOut} color="blue" size="sm" type="button" extraClasses="flex items-center justify-center gap-2 whitespace-nowrap shrink-0">
                            <FontAwesomeIcon icon={faRightFromBracket} />
                            Sign Out
                        </Button>
                    </div>
                </div>

                {/* Danger zone */}
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6 mt-2">
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-red-400 mb-1">Danger Zone</h2>
                    <p className="text-sm text-gray-500 mb-4">Once you delete your account, there is no going back.</p>
                    <Button onClick={deleteAccount} color="red" size="sm" disabled={deleting}>
                        {deleting ? "Deleting..." : "Delete My Account"}
                    </Button>
                </div>

                {/* Admin: Semester reset */}
                {isAdmin && (
                    <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-red-400 mb-1">Semester Reset</h2>
                        <p className="text-sm text-gray-500 mb-4">
                            Remove old roles to get ready for a new semester. Users whose only roles are removed will be
                            permanently deleted along with their tasks; everyone else keeps their account, with points
                            and completed tasks reset to 0.
                        </p>
                        <Button onClick={() => setShowResetModal(true)} color="red" size="sm">
                            Reset for New Semester
                        </Button>
                    </div>
                )}

            </div>

            <SemesterResetModal open={showResetModal} onClose={() => setShowResetModal(false)} />
        </motion.div>
    );
}
