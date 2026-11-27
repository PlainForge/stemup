import { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays, faChevronDown, faChevronLeft, faChevronRight, faXmark } from "@fortawesome/free-solid-svg-icons";

/** "YYYY-MM-DD" in local time (the same format as <input type="date">) */
const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromKey = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface Props {
    /** "YYYY-MM-DD", or "" for no date */
    value: string;
    onChange: (value: string) => void;
    /** Earliest pickable day ("YYYY-MM-DD") */
    min?: string;
    placeholder?: string;
    /** Also renders a hidden input with this name, for forms read with FormData */
    name?: string;
    /** Which edge the calendar lines up with (use "right" when the field sits at the right of a row) */
    align?: "left" | "right";
    label?: string;
}

/**
 * Styled replacement for <input type="date">: a field showing the chosen day,
 * opening a calendar with quick picks (Today, Tomorrow, Next week) and Clear.
 * Follows dark mode through the app's gray and white overrides.
 */
export default function DatePicker({ value, onChange, min, placeholder = "No due date", name, align = "left", label = "Due date" }: Props) {
    const [open, setOpen] = useState(false);
    const today = new Date();
    const selected = value ? fromKey(value) : null;
    const [month, setMonth] = useState(() => {
        const base = selected ?? today;
        return new Date(base.getFullYear(), base.getMonth(), 1);
    });
    const rootRef = useRef<HTMLDivElement>(null);
    const dialogId = useId();
    const minDate = min ? fromKey(min) : null;

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const toggle = () => {
        if (!open) {
            const base = selected ?? today;
            setMonth(new Date(base.getFullYear(), base.getMonth(), 1));
        }
        setOpen(o => !o);
    };

    const disabled = (d: Date) => !!minDate && d < minDate;
    const pick = (d: Date) => {
        if (disabled(d)) return;
        onChange(toKey(d));
        setOpen(false);
    };

    // Six weeks, starting on the Sunday on or before the 1st
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    const prevDisabled = !!minDate && new Date(month.getFullYear(), month.getMonth(), 0) < minDate;

    const shown = selected?.toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        ...(selected.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
    });
    const quick = [
        { label: "Today", date: today },
        { label: "Tomorrow", date: addDays(today, 1) },
        { label: "Next week", date: addDays(today, 7) },
    ];

    return (
        <div ref={rootRef} className="relative w-full min-w-0">
            {name && <input type="hidden" name={name} value={value} />}
            <div
                className={`group flex w-full items-center gap-2.5 rounded-xl border bg-white px-3 py-2 text-sm transition-all ${
                    open ? "border-blue-400 ring-4 ring-blue-500/10" : "border-gray-200 hover:border-gray-400"
                }`}
            >
                <button
                    type="button"
                    onClick={toggle}
                    aria-label={label}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-controls={open ? dialogId : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left hover:cursor-pointer focus:outline-none"
                >
                    <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors ${selected ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white"}`}>
                        <FontAwesomeIcon icon={faCalendarDays} className="text-xs" />
                    </span>
                    <span className={`min-w-0 flex-1 truncate ${selected ? "font-medium" : "text-gray-500"}`}>{shown ?? placeholder}</span>
                </button>
                {selected ? (
                    <button
                        type="button"
                        onClick={() => onChange("")}
                        aria-label="Clear date"
                        className="flex size-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors hover:cursor-pointer"
                    >
                        <FontAwesomeIcon icon={faXmark} className="text-xs" />
                    </button>
                ) : (
                    <FontAwesomeIcon icon={faChevronDown} className={`shrink-0 text-xs text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
                )}
            </div>

            {open && (
                <div
                    id={dialogId}
                    role="dialog"
                    aria-label={label}
                    className={`absolute ${align === "right" ? "right-0" : "left-0"} z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white p-3 shadow-lg`}
                >
                    <div className="flex gap-1.5 mb-3">
                        {quick.map(q => (
                            <button
                                key={q.label}
                                type="button"
                                disabled={disabled(q.date)}
                                onClick={() => pick(q.date)}
                                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors hover:cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                    value === toKey(q.date) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                            >
                                {q.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center justify-between mb-2">
                        <button
                            type="button"
                            onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                            disabled={prevDisabled}
                            aria-label="Previous month"
                            className="flex size-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors hover:cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <FontAwesomeIcon icon={faChevronLeft} className="text-xs" />
                        </button>
                        <p className="text-sm font-semibold">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
                        <button
                            type="button"
                            onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                            aria-label="Next month"
                            className="flex size-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors hover:cursor-pointer"
                        >
                            <FontAwesomeIcon icon={faChevronRight} className="text-xs" />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-0.5 text-center">
                        {WEEKDAYS.map(w => (
                            <span key={w} className="text-[11px] font-semibold text-gray-400 py-1">{w}</span>
                        ))}
                        {days.map(d => {
                            const key = toKey(d);
                            const inMonth = d.getMonth() === month.getMonth();
                            const isSelected = key === value;
                            const isToday = key === toKey(today);
                            const off = disabled(d);
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => pick(d)}
                                    disabled={off}
                                    aria-label={d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                                    aria-pressed={isSelected}
                                    className={`relative mx-auto flex size-9 items-center justify-center rounded-full text-sm transition-colors ${
                                        off
                                            ? "text-gray-300 cursor-not-allowed"
                                            : isSelected
                                            ? "bg-blue-600 text-white font-semibold hover:cursor-pointer"
                                            : `${inMonth ? "text-gray-800" : "text-gray-400"} hover:bg-gray-100 hover:cursor-pointer`
                                    } ${isToday && !isSelected ? "font-semibold text-blue-600" : ""}`}
                                >
                                    {d.getDate()}
                                    {isToday && !isSelected && <span className="absolute bottom-1 size-1 rounded-full bg-blue-600" />}
                                </button>
                            );
                        })}
                    </div>

                    {value && (
                        <button
                            type="button"
                            onClick={() => { onChange(""); setOpen(false); }}
                            className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors hover:cursor-pointer"
                        >
                            Clear date
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
