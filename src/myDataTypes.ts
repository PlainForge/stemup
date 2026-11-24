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
    /** How to tell them about their tasks and requests; push and email are off when unset */
    notifications?: NotificationPrefs,
}

/** Kinds of notification, each with its own switch in Settings (kept in sync with functions/src/notifications.ts) */
export const NOTIFICATION_TYPES = [
    { key: "newTask", label: "New tasks", hint: "A task is assigned or handed to you" },
    { key: "taskEdited", label: "Task changes", hint: "An instructor edits one of your tasks" },
    { key: "taskReviewed", label: "Task submissions", hint: "A task you submitted is approved or declined" },
    { key: "extension", label: "Extension requests", hint: "An extension you asked for is approved or declined" },
    { key: "joinRole", label: "Role join requests", hint: "A request to join a role is accepted or declined" },
    { key: "accessRequest", label: "Instructor and role requests", hint: "Instructor access, new roles and role resets" },
] as const;

export type NotifyType = (typeof NOTIFICATION_TYPES)[number]["key"];

export type NotificationPrefs = {
    /** iOS push notifications (turned on from the iOS app) */
    push?: boolean,
    email?: boolean,
    /** A kind set to false is off; missing kinds are on */
    types?: Partial<Record<NotifyType, boolean>>,
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