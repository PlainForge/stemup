interface ProfileImgProps {
    src?: string;
    alt?: string;
    size?: string;
}

export default function ProfileImg({ src, alt, size} : ProfileImgProps) {
    const imgSize = {
        "xxs": "size-8",
        "xs": "size-14",
        "sm": "size-24",
        "md": "size-34",
        "lg": "size-44"
    }[size || "md"]
    return (
        <img 
            src={src}
            alt={alt}
            className={
                `
                    ${imgSize} 
                    ${!src ? 'bg-[#e0e0e0]' : ''} 
                    object-cover rounded-full border
                `
            }
        />
    )
}