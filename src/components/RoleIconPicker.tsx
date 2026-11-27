import { useContext, useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faHourglassHalf } from "@fortawesome/free-solid-svg-icons";
import { db } from "../lib/firebase";
import { MainContext } from "../context/MainContext";
import { canChangeRole, roleOwner, roleService } from "../lib/roleService";
import { ROLE_COLORS, ROLE_ICON_GROUPS, roleLook } from "../lib/roleIcons";
import { alertDialog } from "../lib/confirm";
import type { Role, StemRequest } from "../myDataTypes";
import RoleIcon from "./RoleIcon";
import Button from "./Button";

/**
 * Choosing a role's icon and color from the built-in set (nothing can be uploaded).
 * Admins and the role's owner save it straight away; its other instructors send
 * the owner a request (or admins, when the role has no owner).
 */
export default function RoleIconPicker({ role }: { role: Role }) {
    const context = useContext(MainContext);
    const me = context?.user?.uid ?? "";
    const myName = context?.userData?.name ?? "";
    const canChange = canChangeRole(role, me, context?.admins ?? []);
    const current = roleLook(role);
    const [icon, setIcon] = useState(current.icon.key);
    const [color, setColor] = useState(current.color.key);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [pending, setPending] = useState<StemRequest | null>(null);

    // An icon change this person already asked for
    useEffect(() => {
        if (canChange) return;
        return onSnapshot(query(collection(db, "requests"), where("roleId", "==", role.id)), snap => {
            const mine = snap.docs.map(d => ({ id: d.id, ...d.data() } as StemRequest)).find(r => r.type === "roleIcon" && r.uid === me);
            setPending(mine ?? null);
        }, err => console.error("Error loading requests:", err));
    }, [canChange, role.id, me]);

    useEffect(() => {
        if (!saved) return;
        const t = setTimeout(() => setSaved(false), 2500);
        return () => clearTimeout(t);
    }, [saved]);

    const changed = icon !== current.icon.key || color !== current.color.key;
    const preview = { icon, iconColor: color };
    const colorHex = roleLook(preview).color.hex;
    const approver = roleOwner(role) ? "the role's owner" : "an admin";

    const save = async () => {
        setSaving(true);
        try {
            if (canChange) await roleService.setRoleIcon(role.id, icon, color);
            else await roleService.requestRoleChange("roleIcon", me, myName, role, { icon, iconColor: color });
            setSaved(true);
        } catch (err) {
            console.error(err);
            await alertDialog("That didn't go through. Please try again.", "Something went wrong");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Preview */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4">
                <RoleIcon role={preview} size="lg" solid />
                <div className="min-w-0">
                    <p className="text-xs text-gray-400 uppercase tracking-widest">Preview</p>
                    <p className="text-lg font-bold truncate">{role.name}</p>
                    <p className="text-sm text-gray-500">Shown on the Roles page and at the top of this role.</p>
                </div>
            </div>

            {/* Colors */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">Color</h2>
                <div className="flex flex-wrap gap-2.5">
                    {ROLE_COLORS.map(c => (
                        <button
                            key={c.key}
                            type="button"
                            title={c.label}
                            aria-label={c.label}
                            aria-pressed={color === c.key}
                            onClick={() => setColor(c.key)}
                            className={`size-9 rounded-full flex items-center justify-center text-white transition-transform hover:scale-110 hover:cursor-pointer ${
                                color === c.key ? "ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-900" : ""
                            }`}
                            style={{ backgroundColor: c.hex }}
                        >
                            {color === c.key && <FontAwesomeIcon icon={faCheck} className="text-sm" />}
                        </button>
                    ))}
                </div>
            </div>

            {/* Icons, by group */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5 flex flex-col gap-5">
                {ROLE_ICON_GROUPS.map(group => (
                    <div key={group.title} className="flex flex-col gap-2.5">
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400">{group.title}</h2>
                        <div className="grid grid-cols-6 sm:grid-cols-8 gap-2">
                            {group.icons.map(o => {
                                const on = icon === o.key;
                                return (
                                    <button
                                        key={o.key}
                                        type="button"
                                        title={o.label}
                                        aria-label={o.label}
                                        aria-pressed={on}
                                        onClick={() => setIcon(o.key)}
                                        className={`aspect-square rounded-xl flex items-center justify-center text-lg transition-all hover:cursor-pointer ${
                                            on ? "text-white shadow-md scale-105" : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                                        }`}
                                        style={on ? { backgroundColor: colorHex } : undefined}
                                    >
                                        <FontAwesomeIcon icon={o.icon} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Save, or ask the owner */}
            <div className="sticky bottom-24 sm:bottom-4 z-10 bg-white border border-gray-200 rounded-2xl p-4 shadow-lg flex flex-col gap-2">
                {pending ? (
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                            <FontAwesomeIcon icon={faHourglassHalf} />
                            Your icon change is waiting for {approver}.
                        </p>
                        <button
                            type="button"
                            onClick={() => roleService.deleteRequest(pending.id)}
                            className="text-xs text-gray-400 hover:text-red-500 transition-colors hover:cursor-pointer shrink-0"
                        >
                            Withdraw
                        </button>
                    </div>
                ) : (
                    <>
                        {!canChange && <p className="text-xs text-gray-500">Only the role's owner, or an admin, changes its icon. Your choice is sent to {approver} to approve.</p>}
                        <div className="flex items-center gap-3">
                            <Button onClick={save} size="sm" color="blue" disabled={!changed || saving}>
                                {saving ? "Saving..." : canChange ? "Save Icon" : "Send Request"}
                            </Button>
                            {saved && <p className="text-sm text-green-600">{canChange ? "Icon updated." : `Sent to ${approver}.`}</p>}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
