import { useContext, useState } from "react";
import { GoogleAuthProvider } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import LoginCard from "../components/LoginCard.tsx";
import { firebaseAuthService } from "../lib/firebaseService.ts";
import { useNavigate } from "react-router-dom";
import { MainContext } from "../context/MainContext.ts";


export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [phrase, setPhrase] = useState("");
    const provider = new GoogleAuthProvider();
    const navigate = useNavigate?.();
    const context = useContext(MainContext);
    const user = context?.user ?? null;

    // Google Login/Register
    const handleGoogleLogin = async () => {
        try {
            await firebaseAuthService.signInWithGoogle(provider);
            navigate("/");
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
            await firebaseAuthService.loginWithEmail(email, password);
            navigate("/");
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
    
    if (user != null) navigate("/");
    return (
        <div className="w-screen h-screen bg-linear-to-r from-blue-400 to-blue-100 flex flex-col items-center justify-center">
            <div className="h-screen w-full flex flex-col items-center justify-center gap-4">
                <h2 className="text-8xl">StemUp</h2>
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