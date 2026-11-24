import { useContext, useEffect } from "react";
import { motion } from "motion/react";
import { useNavigate, useParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { MainContext } from "../context/MainContext";
import { useRole } from "../lib/useRole";
import RoleAdminPage from "../components/RoleAdmin";
import Button from "../components/Button";
import Loading from "./Loading";

/** /admin/roles/:id — an admin running any role, with everything an instructor can do. */
export default function AdminRolePage() {
    const context = useContext(MainContext);
    const navigate = useNavigate();
    const { id: roleId } = useParams<{ id: string }>();

    const user = context?.user ?? null;
    const loading = context?.loading ?? true;
    const isAdmin = !!user && (context?.admins ?? []).includes(user.uid);
    const { role, membersWithData, requested } = useRole(roleId, isAdmin);

    useEffect(() => {
        if (!loading && (!user || !isAdmin)) navigate("/", { replace: true });
    }, [loading, user, isAdmin, navigate]);

    if (loading || !user || !isAdmin || role === undefined) return <Loading />;

    if (role === null) {
        return (
            <div className="w-full max-w-2xl mx-auto flex flex-col gap-4 px-4 py-6 items-center">
                <p className="text-gray-400 text-sm text-center py-8">This role no longer exists.</p>
                <Button onClick={() => navigate("/admin?tab=roles")} color="gray" size="sm">Back to Admin</Button>
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
                <button
                    onClick={() => navigate("/admin?tab=roles")}
                    className="text-sm text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1.5 hover:cursor-pointer"
                >
                    <FontAwesomeIcon icon={faArrowLeft} className="text-xs" /> Admin
                </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-xs text-gray-400 uppercase tracking-widest">Manage Role</p>
                    <h1 className="text-2xl font-bold truncate">{role.name}</h1>
                    {role.purpose && <p className="text-sm text-gray-500 mt-1">{role.purpose}</p>}
                </div>
                {isMember && (
                    <Button size="xsm" color="blue" onClick={() => navigate(`/roles/${role.id}`)}>Open Role Page</Button>
                )}
            </div>
            <RoleAdminPage role={role} membersWithData={membersWithData} requested={requested} />
        </motion.div>
    );
}
