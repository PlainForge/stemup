import { useState } from "react";
import { auth, db} from "../firebase.ts";
import { signInWithPopup, signInWithEmailAndPassword, GoogleAuthProvider } from "firebase/auth";
import { arrayUnion, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import "./styles/loginPage.css";
import { FirebaseError } from "firebase/app";
import LoginCard from "../components/LoginCard.tsx";
import Nav from "../components/Nav.tsx";

const DEFAULT_AVATAR = "https://ui-avatars.com/api/?name=User&background=90caf9&color=fff";

function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [phrase, setPhrase] = useState("");
    const provider = new GoogleAuthProvider();

    // Google Login/Register
    const handleGoogleLogin = async () => {
        try {
            const result = await signInWithPopup(auth, provider);
            const current = result.user

            const userRef = doc(db, "users", current.uid);
            const snap = await getDoc(userRef);

            const photoURL = current.photoURL || DEFAULT_AVATAR;

            if (!snap.exists()) {
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

    // Loging in with Email
    const loginWithEmail = async () => {
        try {
            await signInWithEmailAndPassword(auth, email, password);

            setPhrase("");
            setEmail("");
            setPassword("");
        } catch (err) {
            if (err instanceof FirebaseError) {
                const code = err.code as string;
                switch (code) {
                    case "auth/user-not-found":
                    case "auth/wrong-password":
                    case "auth/invalid-credential":
                        setPhrase("Incorrect email or password.");
                    break;
                    default:
                        setPhrase("Login failed. Please try again.");
                        console.error("Login error:", err);
                }
            } else {
                console.error("Login error:", err);
            }
        }
    };
    
    return (
        <div className="login-page">
            <Nav />
            <div className="content-container">
                <LoginCard 
                    email={email} 
                    setEmail={setEmail} 
                    password={password}
                    setPassword={setPassword}
                    phrase={phrase}
                    setPhrase={setPhrase}
                    handleGoogleLogin={handleGoogleLogin}
                    loginWithEmail={loginWithEmail} 
                />
            </div>
        </div>
    )
}

export default LoginPage;