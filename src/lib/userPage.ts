/** The tabs a user's page can open under, by their first path segment. */
const TAB_PREFIXES = ["roles", "tasks", "admin", "instructor", "settings"];

/**
 * Where "View their page" on a profile or instructor card goes. Anyone can open
 * anyone's page, and it opens under the tab you're on, so the nav stays put:
 * /users/:uid under Home, /roles/users/:uid under Roles, /tasks/users/:uid, and
 * so on. Admins see the full admin user page there; everyone else the read-only
 * page (plus links for instructors into the roles they both share and run).
 */
/**
 * Whether a role shows on someone's card and user page. People can hide a role
 * there (its Settings tab); they, admins and whoever runs that role still see it.
 */
export function showsRole(person: { uid?: string; hideOnProfile?: string[] }, roleId: string, viewer: { uid?: string; isAdmin: boolean; runs: (roleId: string) => boolean }) {
    if (!(person.hideOnProfile ?? []).includes(roleId)) return true;
    return viewer.isAdmin || (!!viewer.uid && viewer.uid === person.uid) || viewer.runs(roleId);
}

export function userPagePath(targetUid: string, pathname: string): string {
    const first = pathname.split("/")[1] ?? "";
    const prefix = TAB_PREFIXES.includes(first) ? `/${first}` : "";
    return `${prefix}/users/${targetUid}`;
}
