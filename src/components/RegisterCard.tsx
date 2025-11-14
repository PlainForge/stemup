import { motion } from "motion/react";
import { auth } from "../firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";

interface RegisterCardProps {
    email: string;
    setEmail: (email: string) => void;
    password: string;
    setPassword: (password: string) => void;
    name: string,
    setName: (name: string) => void;
    phrase: string;
    setPhrase: (phrase: string) => void;
    registerWithEmail: () => Promise<void>;
    setSignInEmail: (value: boolean) => void;
}

export default function RegisterCard({email, setEmail, password, setPassword, name, setName, phrase, registerWithEmail, setSignInEmail}: RegisterCardProps) {
    return (
        <motion.div 
            className="register-container" 
            style={auth.currentUser ? {opacity: '0'} : {opacity: '1'}}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.1 }}
        >
            <h1 className="register-title">Create your account</h1>
            <form className="form-container" action={registerWithEmail} onSubmit={async (e) => {
                e.preventDefault();
                await registerWithEmail();
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

                <input 
                    type="name" 
                    placeholder="Display Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input"
                    maxLength={16} 
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
                    Register
                </motion.button>
            </form>

            <motion.button
                onClick={() => setSignInEmail(false)}
                onTap={() => setSignInEmail(false)}
                className="back-button"
                whileHover={{y: -2, cursor: 'pointer'}}
            >
                <FontAwesomeIcon icon={faArrowLeft}/> Go Back
            </motion.button>
        </motion.div>
    )
}