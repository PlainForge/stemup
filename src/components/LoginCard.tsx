import { motion } from "motion/react";
import { auth } from "../firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";

interface LoginCardProps {
    email: string;
    setEmail: (email: string) => void;
    password: string;
    setPassword: (password: string) => void;
    phrase: string;
    setPhrase: (phrase: string) => void;
    handleGoogleLogin: () => Promise<void>;
    loginWithEmail: () => Promise<void>;
}

export default function LoginCard({email, setEmail, password, setPassword, phrase, handleGoogleLogin, loginWithEmail}: LoginCardProps) {
    return (
        <motion.div 
            className="login-container" 
            style={auth.currentUser ? {opacity: '0'} : {opacity: '1'}}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.1 }}
        >
            <h2 className="login-title">Sign in to your account</h2>
            <p className="welcome-phrase">Welcome back User</p>

            <button 
                onClick={handleGoogleLogin} 
                className="google-signin-button"
            >
                <FontAwesomeIcon icon={faGoogle}/> Sign in with Google
            </button>

            <p>or</p>

            <form className="form-container" action={loginWithEmail} onSubmit={async (e) => {
                e.preventDefault();
                await loginWithEmail();
            }}>
                <input 
                    type="email" 
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    required
                />

                <input 
                    type="password" 
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                    required
                />

                {phrase != "" && 
                    <motion.p className="phrase"
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.2 }}
                    >
                        {phrase}
                    </motion.p>
                }

                <motion.button 
                    className="button"
                    whileHover={{cursor: 'pointer', backgroundColor: 'rgb(var(--primary-hover))', color: 'rgb(var(--background))'}}
                >
                    Sign In
                </motion.button>
            </form>
        </motion.div>
    )
}