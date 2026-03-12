interface ProfileImgProps {
    src?: string;
    alt?: string;
    size?: string;
}

// Google profile photo URLs contain a size param like =s96-c.
// Bumping it to s400 gives a higher-res source that CSS scales down cleanly.
function optimizeSrc(src?: string): string | undefined {
    if (!src) return src;
    if (src.includes("googleusercontent.com")) {
        return src.replace(/=s\d+-c/, "=s400-c").replace(/=s\d+$/, "=s400");
    }
    return src;
}

export default function ProfileImg({ src, alt, size }: ProfileImgProps) {
    const imgSize = {
        "xxs": "size-8",
        "xs":  "size-14",
        "sm":  "size-24",
        "md":  "size-34",
        "lg":  "size-44"
    }[size || "md"];

    return (
        <img
            src={optimizeSrc(src)}
            alt={alt}
            className={`${imgSize} shrink-0 aspect-square ${!src ? "bg-[#e0e0e0]" : ""} object-cover rounded-full border`}
        />
    );
}
