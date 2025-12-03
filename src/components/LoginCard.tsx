import { motion } from "motion/react";
import { auth } from "../lib/firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { useLocation, useNavigate } from "react-router-dom";

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
    const navigate = useNavigate?.();
    const location = useLocation();
    const isLogin = location.pathname === '/login';
    
    const handleSwitch = () => {
        navigate(isLogin ? "/register" : "/login");
    };
    
    return (
        <motion.div 
            className="login-container" 
            style={auth.currentUser ? {opacity: '0'} : {opacity: '1'}}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.1 }}
        >
            <div className="title-container title-container-stay">
                <h2 className="title-main">Sign In</h2>
                <motion.a
                    onClick={handleSwitch}
                    onTap={handleSwitch}
                    className="link-btn" 
                    whileHover={{ cursor: 'pointer' }}
                >
                    Don't have an account? <span>Sign Up</span>
                </motion.a>
            </div>

            <form className="form-container" action={loginWithEmail} onSubmit={async (e) => {
                e.preventDefault();
                await loginWithEmail();
            }}>
                <input 
                    type="email" 
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-lg"
                    required
                />

                <input 
                    type="password" 
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-lg"
                    required
                />

                {phrase != "" && 
                    <motion.p className="phrase-error"
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.2 }}
                    >
                        {phrase}
                    </motion.p>
                }

                <motion.button 
                    className="button-md"
                >
                    Sign In
                </motion.button>
            </form>

            <p className="or">or sign in with</p>

            <button 
                onClick={handleGoogleLogin} 
                className="button-md"
            >
                <FontAwesomeIcon icon={faGoogle}/> Sign in with Google
            </button>
        </motion.div>
    )
}