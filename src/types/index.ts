import type { UserRole } from "@/config/roles";

/** A signed-in person's profile, stored at users/{uid}. */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  /** For client users: the clients/{id} record they belong to. */
  clientId?: string;
  clientIdLabel?: string;
  /** For staff: their employees/{id} record. */
  employeeId?: string;
  employeeIdLabel?: string;
  active: boolean;
  /** Set when the stored role isn't one the app knows (e.g. mistyped in the console). */
  invalidRole?: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Fields every stored record gets automatically. */
export interface BaseRecord {
  id: string;
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
  /** Owner of the record, for modules where staff only see their own entries. */
  userId?: string;
  userName?: string;
  [field: string]: unknown;
}
