import { auth, db, storage } from "../firebase";
import { useState } from "react";
import { arrayUnion, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import RegisterCard from "../components/RegisterCard";
import { motion } from "motion/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import "./styles/registerPage.css"
import Nav from "../components/Nav";

const DEFAULT_AVATAR = "https://ui-avatars.com/api/?name=User&background=90caf9&color=fff";

export default function RegisterPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [phrase, setPhrase] = useState("");
    const [signInEmail, setSignInEmail] = useState<boolean>(false);
    const provider = new GoogleAuthProvider();

    const registerWithEmail = async () => {
        try {
            if (!email || !password || !name) {
                return;
            }

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const current = userCredential.user;

            await setDoc(doc(db, "users", current.uid), {
                email: current.email,
                name: name,
                roles: [{id: 'r3wUbRSCX7cxwBYhtAdg', name: 'global', points: 0, taskCompleted: 0}],
                createdAt: new Date(),
                points: 0,
                taskCompleted: 0,
                photoURL: DEFAULT_AVATAR,
                currentRole: ""
            });

            await updateDoc(doc(db, "roles", 'r3wUbRSCX7cxwBYhtAdg'), {
                members: arrayUnion(current.uid)
            })

            setPhrase("");
            setEmail("");
            setPassword("");
            setName("");
        } catch (err) {
            if (err instanceof FirebaseError && err.code === "auth/email-already-in-use") {
                setPhrase("This email is already registered. Please login instead.");
            } else {
                console.error("Registration error:", err);
            }
        }
    };

    // Google Login/Register
    const handleGoogleLogin = async () => {
        try {
            const result = await signInWithPopup(auth, provider);
            const current = result.user

            const userRef = doc(db, "users", current.uid);
            const snap = await getDoc(userRef);

            let photoURL = DEFAULT_AVATAR;

            if (!snap.exists()) {
                if (current.photoURL) {
                    const response = await fetch(current.photoURL);
                    const blob = await response.blob();
                    const storageRef = ref(storage, `profilePictures/${current.uid}`);
                    await uploadBytes(storageRef, blob);
                    photoURL = await getDownloadURL(storageRef);
                }

                await setDoc(doc(db, "users",  current.uid), {
                    email: current.email,
                    name: current.displayName,
                    roles: [{id: 'r3wUbRSCX7cxwBYhtAdg', name: 'global', points: 0, taskCompleted: 0}],
                    createdAt: new Date(),
                    points: 0,
                    taskCompleted: 0,
                    photoURL: photoURL,
                    currentRole: ""
                });

                await updateDoc(doc(db, "roles", 'r3wUbRSCX7cxwBYhtAdg'), {
                    members: arrayUnion(current.uid)
                })
            } else {
                const existingData = snap.data();

                let newPhotoURL = existingData.photoURL || DEFAULT_AVATAR;
                if (current.photoURL && current.photoURL !== existingData.photoURL) {
                    const response = await fetch(current.photoURL);
                    const blob = await response.blob();
                    const storageRef = ref(storage, `profilePictures/${current.uid}`);
                    await uploadBytes(storageRef, blob);
                    newPhotoURL = await getDownloadURL(storageRef);
                }

                await setDoc(
                    userRef,
                    { 
                        name: current.displayName || existingData.name,
                        photoURL: newPhotoURL
                    },
                    { merge: true }
                );
            }

            setPhrase("");
            setEmail("");
            setPassword("");
        } catch (err) {
            if (err instanceof FirebaseError && err.code === "auth/email-already-in-use") {
                setPhrase("This email is already registered. Please login instead.");
            } else {
                console.error("Registration error:", err);
            }
        }
    };
    
    return (
        <div className="register-page">
            <div className="left-side">
                <Nav />
                {signInEmail?
                    <RegisterCard 
                        email={email} 
                        setEmail={setEmail} 
                        password={password}
                        setPassword={setPassword}
                        name={name}
                        setName={setName}
                        phrase={phrase}
                        setPhrase={setPhrase}
                        registerWithEmail={registerWithEmail}
                        setSignInEmail={setSignInEmail}
                    />
                :
                    <motion.div 
                        className="register-options"
                        initial={{ y: 50, opacity: 0}}
                        animate={{ y: 0, opacity: 1}}
                        transition={{ duration: 0.1 }}
                    >
                        <h1 className="title-main">Create your account</h1>
                        <button 
                            className="button-md"
                            onClick={handleGoogleLogin} 
                        >
                            Connect with <FontAwesomeIcon icon={faGoogle}/>
                        </button>
                        <button 
                            className="button-md"
                            onClick={() => setSignInEmail(true)}
                        >
                            Continue with email
                        </  button>
                    </motion.div>
                }
            </div>
            <div className="right-side">
                <div className="top">

                </div>
                
                <div className="middle">
                    <h2 className="title-main middle-title">Track all your tasks and gain points and rewards from your roles</h2>
                </div>
                <div className="bottom">
                    <h2 className="bottom-title">Used by these Universities</h2>
                    <div className="used-by-logos">
                        <img 
                            src="https://firebasestorage.googleapis.com/v0/b/stempower-fellowship.firebasestorage.app/o/logo%2Fumb-logo.png?alt=media&token=bed49a81-4745-4e28-b19f-6c9f2e9bdcfa" 
                            alt="UMass Boston campus" 
                            className="logo"
                        />
                        <img 
                            src="https://firebasestorage.googleapis.com/v0/b/stempower-fellowship.firebasestorage.app/o/logo%2Fuma-logo.png?alt=media&token=822f15ac-dfdc-4b70-ba66-bd757fc3f1f6" 
                            alt="UMass Boston campus" 
                            className="logo"
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}