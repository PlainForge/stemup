import { useState } from "react";
import { GoogleAuthProvider } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import RegisterCard from "../components/RegisterCard";
import { motion } from "motion/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import "./styles/registerPage.css"
import { firebaseAuthService } from "../lib/firebaseService";
import { useLocation, useNavigate } from "react-router-dom";

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
        <div className="register-page">
            <div className="left-side">
                <div className="top">
                    <div className="title-container">
                        <h1 className="title-main text-center">StemUp</h1>
                        <p className="sub-title">Track all your tasks and gain points and rewards from your role</p>
                    </div>
                </div>
                <div className="bottom">
                    <h1 className="sub-title"><span className="umb-title">UMass Boston</span> x <span className="uma-title">UMass Amherst</span> Gamification Platform</h1>
                    <div className="how-to-container">
                        <h1 className="title-card text-center">HOW TO PLAY STEMUP</h1>
                        <ul>
                            <li>Regularly check and complete your tasks</li>
                            <li>Track your progress</li>
                            <li><span>Level UP</span> on the leaderboard</li>
                        </ul>
                    </div>
                </div>
            </div>
            <div className="right-side">
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
                        <motion.a
                            onClick={handleSwitch}
                            onTap={handleSwitch}
                            className="link-btn"
                            id="reg-buttons" 
                            whileHover={{ cursor: 'pointer' }}
                        >
                            Already have an account? <span>Sign In</span>
                        </motion.a>
                    </motion.div>
                }
            </div>
        </div>
    )
}