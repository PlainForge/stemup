import type { Timestamp } from "firebase/firestore";

export type UserData = {
    name: string,
    uid: string,
    roles: [{id: string, name: string, points: number, taskCompleted: number}],
    points: number,
    taskCompleted: number,
    photoURL: string;
    id: string
}

export type RoleUserData = {
  id: string
}

export type Role = {
  id: string;
  name: string;
};

export type Task = {
  assignedTo: string,
  assignedName: string,
  description: string,
  points: number,
  roleId: string,
  complete: boolean,
  id: string,
  title: string,
  createdOn: Timestamp
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