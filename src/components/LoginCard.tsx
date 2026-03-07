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
            className="w-full flex flex-col gap-5 bg-white rounded-2xl shadow-md p-8"
            style={auth.currentUser ? {opacity: '0'} : {opacity: '1'}}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.15 }}
        >
            <div>
                <h2 className="text-2xl font-bold">Sign In</h2>
                <p className="text-sm text-gray-500 mt-1">
                    Don't have an account?{" "}
                    <LinkButton onClick={handleSwitch}>Sign Up</LinkButton>
                </p>
            </div>

            <form className="flex flex-col gap-3" action={loginWithEmail} onSubmit={async (e) => {
                e.preventDefault();
                await loginWithEmail();
            }}>
                <Input
                    size="full"
                    type="email"
                    placeholder="Email"
                    value={email}
                    setValue={setEmail}
                    required={true}
                    autocomplete="false"
                />
                <Input
                    size="full"
                    type="password"
                    placeholder="Password"
                    value={password}
                    setValue={setPassword}
                    required
                    autocomplete="true"
                />
                {phrase !== "" &&
                    <ErrorMessage>{phrase}</ErrorMessage>
                }
                <Button size="full">Sign In</Button>
            </form>

            <div className="flex items-center gap-3 text-gray-400 text-sm">
                <div className="flex-1 h-px bg-gray-200" />
                <span>or</span>
                <div className="flex-1 h-px bg-gray-200" />
            </div>

            <Button size="full" onClick={handleGoogleLogin}>
                <FontAwesomeIcon icon={faGoogle} className="mr-2" />
                Continue with Google
            </Button>
        </motion.div>
    )
}