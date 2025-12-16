import React, { useEffect, useState } from 'react';
import { MainContext } from './MainContext';
import { firebaseAuthService } from '../lib/firebaseService';
import type { User } from 'firebase/auth';
import {type UserData } from '../myDataTypes';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface MainContextType {
    user: User | null;
    setUser: React.Dispatch<React.SetStateAction<User | null>>;
    loading: boolean;
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;
    userData: UserData | null;
    setUserData: React.Dispatch<React.SetStateAction<UserData | null>>;
    admins: string[];
    needsVerification: boolean;
    justLoggedIn: boolean;
    setJustLoggedIn: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function MainProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [admins, setAdmins] = useState<string[]>([]);
    const [needsVerification, setNeedsVerification] = useState<boolean>(false);
    const [justLoggedIn, setJustLoggedIn] = useState(false);

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

    const val = { user, setUser, loading, setLoading, userData, setUserData, admins, needsVerification, justLoggedIn, setJustLoggedIn };

    return (
        <MainContext.Provider value={val}>
            {children}
        </MainContext.Provider>
    );
}