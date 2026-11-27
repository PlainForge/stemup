import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown, faMagnifyingGlass, faUserPlus, faUsers } from "@fortawesome/free-solid-svg-icons";
import ProfileImg from "./ProfileImg";

export type PickablePerson = { uid: string; name: string; photoURL?: string; hint?: string };

interface Props {
    people: PickablePerson[];
    /** The picked person, or "" for none (the placeholder shows) */
    value: string;
    onChange: (uid: string) => void;
    placeholder: string;
    /** Accessible name, e.g. "Instructor to add" */
    label: string;
    /** uids already chosen elsewhere (e.g. selected for a task); they show a check */
    chosen?: string[];
    /** Keep showing the placeholder after a pick (for adding several people one at a time) */
    resetAfterPick?: boolean;
    emptyText?: string;
    /** Use as a filter: adds an "everyone" row with this label at the top, picked as "" */
    allLabel?: string;
    /** "gray" matches the gray-filled inputs in filter bars; "white" (default) matches cards */
    tone?: "white" | "gray";
}

/**
 * Styled person dropdown with photos and a search box, in place of a native
 * <select>. Keyboard: arrows move, Enter picks, Esc closes; typing filters.
 */
export default function PersonPicker({ people, value, onChange, placeholder, label, chosen = [], resetAfterPick = false, emptyText = "No one to pick.", allLabel, tone = "white" }: Props) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [active, setActive] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const listId = useId();

    const selected = resetAfterPick ? undefined : people.find(p => p.uid === value);
    const q = search.trim().toLowerCase();
    const matches = q ? people.filter(p => p.name.toLowerCase().includes(q)) : people;
    // As a filter, the "everyone" row comes first (hidden while searching)
    const ALL: PickablePerson = { uid: "", name: allLabel ?? "" };
    const shown = allLabel !== undefined && !q ? [ALL, ...matches] : matches;

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        searchRef.current?.focus();
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    const openList = () => {
        setSearch("");
        setActive(allLabel !== undefined ? (value ? people.findIndex(p => p.uid === value) + 1 : 0) : Math.max(0, people.findIndex(p => p.uid === value)));
        setOpen(true);
    };

    const pick = (p: PickablePerson | undefined) => {
        if (!p) return;
        onChange(p.uid);
        setOpen(false);
        buttonRef.current?.focus();
    };

    const onKeyDown = (e: KeyboardEvent) => {
        if (!open) {
            if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
                e.preventDefault();
                openList();
            }
            return;
        }
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setActive(i => (shown.length ? (i + 1) % shown.length : 0));
                break;
            case "ArrowUp":
                e.preventDefault();
                setActive(i => (shown.length ? (i - 1 + shown.length) % shown.length : 0));
                break;
            case "Enter":
                e.preventDefault();
                pick(shown[active]);
                break;
            case "Escape":
                e.preventDefault();
                setOpen(false);
                buttonRef.current?.focus();
                break;
            case "Tab":
                setOpen(false);
                break;
        }
    };

    return (
        <div ref={rootRef} className="relative w-full" onKeyDown={onKeyDown}>
            <button
                ref={buttonRef}
                type="button"
                aria-label={label}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                onClick={() => (open ? setOpen(false) : openList())}
                className={`group flex w-full items-center gap-3 rounded-xl border ${tone === "gray" ? "bg-gray-50" : "bg-white"} ${allLabel !== undefined ? "py-2" : "py-2.5"} px-3 text-left text-sm transition-all hover:cursor-pointer focus:outline-none ${
                    open ? "border-blue-400 ring-4 ring-blue-500/10" : "border-gray-200 hover:border-gray-400 focus-visible:border-blue-400"
                }`}
            >
                {selected ? (
                    <ProfileImg src={selected.photoURL} alt={selected.name} size="xxs" />
                ) : allLabel !== undefined ? (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        <FontAwesomeIcon icon={faUsers} className="text-[10px]" />
                    </span>
                ) : (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                        <FontAwesomeIcon icon={faUserPlus} className="text-xs" />
                    </span>
                )}
                <span className={`min-w-0 flex-1 truncate ${selected ? "font-medium" : allLabel !== undefined ? "" : "text-gray-500"}`}>{selected?.name ?? allLabel ?? placeholder}</span>
                <FontAwesomeIcon icon={faChevronDown} className={`shrink-0 text-xs text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                    <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                        <FontAwesomeIcon icon={faMagnifyingGlass} className="text-xs text-gray-400" />
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={e => { setSearch(e.target.value); setActive(0); }}
                            placeholder="Search by name..."
                            aria-label="Search people"
                            className="w-full bg-transparent text-sm focus:outline-none"
                        />
                    </div>
                    <ul id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto p-1">
                        {shown.length === 0 ? (
                            <li className="px-3 py-3 text-center text-sm text-gray-400">{people.length === 0 ? emptyText : "No matches."}</li>
                        ) : shown.map((p, i) => {
                            const isChosen = p.uid === value || chosen.includes(p.uid);
                            if (p === ALL) return (
                                <li
                                    key="__all"
                                    role="option"
                                    aria-selected={!value}
                                    onPointerEnter={() => setActive(i)}
                                    onClick={() => pick(ALL)}
                                    className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:cursor-pointer ${i === active ? "bg-gray-100" : ""}`}
                                >
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                                        <FontAwesomeIcon icon={faUsers} className="text-xs" />
                                    </span>
                                    <span className={`min-w-0 flex-1 truncate ${!value ? "font-medium" : ""}`}>{allLabel}</span>
                                    {!value && <FontAwesomeIcon icon={faCheck} className="shrink-0 text-xs text-blue-600" />}
                                </li>
                            );
                            return (
                                <li
                                    key={p.uid}
                                    role="option"
                                    aria-selected={isChosen}
                                    onPointerEnter={() => setActive(i)}
                                    onClick={() => pick(p)}
                                    className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:cursor-pointer ${i === active ? "bg-gray-100" : ""}`}
                                >
                                    <ProfileImg src={p.photoURL} alt={p.name} size="xxs" />
                                    <span className="min-w-0 flex-1">
                                        <span className={`block truncate ${isChosen ? "font-medium" : ""}`}>{p.name}</span>
                                        {p.hint && <span className="block truncate text-xs text-gray-400">{p.hint}</span>}
                                    </span>
                                    {isChosen && <FontAwesomeIcon icon={faCheck} className="shrink-0 text-xs text-blue-600" />}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
