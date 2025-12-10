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
            <div className="w-2/3 flex-col items-center justify-center space-y-2 hidden md:flex lg:flex">
                <div className="top">
                    <div className="text-center">
                        <h1 className="text-4xl md:text-6xl lg:text-8xl font-bold">StemUp</h1>
                        <p className="">Track all your tasks and gain points and rewards from your role</p>
                    </div>
                </div>
                <div className="flex flex-col items-center justify-center gap-2">
                    <h1 className=""><span className="text-blue-600 font-bold">UMass Boston</span> x <span className="text-red-600 font-bold">UMass Amherst</span> Gamification Platform</h1>
                    <div className="bg-gray-100 p-6 rounded-lg">
                        <h1 className="text-center font-bold">HOW TO PLAY STEMUP</h1>
                        <ul className="list-disc">
                            <li>Regularly check and complete your tasks</li>
                            <li>Track your progress</li>
                            <li><span>Level UP</span> on the leaderboard</li>
                        </ul>
                    </div>
                </div>
            </div>
            <div className="w-full flex flex-col items-center justify-center bg-slate-700 text-white md:w-1/3 lg:w-1/3">
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
                        className="flex flex-col gap-2 items-center justify-center"
                        initial={{ y: 50, opacity: 0}}
                        animate={{ y: 0, opacity: 1}}
                        transition={{ duration: 0.1 }}
                    >
                        <h1 className="">Create your account</h1>
                        <Button 
                            size="md"
                            onClick={handleGoogleLogin} 
                        >
                            Connect with <FontAwesomeIcon icon={faGoogle}/>
                        </Button>
                        <Button 
                            size="md"
                            onClick={() => setSignInEmail(true)}
                        >
                            Continue with email
                        </Button>
                        <LinkButton onClick={handleSwitch}>
                            Already have an account? <span>Sign In</span>
                        </LinkButton>
                    </motion.div>
                }
            </div>
        </div>
    )
}