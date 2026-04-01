import assert from "node:assert/strict";
import { canAccessRoute } from "@/lib/routeAccess";
import { canCreateMaintenanceLog, canManageEmployees, type Role } from "@/lib/supabase/authz";

const managementOrMechanic: Role[] = ["owner", "operations_manager", "sales_manager", "office_admin", "mechanic"];
const managementOnly: Role[] = ["owner", "operations_manager", "sales_manager", "office_admin"];
const restrictedRoles: Role[] = ["apprentice", "employee", "team_lead_1", "team_lead_2", "team_member_1", "team_member_2"];

for (const role of managementOrMechanic) {
  assert.equal(canCreateMaintenanceLog(role), true, `Expected canCreateMaintenanceLog=true for ${role}`);
}

for (const role of restrictedRoles) {
  assert.equal(canCreateMaintenanceLog(role), false, `Expected canCreateMaintenanceLog=false for ${role}`);
}

for (const role of managementOnly) {
  assert.equal(canManageEmployees(role), true, `Expected canManageEmployees=true for ${role}`);
}

for (const role of [...managementOrMechanic.filter((r) => !managementOnly.includes(r)), ...restrictedRoles]) {
  assert.equal(canManageEmployees(role), false, `Expected canManageEmployees=false for ${role}`);
}

for (const role of managementOrMechanic) {
  assert.equal(canAccessRoute(role, "vehicles_create"), true, `Expected vehicles_create allowed for ${role}`);
  assert.equal(canAccessRoute(role, "equipment_create"), true, `Expected equipment_create allowed for ${role}`);
}

for (const role of restrictedRoles) {
  assert.equal(canAccessRoute(role, "vehicles_create"), false, `Expected vehicles_create denied for ${role}`);
  assert.equal(canAccessRoute(role, "equipment_create"), false, `Expected equipment_create denied for ${role}`);
}

console.log("Authz guard checks passed.");
