import { useEffect, useState } from "react";

interface thisProps {
    register: boolean,
    setRegister: (value: boolean) => void,
}

/*
    Get Login Page State
*/
export default function useLoginRegisterState(): thisProps {
    const [register, setRegister] = useState<boolean>(false);

    useEffect(() => {
      setRegister(register);
      console.log(register);
    }, [register])

    return {register, setRegister}
}