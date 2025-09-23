import { useState, type ComponentState } from "react";
import { auth, db, storage} from "../firebase.ts";
import { signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider } from "firebase/auth";
import { arrayUnion, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import "../styles/loginBox.css";
import '../styles/global.css'
import { FirebaseError } from "firebase/app";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

const DEFAULT_AVATAR = "https://ui-avatars.com/api/?name=User&background=90caf9&color=fff";

interface props {
    setPage: ComponentState
}

function LoginBox({ setPage } : props) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [isRegistered, setIsRegistered] = useState(false);
    const [phrase, setPhrase] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const provider = new GoogleAuthProvider();

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
                    photoURL: photoURL
                });

                await updateDoc(doc(db, "roles", 'r3wUbRSCX7cxwBYhtAdg'), {
                    members: arrayUnion(current.uid)
                })
                setPage("home")
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
                setPage("home")
            }

            setPhrase("");
            setEmail("");
            setPassword("");
            setName("");
            setFile(null);
        } catch (err) {
            if (err instanceof FirebaseError && err.code === "auth/email-already-in-use") {
                setPhrase("This email is already registered. Please login instead.");
            } else {
                console.error("Registration error:", err);
            }
        }
    };

    // Registering with Email
    const registerWithEmail = async () => {
        try {
            if (!email || !password || !name) {
                alert("Please fill in all fields.");
                return;
            }

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const current = userCredential.user;
            let photoURL = DEFAULT_AVATAR;

            if (file) {
                const storageRef = ref(storage, `profilePictures/${current.uid}`);
                await uploadBytes(storageRef, file);
                photoURL = await getDownloadURL(storageRef);
            }

            await setDoc(doc(db, "users", current.uid), {
                email: current.email,
                name: name,
                roles: [{id: 'r3wUbRSCX7cxwBYhtAdg', name: 'global', points: 0, taskCompleted: 0}],
                createdAt: new Date(),
                points: 0,
                taskCompleted: 0,
                photoURL: photoURL
            });

            await updateDoc(doc(db, "roles", 'r3wUbRSCX7cxwBYhtAdg'), {
                members: arrayUnion(current.uid)
            })
            setPage("home")

            setPhrase("");
            setEmail("");
            setPassword("");
            setName("");
            setFile(null);
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

            setPage("home")
            setPhrase("");
            setEmail("");
            setPassword("");
            setName("");
            setFile(null);
        } catch (err) {
            if (err instanceof FirebaseError) {
                const code = err.code as string;
                switch (code) {
                    case "auth/user-not-found":
                    case "auth/wrong-password":
                    case "auth/invalid-credential":
                        setPhrase("Email or password is incorrect.");
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
        <div className="login-container" style={auth.currentUser ? {opacity: '0'} : {opacity: '1'}}>
            <h1>{isRegistered ? "Register": "Login"}</h1>
            <p>{phrase}</p>
            <form className="form-container" action={isRegistered ? registerWithEmail : loginWithEmail} onSubmit={async (e) => {
                e.preventDefault();
                if (isRegistered) {
                    await registerWithEmail();
                } else {
                    await loginWithEmail();
                }
            }}>
                <input 
                    type="email" 
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                />

                <input 
                    type="password" 
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                />

                {isRegistered ? 
                    <input 
                        type="name" 
                        placeholder="Display Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input"
                        maxLength={16} 
                /> : null}

                {isRegistered ? 
                <div className="photo-container">
                    <label htmlFor="myFile">Choose your photo</label>
                    <input 
                        itemID="myFile"
                        id="myFile"
                        name="myFile"
                        type="file" 
                        accept="image/*" 
                        onChange={(e) => setFile(e.target.files?.[0] || null)} 
                        className="photo-button"
                    />
                </div> : null}

                {isRegistered ? 
                    <button className="button">Register</button> :
                    <button className="button">Login</button>
                }
            </form>
            

            <button onClick={handleGoogleLogin} className="button">Sign in with Google <FontAwesomeIcon icon={faGoogle}/></button>

            {/* Toggle Register/Login */}
            <p>
                {isRegistered ? "Already have an account?" : "Don’t have an account?"}{" "}
                <button type="button" className="button" onClick={() => {
                    setIsRegistered(!isRegistered);
                    setPhrase("");
                }}>
                {isRegistered ? "Login" : "Register"}
                </button>
            </p>
        </div>
    )
}

export default LoginBox;