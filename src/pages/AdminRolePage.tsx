import { useContext, useEffect } from "react";
import { motion } from "motion/react";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { MainContext } from "../context/MainContext";
import { useRole } from "../lib/useRole";
import { canManageRole } from "../lib/roleService";
import RoleAdminPage from "../components/RoleAdmin";
import Loading from "./Loading";
import BackButton from "../components/BackButton";

/**
 * Running one role, with everything its instructors can do:
 * - /admin/roles/:id for admins (any role), under the Admin tab
 * - /instructor/roles/:id for an Instructor (roles they run), under the Instructor tab
 */
export default function AdminRolePage({ mode = "admin" }: { mode?: "admin" | "instructor" }) {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const { id: roleId } = useParams<{ id: string }>();

    const user = context?.user ?? null;
    const loading = context?.loading ?? true;
    const admins = context?.admins ?? [];
    const instructors = context?.instructors ?? [];
    const isAdmin = !!user && admins.includes(user.uid);
    const isInstructor = !!user && instructors.includes(user.uid);
    const allowed = mode === "admin" ? isAdmin : isInstructor && !isAdmin;
    const { role, membersWithData, requested } = useRole(roleId, allowed);

    const home = mode === "admin" ? "/admin?tab=roles" : "/instructor";
    const homeLabel = mode === "admin" ? "Admin" : "Instructor";

    useEffect(() => {
        if (loading || !user) return;
        // Admins who open an Instructor link get the same view on the Admin page
        if (mode === "instructor" && isAdmin && roleId) navigate(`/admin/roles/${roleId}`, { replace: true });
        else if (!allowed) navigate("/", { replace: true });
    }, [loading, user, allowed, isAdmin, mode, roleId, navigate]);

    if (loading || !user || !allowed || role === undefined) return <Loading />;

    // Instructors only run the roles they've been added to
    if (role === null || (mode === "instructor" && !canManageRole(role, user.uid, admins, instructors))) {
        return (
            <div className="w-full max-w-2xl mx-auto flex flex-col gap-4 px-4 py-6 items-center">
                <p className="text-gray-400 text-sm text-center py-8">
                    {role === null ? "This role no longer exists." : "You don't run this role any more."}
                </p>
                <BackButton label={homeLabel} onClick={() => navigate(home)} className="self-center" />
            </div>
        );
    }

    const isMember = (role.members ?? []).includes(user.uid);

    return (
        <motion.div
            className="w-full max-w-3xl mx-auto flex flex-col gap-4 px-4 pb-10"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="pt-1">
                <BackButton label={homeLabel} onClick={() => navigate(home)} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-xs text-gray-400 uppercase tracking-widest">Manage Role</p>
                    <h1 className="text-2xl font-bold truncate">{role.name}</h1>
                    {role.purpose && <p className="text-sm text-gray-500 mt-1">{role.purpose}</p>}
                </div>
                {isMember && (
                    <button
                        type="button"
                        onClick={() => navigate(`/roles/${role.id}`)}
                        title="Open the role page"
                        className="group flex items-center gap-2 pl-4 pr-3.5 py-1.5 rounded-full text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors hover:cursor-pointer"
                    >
                        Open
                        <FontAwesomeIcon icon={faArrowRight} className="text-xs transition-transform group-hover:translate-x-0.5" />
                    </button>
                )}
            </div>
            <RoleAdminPage role={role} membersWithData={membersWithData} requested={requested} />
        </motion.div>
    );
}
