/** A person's About Me, as shown on their cards and user pages. Renders nothing when it's empty. */
export default function AboutMeBlock({ text, className = "" }: { text?: string; className?: string }) {
    const about = text?.trim();
    if (!about) return null;
    return (
        <div className={`w-full rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-left ${className}`}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1">About Me</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">{about}</p>
        </div>
    );
}
