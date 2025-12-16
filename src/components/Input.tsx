interface InputProps {
    size?: string;
    id?: string;
    name?: string;
    type: string;
    placeholder?: string;
    value?: string;
    setValue?: (value: string) => void;
    required: boolean;
    autocomplete: string;
    maxLength?: number;
}

export default function Input({size, id, name, type, placeholder, value, setValue, required, maxLength, autocomplete}: InputProps) {
    if (size === undefined || size === "") size = "md";
    if (setValue === undefined) setValue = () => {};
    const sizeClass = {
        sm: "w-32 lg:w-52",
        md: "w-52 lg:w-72",
        lg: "w-72 lg:2-92",
        full: "w-full"
    }[size];
    return (
        <input 
            type={type} 
            id={id}
            name={name}
            placeholder={placeholder}
            value={value}
            onChange={(e) => {setValue(e.target.value)}}
            className={`
                ${sizeClass}
                px-2 py-2 rounded-xl 
                inset-shadow-sm inset-shadow-indigo-300 
                bg-white border-2 border-[rgba(0,0,0,0)] 
                hover:border-[rgba(0,0,0,0.3)] 
                focus:border-[rgba(0,0,0,0.3)] 
                focus:outline-none
                transition-all duration-200`}
            required={required}
            maxLength={maxLength}
            autoComplete={autocomplete}
        />
    )
}