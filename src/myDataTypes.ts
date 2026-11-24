import type { Timestamp } from "firebase/firestore";

export type UserData = {
    name: string,
    uid: string,
    roles: UserRoleData[],
    points: number,
    taskCompleted: number,
    photoURL: string;
    id: string,
    currentRole: string,
    /** Instructors can hide the global leaderboard on Home; shown when unset */
    showGlobalLeaderboard?: boolean,
}

export type RoleUserData = {
  id: string
}

export type Role = {
  id: string;
  name: string;
  members?: string[];
  pendingRequests?: string[];
  /** Instructors who run this role (its creator plus anyone they add). They're members too, but aren't ranked. */
  instructors?: string[];
  createdBy?: string;
  purpose?: string;
  /** Heading on the Rewards tab; the current month when unset */
  rewardsTitle?: string;
  showInGlobalLeaderboard?: boolean;
};

/** User < Instructor < Admin */
export type AccessLevel = "user" | "instructor" | "admin";

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  user: "User",
  instructor: "Instructor",
  admin: "Admin",
};

/** Something an admin has to approve, in the `requests` collection */
export type StemRequest = {
  id: string;
  type: "instructor" | "createRole" | "resetRole";
  uid: string;
  userName: string;
  createdAt?: Timestamp;
  /** instructor: why they want to be one */
  reason?: string;
  /** createRole: the new role's name and purpose */
  roleName?: string;
  purpose?: string;
  /** resetRole: which role, and the name to save its data under */
  roleId?: string;
  saveName?: string;
};

/** A role's leaderboard saved when it was reset (shown on the Saved Data tab) */
export type SavedDataEntry = { uid: string; name: string; photoURL: string; points: number; taskCompleted: number; rank: number };
export type SavedData = {
  id: string;
  roleId: string;
  /** The name given when resetting; older saves only have `month` */
  name?: string;
  month?: string;
  createdAt: Timestamp;
  entries: SavedDataEntry[];
};

export type UserRoleData = {
  id: string;
  name: string;
  points: number;
  taskCompleted: number
}

export type Task = {
  assignedTo: string,
  assignedName: string,
  description: string,
  points: number,
  roleId: string,
  complete: boolean,
  id: string,
  title: string,
  createdOn: Timestamp,
  status?: "In Progress" | "Almost Done",
  dueDate?: Timestamp,
  deleteAt?: Timestamp,
  extensionRequested?: boolean,
  extensionDeclined?: boolean,
  declineCount?: number,
}

export type SubmittedTask = {
  assignedTo: string,
  assignedName: string,
  description: string,
  points: number,
  roleId: string,
  submission: Timestamp,
  complete: boolean,
  id: string,
  title: string
}