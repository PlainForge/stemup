import { createUserWithEmailAndPassword, deleteUser, GoogleAuthProvider, onAuthStateChanged, reauthenticateWithPopup, sendEmailVerification, signInWithEmailAndPassword, signInWithPopup, type User } from "firebase/auth";
import { auth, db, storage } from "./firebase";
import { arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { UserData } from "../myDataTypes";

const DEFAULT_AVATAR = "https://ui-avatars.com/api/?name=User&background=90caf9&color=fff";

export const firebaseAuthService = {
    /**
     * Registers new user and add user to Firestore using email
     * @param email string
     * @param password string
     * @param name string
     * @returns 
     */
    async registerWithEmail(email: string, password: string, name: string) {
        if (!email || !password || !name) return null;

        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const userRef = doc(db, "users", userCred.user.uid);
        // Add starter data for new user
        await setDoc(userRef, {
            email: userCred.user.email,
            name: name,
            roles: [{id: 'r3wUbRSCX7cxwBYhtAdg', name: 'global', points: 0, taskCompleted: 0}],
            createdAt: new Date(),
            points: 0,
            taskCompleted: 0,
            photoURL: DEFAULT_AVATAR,
            currentRole: ""
        })
        // Add user to global role
        await updateDoc(doc(db, "roles", 'r3wUbRSCX7cxwBYhtAdg'), {
            members: arrayUnion(userCred.user.uid)
        })

        await sendEmailVerification(userCred.user);
    },

    /**
     * Login user using email
     * @param email string
     * @param password string
     * @returns 
     */
    async loginWithEmail(email: string, password: string) {
        if (!email || !password) return null;

        await signInWithEmailAndPassword(auth, email, password);
    },

    /**
     * Sign In with Google
     * @param provider GoogleAuthProvider
     */
    async signInWithGoogle(provider : GoogleAuthProvider) {
        const userCred = await signInWithPopup(auth, provider);
        const user = userCred.user;
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        let photoURL = DEFAULT_AVATAR;
        if (!userSnap.exists()) {
            if (user.photoURL) {
                const response = await fetch(user.photoURL);
                const blob = await response.blob();
                const storageRef = ref(storage, `profilePictures/${user.uid}`);
                await uploadBytes(storageRef, blob);
                photoURL = await getDownloadURL(storageRef);
            }

            await setDoc(userRef, {
                email: user.email,
                name: user.displayName,
                roles: [{id: 'r3wUbRSCX7cxwBYhtAdg', name: 'global', points: 0, taskCompleted: 0}],
                createdAt: new Date(),
                points: 0,
                taskCompleted: 0,
                photoURL: photoURL,
                currentRole: ""
            });

            await updateDoc(doc(db, "roles", 'r3wUbRSCX7cxwBYhtAdg'), {
                members: arrayUnion(user.uid)
            })
        }
    },

    async setAccountInformation(name: string | undefined, file: File | null, user: User, userData: UserData) {
        let photoURL = userData.photoURL;
        
        try {
            // 1. If a new file was selected, replace the old file
            if (file) {
                // If user had a custom pic, delete it
                if (userData.photoURL && userData.photoURL !== DEFAULT_AVATAR) {
                    try {
                        const oldRef = ref(storage, `profilePictures/${user.uid}`);
                        await deleteObject(oldRef);
                    } catch (err) {
                        console.warn("Couldn't delete old picture:", err);
                    }
                }

                // Upload the new file
                const storageRef = ref(storage, `profilePictures/${user.uid}`);
                await uploadBytes(storageRef, file);
                photoURL = await getDownloadURL(storageRef);
            }

            // 2. Update Firestore (only changing name + photoURL if needed)
            await setDoc(
                doc(db, "users", user.uid),
                {
                    name: name,
                    photoURL: photoURL,
                },
                { merge: true }
            );
            return true;
        } catch (err) {
            console.log(err);
            return false;
        }
    },

    /**
     * Delete user account
     * @param user 
     * @param userData 
     */
    async deleteAccount(user: User, userData: UserData) {
        try {
            const provider = new GoogleAuthProvider(); 
            await reauthenticateWithPopup(user, provider);

            const batchUpdates: Promise<void>[] = [];

            // Remove user from all roles
            const rolesSnap = await getDocs(collection(db, "roles"));
            rolesSnap.forEach((roleDoc) => {
                const data = roleDoc.data();
                const members: string[] = data.members || [];

                if (members.includes(user.uid)) {
                    const updatedMembers = members.filter((m) => m !== user.uid);
                    batchUpdates.push(
                    updateDoc(doc(db, "roles", roleDoc.id), {
                            members: updatedMembers 
                        })
                    );
                }
            });

            const q = query(collection(db, "tasks"), where("assignedTo", "==", user.uid));
            const tasksSnap = await getDocs(q);
            tasksSnap.forEach((taskDoc) => {
                batchUpdates.push(deleteDoc(doc(db, "tasks", taskDoc.id)));
            });

            if (userData?.photoURL && userData.photoURL !== DEFAULT_AVATAR) {
                try {
                    const oldRef = ref(storage, `profilePictures/${user.uid}`);
                    await deleteObject(oldRef);
                } catch (err) {
                    console.warn("No profile picture to delete or already removed:", err);
                }
            }

            batchUpdates.push(deleteDoc(doc(db, "users", user.uid)));

            await Promise.all(batchUpdates);

            await deleteUser(user);

            console.log("User account and related data deleted.");
            return true;
        } catch (err) {
            console.error("Error deleting account:", err);
            return false;
        }
    },

    /**
     * Get User's Data from Firestore
     * @param id string
     * @returns UserData | null
     */
    async getUserData(id: string) {
        const userRef = doc(db, "users", id);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            return userSnap;
        }
        return null;
    },
    
    onAuthStateChanged(callback: (user: User | null) => void) {
        return onAuthStateChanged(auth, callback);
    },
}