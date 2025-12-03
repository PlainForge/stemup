import { useState } from "react";
import { GoogleAuthProvider } from "firebase/auth";
import "./styles/loginPage.css";
import { FirebaseError } from "firebase/app";
import LoginCard from "../components/LoginCard.tsx";
import { firebaseAuthService } from "../lib/firebaseService.ts";
import { useNavigate } from "react-router-dom";


export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [phrase, setPhrase] = useState("");
    const provider = new GoogleAuthProvider();
    const navigate = useNavigate?.();

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
    
    return (
        <div className="login-page">
            <div className="content-container">
                <h2 className="title-main">StemUp</h2>
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