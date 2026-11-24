import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown, type IconDefinition } from "@fortawesome/free-solid-svg-icons";

export interface DropdownOption<T extends string> {
    value: T;
    label: string;
    icon?: IconDefinition;
}

interface DropdownProps<T extends string> {
    value: T;
    options: DropdownOption<T>[];
    onChange: (value: T) => void;
    /** Accessible name, e.g. "Appearance" */
    label: string;
    id?: string;
}

/**
 * Styled replacement for <select>: the button and its list share the same card
 * background (and follow dark mode), which a native select can't do reliably.
 * Keyboard: Enter/Space/Arrow keys open, arrows move, Enter picks, Esc closes.
 */
export default function Dropdown<T extends string>({ value, options, onChange, label, id }: DropdownProps<T>) {
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const listId = useId();
    const selectedIndex = Math.max(0, options.findIndex(o => o.value === value));
    const selected = options[selectedIndex];

    // Close when clicking or tapping outside
    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    const openList = () => {
        setActive(selectedIndex);
        setOpen(true);
    };

    const pick = (i: number) => {
        onChange(options[i].value);
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
                setActive(i => (i + 1) % options.length);
                break;
            case "ArrowUp":
                e.preventDefault();
                setActive(i => (i - 1 + options.length) % options.length);
                break;
            case "Home":
                e.preventDefault();
                setActive(0);
                break;
            case "End":
                e.preventDefault();
                setActive(options.length - 1);
                break;
            case "Enter":
            case " ":
                e.preventDefault();
                pick(active);
                break;
            case "Escape":
            case "Tab":
                setOpen(false);
                break;
        }
    };

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button
                ref={buttonRef}
                id={id}
                type="button"
                aria-label={label}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-activedescendant={open ? `${listId}-${active}` : undefined}
                onClick={() => (open ? setOpen(false) : openList())}
                onKeyDown={onKeyDown}
                className={`flex items-center gap-2 min-w-40 bg-white border rounded-xl pl-3 pr-3 py-2 text-sm hover:cursor-pointer transition-colors focus:outline-none ${
                    open ? "border-gray-400" : "border-gray-200 hover:border-gray-300 focus-visible:border-gray-400"
                }`}
            >
                {selected?.icon && <FontAwesomeIcon icon={selected.icon} className="w-4 text-gray-500" />}
                <span className="flex-1 text-left">{selected?.label}</span>
                <FontAwesomeIcon
                    icon={faChevronDown}
                    className={`text-xs text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
                />
            </button>

            {open && (
                <ul
                    id={listId}
                    role="listbox"
                    aria-label={label}
                    className="absolute right-0 z-30 mt-1.5 w-full min-w-40 bg-white border border-gray-200 rounded-xl shadow-lg p-1 flex flex-col gap-0.5"
                >
                    {options.map((option, i) => {
                        const isSelected = option.value === value;
                        return (
                            <li
                                key={option.value}
                                id={`${listId}-${i}`}
                                role="option"
                                aria-selected={isSelected}
                                onPointerEnter={() => setActive(i)}
                                onClick={() => pick(i)}
                                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm hover:cursor-pointer transition-colors ${
                                    i === active ? "bg-gray-100" : ""
                                } ${isSelected ? "font-medium" : ""}`}
                            >
                                {option.icon && <FontAwesomeIcon icon={option.icon} className="w-4 text-gray-500" />}
                                <span className="flex-1">{option.label}</span>
                                {isSelected && <FontAwesomeIcon icon={faCheck} className="text-xs text-blue-600" />}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
