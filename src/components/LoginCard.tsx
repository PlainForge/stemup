import { motion } from "motion/react";
import { auth } from "../lib/firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "./Button";
import LinkButton from "./LinkButton";
import Input from "./Input";
import ErrorMessage from "./ErrorMessage";

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
            className="w-full flex flex-col items-center justify-center gap-3" 
            style={auth.currentUser ? {opacity: '0'} : {opacity: '1'}}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.1 }}
        >
            <div className="w-sm flex flex-col items-center justify-center">
                <h2 className="text-2xl text-center">Sign In</h2>
                <LinkButton onClick={handleSwitch}>
                    Don't have an account? <span>Sign Up</span>
                </LinkButton>
            </div>

            <form className="w-full flex flex-col items-center justify-center gap-2" action={loginWithEmail} onSubmit={async (e) => {
                e.preventDefault();
                await loginWithEmail();
            }}>
                <Input 
                    size="md"
                    type="email" 
                    placeholder="Email"
                    value={email}
                    setValue={setEmail}
                    required={true}
                    autocomplete="false"
                />

                <Input 
                    size="md"
                    type="password" 
                    placeholder="Password"
                    value={password}
                    setValue={setPassword}
                    required
                    autocomplete="true"
                />

                {phrase != "" && 
                    <ErrorMessage>{phrase}</ErrorMessage>
                }

                <Button size="md">
                    Sign In
                </Button>
            </form>

            <p className="w-sm text-center">or sign in with</p>

            <Button size="md" onClick={handleGoogleLogin}>
                Sign in with <FontAwesomeIcon icon={faGoogle} />
            </Button>
        </motion.div>
    )
}