import assert from "node:assert/strict";
import { canAccessRoute } from "@/lib/routeAccess";

const roles = [
  "owner",
  "operations_manager",
  "sales_manager",
  "office_admin",
  "mechanic",
  "team_lead_1",
  "team_lead_2",
  "team_member_1",
  "team_member_2",
  "apprentice",
  "employee",
] as const;

function expectAllowed(route: Parameters<typeof canAccessRoute>[1], allowed: string[]) {
  for (const role of roles) {
    const actual = canAccessRoute(role, route);
    const expected = allowed.includes(role);
    assert.equal(
      actual,
      expected,
      `Route '${route}' expected ${expected ? "allow" : "deny"} for role '${role}', got ${actual}`
    );
  }
}

expectAllowed("ops_dashboard", ["owner", "operations_manager", "sales_manager", "office_admin", "mechanic"]);
expectAllowed("maintenance_center", ["owner", "operations_manager", "sales_manager", "office_admin", "mechanic"]);
expectAllowed("fertilizing_operations", ["owner", "operations_manager", "sales_manager", "office_admin", "mechanic"]);
expectAllowed("crm", ["owner", "operations_manager", "sales_manager", "office_admin"]);
expectAllowed("purchases", ["owner", "operations_manager", "sales_manager", "office_admin", "mechanic"]);
expectAllowed("accountability_center", ["owner", "operations_manager", "sales_manager", "office_admin", "mechanic"]);
expectAllowed("vehicles_create", ["owner", "operations_manager", "sales_manager", "office_admin", "mechanic"]);
expectAllowed("equipment_create", ["owner", "operations_manager", "sales_manager", "office_admin", "mechanic"]);
expectAllowed("employees_create", ["owner", "operations_manager", "sales_manager", "office_admin"]);
expectAllowed("lead_approvals", [
  "owner",
  "operations_manager",
  "sales_manager",
  "office_admin",
  "mechanic",
  "team_lead_1",
  "team_lead_2",
]);
expectAllowed("digest_details", ["owner", "mechanic"]);
expectAllowed("audit_trail", ["owner", "operations_manager", "sales_manager", "office_admin", "mechanic"]);

console.log("Route access matrix checks passed.");
