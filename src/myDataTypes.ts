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
    /** A short, optional bio (200 words at most), set in Settings > Profile and shown on their card */
    aboutMe?: string,
    /** Tasks this person has given out as an instructor or admin (counted by a Cloud Function) */
    tasksGiven?: number,
    /** Roles they've hidden from their card and user page (each role's Settings tab); admins and the role's instructors still see them */
    hideOnProfile?: string[],
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
    { key: "roleChat", label: "Group chat messages", hint: "New messages in a role's group chat (iOS only, never by email)" },
    { key: "taskThread", label: "Task questions", hint: "A new message on one of your tasks (iOS only, never by email)" },
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
    /** Admins only: email them every new bug report and feature request (off unless turned on) */
    feedbackEmails?: boolean,
}

/** What someone sends from Settings > App: a bug report or a feature request (the bugs collection's `type`) */
export const FEEDBACK_TYPES = [
    { key: "bug", label: "Bug" },
    { key: "feature", label: "Feature" },
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number]["key"];

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
  /** Its icon and color on the Roles page and its own page (keys from src/lib/roleIcons.ts) */
  icon?: string;
  iconColor?: string;
  showInGlobalLeaderboard?: boolean;
  /** Hidden from the Roles page for anyone not in it: people only join through an invitation (owner or admin setting) */
  inviteOnly?: boolean;
  /** A group chat for everyone in the role (off unless its owner or an admin turns it on) */
  chatEnabled?: boolean;
  /** Each task gets a thread between the person doing it and whoever gave it (off unless its owner or an admin turns it on) */
  taskThreadsEnabled?: boolean;
};

/** The two kinds of role messaging, each switched on in the role's Config */
export type MessagingFeature = "chat" | "taskThreads";

/** A message in a role's group chat (roles/{id}/messages) or a task's thread (tasks/{id}/messages) */
export type ChatMessage = {
  id: string;
  uid: string;
  name: string;
  photoURL?: string;
  text: string;
  createdAt?: Timestamp;
};

/** User < Instructor < Admin */
export type AccessLevel = "user" | "instructor" | "admin";

export const ACCESS_LABELS: Record<AccessLevel, string> = {
  user: "User",
  instructor: "Instructor",
  admin: "Admin",
};

/** Changes to a role that its instructors ask the role's owner for (or admins, when it has none) */
export const ROLE_CHANGE_TYPES = ["resetRole", "renameRole", "editStats", "kickMember", "rewardsTitle", "roleIcon", "roleMessaging"] as const;
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
  /** roleIcon: the icon and color asked for */
  icon?: string;
  iconColor?: string;
  /** roleMessaging: which kind of messaging, and whether to turn it on or off */
  feature?: MessagingFeature;
  enabled?: boolean;
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
  /** Its thread (tasks/{id}/messages): how many messages, and the latest one (kept by a Cloud Function) */
  messageCount?: number,
  lastMessageAt?: Timestamp,
  lastMessageBy?: string,
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