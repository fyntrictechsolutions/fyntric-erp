import { permissionFor, type ModuleKey } from "@/config/roles";
import type { BaseRecord, UserProfile } from "@/types";
import type { ModuleDefinition } from "@/config/modules";

/** What the signed-in user can do with one module and its records. */
export function moduleAccess(module: ModuleDefinition | ModuleKey, profile: UserProfile) {
  const key = typeof module === "string" ? module : module.key;
  const def = typeof module === "string" ? undefined : module;
  const perm = permissionFor(profile.role, key);
  const isOwner = (r: BaseRecord) => r.userId === profile.id;
  const ownerMayChange = (r: BaseRecord) => isOwner(r) && (def?.ownerEditableWhen ? def.ownerEditableWhen(r) : true);

  return {
    perm,
    canCreate: perm.create,
    /** Manages every record (e.g. HR for leave): can approve and set manager-only fields. */
    isManager: perm.update === "all",
    seesEveryone: perm.read === "all",
    canEdit: (r: BaseRecord) => perm.update === "all" || (perm.update === "own" && ownerMayChange(r)),
    canDelete: (r: BaseRecord) => perm.delete === "all" || (perm.delete === "own" && ownerMayChange(r)),
  };
}
