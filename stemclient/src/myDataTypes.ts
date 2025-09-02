import type { Timestamp } from "firebase/firestore";

export type UserData = {
    name?: string,
    uid?: string,
    roles?: [{id: string, name: string}],
    points?: number,
    taskCompleted?: number,
    photoURL?: string;
}

export type RoleUserData = {
  name: string,
  id: string,
  points: number,
  taskCompleted: number,
  photoURL?: string
}

export type Role = {
  id: string;
  name: string;
};

export type Task = {
  assignedTo: string,
  description: string,
  points: number,
  roleId: string
}

export type SubmittedTask = {
  assignedTo: string,
  description: string,
  points: number,
  roleId: string,
  timestamp: Timestamp
}