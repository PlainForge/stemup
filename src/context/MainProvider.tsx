import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MainContext } from './MainContext';
import { firebaseAuthService } from '../lib/firebaseService';
import type { User } from 'firebase/auth';
import { type AccessLevel, type Role, type StemRequest, type UserData } from '../myDataTypes';
import { isRoleChange, roleOwner } from '../lib/roleService';
import { collection, deleteField, doc, onSnapshot, updateDoc, type FieldValue } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export interface MainContextType {
    user: User | null;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    loading: boolean;
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;
    userData: UserData | null;
    setUserData: React.Dispatch<React.SetStateAction<UserData | null>>;
    admins: string[];
    /** Users given Instructor access (admins/instructors doc) */
    instructors: string[];
    /** The signed-in user's level: User < Instructor < Admin */
    access: AccessLevel;
    /** Requests waiting for an admin (admins only; 0 for everyone else) */
    adminRequestCount: number;
    /** The roles an Instructor runs (live; empty for admins and users) */
    instructedRoles: Role[];
    /** Join requests and change requests waiting on this Instructor, across their roles */
    instructorRequestCount: number;
    needsVerification: boolean;
    justLoggedIn: boolean;
    setJustLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
    showAccount: UserData | null;
    setShowAccount: React.Dispatch<React.SetStateAction<UserData | null>>;
    roleNotification: boolean;
    setRoleNotification: React.Dispatch<React.SetStateAction<boolean>>;
    /** Whether the dark theme is showing right now (resolved from themeMode) */
    dark: boolean;
    /** Quick toggle (floating button): switches to an explicit Light or Dark mode */
    setDark: React.Dispatch<React.SetStateAction<boolean>>;
    themeMode: ThemeMode;
    setThemeMode: React.Dispatch<React.SetStateAction<ThemeMode>>;
    bugReportOpen: boolean;
    setBugReportOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/** "system" follows the device's light/dark setting */
export type ThemeMode = "light" | "dark" | "system";

function getInitialThemeMode(): ThemeMode {
    try {
        const stored = localStorage.getItem("theme");
        if (stored === "light" || stored === "dark" || stored === "system") return stored;
    } catch {
        // Storage unavailable (private mode, blocked site data): follow the device
    }
    return "system";
}

const systemDarkQuery = () =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export default function MainProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [admins, setAdmins] = useState<string[]>([]);
    const [instructors, setInstructors] = useState<string[]>([]);
    const [allRoles, setAllRoles] = useState<Role[]>([]);
    const [allRequests, setAllRequests] = useState<StemRequest[]>([]);
    const [needsVerification, setNeedsVerification] = useState<boolean>(false);
    const [justLoggedIn, setJustLoggedIn] = useState(false);
    const [showAccount, setShowAccount] = useState<UserData | null>(null);
    const [roleNotification, setRoleNotification] = useState(false);
    const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode);
    const [systemDark, setSystemDark] = useState<boolean>(() => systemDarkQuery()?.matches ?? false);
    const dark = themeMode === "system" ? systemDark : themeMode === "dark";

    // Follow the device if it switches between light and dark while the app is open
    useEffect(() => {
        const query = systemDarkQuery();
        if (!query) return;
        const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
    }, []);

    const setDark = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((value) => {
        const next = typeof value === "function" ? value(dark) : value;
        setThemeMode(next ? "dark" : "light");
    }, [dark]);
    const [bugReportOpen, setBugReportOpen] = useState(false);

    useEffect(() => {
        if (dark) {
            document.documentElement.setAttribute("data-theme", "dark");
        } else {
            document.documentElement.removeAttribute("data-theme");
        }
    }, [dark]);

    useEffect(() => {
        try {
            localStorage.setItem("theme", themeMode);
        } catch {
            // Not saved; the choice still applies for this visit
        }
    }, [themeMode]);

    // Get current logged in user
    useEffect(() => {
        const unsub = firebaseAuthService.onAuthStateChanged(async (usr) => {
            try {
                if (!usr) {
                    setUser(null);
                    setUserData(null);
                    setNeedsVerification(false);
                    setLoading(false);
                    return;
                }
                if (!usr.emailVerified) {
                    setNeedsVerification(true)
                    setUser(usr);
                    setUserData(null);
                    setLoading(false);
                    return;
                }
                
                setNeedsVerification(false);
                setUser(usr);
                setJustLoggedIn(true);
                setLoading(false);
            } catch (err) {
                console.error("Error in auth listener:", err);
                setLoading(false);
            }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!user) {
            setUserData(null);
            return;
        }

        setLoading(true);
        const userRef = doc(db, "users", user.uid);
        const unsub = onSnapshot(
            userRef,
            (snap) => {
                if (snap.exists()) {
                    setUserData(snap.data() as UserData);
                } else {
                    setUserData(null);
                }
                setLoading(false);
            }, (error) => {
                console.error("Error listening for user updates:", error);
                setLoading(false);
            }
        );

        return () => unsub();
    }, [user])


    // Keeps the profile's email in step with the sign-in email: after a new email is
    // confirmed (its link clicked), save it and clear the "not verified" pending one
    const authEmail = user?.email ?? "";
    const savedEmail = userData?.email ?? "";
    const pendingEmail = userData?.pendingEmail ?? "";
    const hasUserData = !!userData;
    useEffect(() => {
        if (!user || !hasUserData || !authEmail) return;
        const updates: { email?: string; pendingEmail?: FieldValue } = {};
        if (savedEmail !== authEmail) updates.email = authEmail;
        if (pendingEmail && pendingEmail.toLowerCase() === authEmail.toLowerCase()) updates.pendingEmail = deleteField();
        if (Object.keys(updates).length === 0) return;
        updateDoc(doc(db, "users", user.uid), updates).catch(err => console.warn("Couldn't sync email:", err));
    }, [user, hasUserData, authEmail, savedEmail, pendingEmail]);

    // While a new email waits on its link, check every few seconds whether it was clicked.
    // (Firebase signs the account out after an email change, so this usually ends at the login page.)
    useEffect(() => {
        if (!user || !pendingEmail) return;
        const interval = setInterval(async () => {
            try {
                await user.reload();
                const current = auth.currentUser;
                if (current && current.email?.toLowerCase() === pendingEmail.toLowerCase()) {
                    await updateDoc(doc(db, "users", current.uid), { email: current.email, pendingEmail: deleteField() });
                }
            } catch (err) {
                console.warn("Couldn't check the email change:", err);
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [user, pendingEmail]);

    // Get all admins
    useEffect(() => {
        if (!user || needsVerification) return;
        const adminRef = doc(db, "admins", "all-perms");

        const unsub = onSnapshot(
            adminRef,
            (snap) => {
                if (snap.exists()) {
                    const ids = snap.data().ids || [];
                    if (Array.isArray(ids)) setAdmins(ids);
                } else setAdmins([]);
            },
            (error) => {
                console.warn("Error loading admins doc:", error);
                setAdmins([]);
            }
        );

        return () => unsub();
    }, [user, needsVerification]);

    // Get all instructors (set by admins, same shape as the admins doc)
    useEffect(() => {
        if (!user || needsVerification) return;
        const unsub = onSnapshot(
            doc(db, "admins", "instructors"),
            (snap) => {
                const ids = snap.exists() ? snap.data().ids : [];
                setInstructors(Array.isArray(ids) ? ids : []);
            },
            (error) => {
                console.warn("Error loading instructors doc:", error);
                setInstructors([]);
            }
        );
        return () => unsub();
    }, [user, needsVerification]);

    const isAdminUser = !!user && admins.includes(user.uid);
    const isInstructorUser = !!user && !isAdminUser && instructors.includes(user.uid);
    // Admins and Instructors keep live roles and requests for the Admin and Instructor tabs' badges
    const watchesRequests = isAdminUser || isInstructorUser;
    useEffect(() => {
        if (!watchesRequests) {
            setAllRoles([]);
            setAllRequests([]);
            return;
        }
        const unsubs = [
            onSnapshot(collection(db, "roles"), (snap) => {
                setAllRoles(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Role, "id">) })));
            }, (err) => console.warn("Error loading roles:", err)),
            onSnapshot(collection(db, "requests"), (snap) => {
                setAllRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as StemRequest)));
            }, (err) => console.warn("Error loading requests:", err)),
        ];
        return () => unsubs.forEach(u => u());
    }, [watchesRequests]);

    const uid = user?.uid;
    const { adminRequestCount, instructedRoles, instructorRequestCount } = useMemo(() => {
        const roleById = new Map(allRoles.map(r => [r.id, r]));
        // A role's owner handles its instructors' change requests; admins get them only for roles without one
        const adminRequestCount = isAdminUser
            ? allRequests.filter(r => !isRoleChange(r.type) || !roleOwner(roleById.get(r.roleId ?? ""))).length
            : 0;
        const instructedRoles = isInstructorUser && uid
            ? allRoles.filter(r => (r.instructors ?? []).includes(uid)).sort((a, b) => a.name.localeCompare(b.name))
            : [];
        const instructorRequestCount = instructedRoles.reduce((n, r) => n + (r.pendingRequests ?? []).length, 0)
            + allRequests.filter(r => isRoleChange(r.type) && r.uid !== uid && roleOwner(roleById.get(r.roleId ?? "")) === uid).length;
        return { adminRequestCount, instructedRoles, instructorRequestCount };
    }, [allRoles, allRequests, isAdminUser, isInstructorUser, uid]);

    const access: AccessLevel = !user ? "user"
        : admins.includes(user.uid) ? "admin"
        : instructors.includes(user.uid) ? "instructor"
        : "user";

    useEffect(() => {
        if (!user || user.emailVerified) return;

        // Check email verification every 3 seconds
        const interval = setInterval(async () => {
            await user.reload(); // refresh Firebase user object

            if (user.emailVerified) {
                setNeedsVerification(false);
                // user is now verified → update state
                setUser({ ...user }); 
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [user]);

    const val = useMemo(
        () => ({ user, setUser, loading, setLoading, userData, setUserData, admins, instructors, access, adminRequestCount, instructedRoles, instructorRequestCount, needsVerification, justLoggedIn, setJustLoggedIn, showAccount, setShowAccount, roleNotification, setRoleNotification, dark, setDark, themeMode, setThemeMode, bugReportOpen, setBugReportOpen }),
        [user, loading, userData, admins, instructors, access, adminRequestCount, instructedRoles, instructorRequestCount, needsVerification, justLoggedIn, showAccount, roleNotification, dark, setDark, themeMode, bugReportOpen]
    );

    return (
        <MainContext.Provider value={val}>
            {children}
        </MainContext.Provider>
    );
}