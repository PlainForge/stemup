import type { Timestamp } from "firebase/firestore";

export type UserData = {
    name: string,
    uid: string,
    roles: UserRoleData[],
    points: number,
    taskCompleted: number,
    photoURL: string;
    email?: string,
    id: string,
    currentRole: string,
    /** Instructors can hide the global leaderboard on Home; shown when unset */
    showGlobalLeaderboard?: boolean,
    /** Set by an admin so this person sees the global leaderboard on Home (admins and instructors already do) */
    canSeeGlobal?: boolean,
    /** A new email waiting on its verification link; email changes only once it's clicked */
    pendingEmail?: string,
    /** How to tell them about their tasks and requests; push and email are off when unset */
    notifications?: NotificationPrefs,
    /** Roles whose rewards and top 3 they've hidden from Home (each role's Settings tab) */
    hideOnHome?: string[],
    /** Tasks this person has given out as an instructor or admin (counted by a Cloud Function) */
    tasksGiven?: number,
}

/** An invitation to join a role (invites/{roleId}_{uid}), sent by its instructors or an admin */
export type RoleInvite = {
    id: string;
    roleId: string;
    roleName: string;
    /** Who's invited */
    uid: string;
    userName: string;
    /** Join as a member, or as one of the role's instructors (Instructors only) */
    as: "member" | "instructor";
    invitedBy: string;
    invitedByName: string;
    createdAt?: Timestamp;
}

/** Kinds of notification, each with its own switch in Settings (kept in sync with functions/src/notifications.ts) */
export const NOTIFICATION_TYPES = [
    { key: "newTask", label: "New tasks", hint: "A task is assigned or handed to you" },
    { key: "taskEdited", label: "Task changes", hint: "An instructor edits one of your tasks" },
    { key: "taskReviewed", label: "Task submissions", hint: "A task you submitted is approved or declined" },
    { key: "extension", label: "Extension requests", hint: "An extension you asked for is approved or declined" },
    { key: "joinRole", label: "Role join requests", hint: "A request to join a role is accepted or declined" },
    { key: "accessRequest", label: "Instructor and role requests", hint: "Instructor access, new roles and role resets" },
    { key: "invite", label: "Role invitations", hint: "Someone invites you to join a role" },
] as const;

export type NotifyType = (typeof NOTIFICATION_TYPES)[number]["key"];

export type NotificationPrefs = {
    /** iOS push notifications (turned on from the iOS app) */
    push?: boolean,
    email?: boolean,
    /** A kind set to false is off; missing kinds are on */
    types?: Partial<Record<NotifyType, boolean>>,
    /** Per role (by id), from the role's Notifications tab: false is off; missing roles are on */
    roles?: Record<string, boolean>,
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
  /**
   * The instructor who owns this role, set by admins. Its other instructors ask
   * the owner before bigger changes. Falls back to createdBy when unset; "" means none.
   */
  owner?: string;
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

/** Changes to a role that its instructors ask the role's owner for (or admins, when it has none) */
export const ROLE_CHANGE_TYPES = ["resetRole", "renameRole", "editStats", "kickMember", "rewardsTitle"] as const;
export type RoleChangeType = (typeof ROLE_CHANGE_TYPES)[number];

/** Something to approve, in the `requests` collection: by an admin, or by a role's owner for role changes */
export type StemRequest = {
  id: string;
  type: "instructor" | "createRole" | RoleChangeType;
  uid: string;
  userName: string;
  createdAt?: Timestamp;
  /** instructor: why they want to be one */
  reason?: string;
  /** createRole: the new role's name and purpose */
  roleName?: string;
  purpose?: string;
  /** Role changes: which role. resetRole: the name to save its data under */
  roleId?: string;
  saveName?: string;
  /** renameRole: the new name. rewardsTitle: the new title ("" goes back to the current month) */
  newName?: string;
  title?: string;
  /** editStats and kickMember: the member it's about. editStats: their new stats in this role */
  targetUid?: string;
  targetName?: string;
  points?: number;
  taskCompleted?: number;
  /** Set by an admin just before removing the request, so the person can be told the outcome */
  status?: "approved" | "declined";
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
  /** Who gave the task (counted as their "tasks given"); missing on older tasks */
  assignedBy?: string,
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