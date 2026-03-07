import { useContext, useEffect, useState } from "react";
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

    useEffect(() => {
        if (user) {
            navigate("/");
        }
    })

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
        <div className="w-screen h-screen flex">
            {/* Left branding panel */}
            <div className="hidden md:flex w-1/2 bg-linear-to-br from-blue-600 to-indigo-700 flex-col items-center justify-center p-12 text-white">
                <h1 className="text-5xl font-bold mb-3">StemUp</h1>
                <p className="text-blue-100 text-center text-base mb-8 max-w-xs">
                    Track tasks, earn points, and level up on the leaderboard.
                </p>
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 w-full max-w-xs">
                    <h2 className="font-semibold mb-3 text-sm uppercase tracking-widest text-blue-200">How it works</h2>
                    <ul className="space-y-2 text-sm text-blue-50">
                        <li className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">1</span>
                            Complete your assigned tasks
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">2</span>
                            Earn points for each completion
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">3</span>
                            Climb the monthly leaderboard
                        </li>
                    </ul>
                </div>
                <p className="mt-8 text-blue-300 text-xs">
                    <span className="text-white font-semibold">UMass Boston</span>
                    {" "}&times;{" "}
                    <span className="text-white font-semibold">UMass Amherst</span>
                </p>
            </div>

            {/* Right form panel */}
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 px-6 py-10">
                <div className="md:hidden mb-8 text-center">
                    <h1 className="text-4xl font-bold">StemUp</h1>
                    <p className="text-gray-500 text-sm mt-1">Gamification Platform</p>
                </div>
                <div className="w-full max-w-sm">
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
        </div>
    )
}