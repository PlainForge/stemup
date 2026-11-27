interface ProfileImgProps {
    src?: string;
    alt?: string;
    size?: string;
}

// Google profile photo URLs contain a size param like =s96-c.
// Bumping it to s400 gives a higher-res source that CSS scales down cleanly.
// Placeholder avatars are stored as ui-avatars URLs with name=User; the
// person's real name is swapped in at render time so the initials match
// (and follow name changes) without touching stored data.
function optimizeSrc(src?: string, name?: string): string | undefined {
    if (!src) return src;
    if (src.includes("googleusercontent.com")) {
        return src.replace(/=s\d+-c/, "=s400-c").replace(/=s\d+$/, "=s400");
    }
    // The default avatar service returns 64px unless asked for more
    if (src.includes("ui-avatars.com")) {
        try {
            const url = new URL(src);
            url.searchParams.set("size", "512");
            if (name?.trim()) url.searchParams.set("name", name.trim());
            return url.toString();
        } catch {
            return src;
        }
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
            src={optimizeSrc(src, alt)}
            alt={alt}
            // Google's photo servers can refuse hotlinked images that send a referrer
            referrerPolicy="no-referrer"
            // max-w-none: the base img { max-width: 100% } let a shrink-to-fit parent (a button,
            // on mobile Safari) squeeze the width but not the height, turning the circle into an oval
            className={`${imgSize} shrink-0 max-w-none aspect-square ${!src ? "bg-[#e0e0e0]" : ""} object-cover rounded-full border`}
        />
    );
}
