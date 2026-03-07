import { useState } from "react";
import { GoogleAuthProvider } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import RegisterCard from "../components/RegisterCard";
import { motion } from "motion/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { firebaseAuthService } from "../lib/firebaseService";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import LinkButton from "../components/LinkButton";

export default function RegisterPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [phrase, setPhrase] = useState("");
    const [signInEmail, setSignInEmail] = useState<boolean>(false);
    const provider = new GoogleAuthProvider();
    const navigate = useNavigate?.();
    const location = useLocation();
    const isLogin = location.pathname === '/login';

    const registerWithEmail = async () => {
        try {
            await firebaseAuthService.registerWithEmail(email, password, name);
            navigate("/");
            setEmail("");
            setPassword("");
            setName("");
            setPhrase("");
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

    const handleSwitch = () => {
        navigate(isLogin ? "/register" : "/login");
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
                    {signInEmail ?
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
                            className="flex flex-col gap-5 bg-white rounded-2xl shadow-md p-8"
                            initial={{ y: 30, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ duration: 0.15 }}
                        >
                            <div>
                                <h2 className="text-2xl font-bold">Create account</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Already have an account?{" "}
                                    <LinkButton onClick={handleSwitch}>Sign In</LinkButton>
                                </p>
                            </div>
                            <div className="flex flex-col gap-3">
                                <Button size="full" onClick={handleGoogleLogin}>
                                    <FontAwesomeIcon icon={faGoogle} className="mr-2" />
                                    Continue with Google
                                </Button>
                                <Button size="full" onClick={() => setSignInEmail(true)}>
                                    Continue with email
                                </Button>
                            </div>
                        </motion.div>
                    }
                </div>
            </div>
        </div>
    )
}