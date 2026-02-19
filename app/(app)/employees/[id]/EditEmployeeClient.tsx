"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type Teammate = {
  id: string;
  full_name: string | null;
  role: string | null;
  status: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
};

type PermissionState = "inherit" | "allow" | "deny";
const DEPARTMENT_OPTIONS = [
  "Mowing",
  "Administration",
  "Landscaping",
  "Fertilizing",
  "Maintenance",
] as const;
type Department = (typeof DEPARTMENT_OPTIONS)[number];

const PERMISSION_GROUPS: Array<{
  group: string;
  items: Array<{ key: string; label: string }>;
}> = [
  {
    group: "Assets",
    items: [
      { key: "vehicles.view", label: "Vehicles View" },
      { key: "vehicles.manage", label: "Vehicles Manage" },
      { key: "equipment.view", label: "Equipment View" },
      { key: "equipment.manage", label: "Equipment Manage" },
    ],
  },
  {
    group: "Maintenance",
    items: [
      { key: "maintenance.view", label: "Maintenance View" },
      { key: "maintenance.manage", label: "Maintenance Manage" },
    ],
  },
  {
    group: "Inventory",
    items: [
      { key: "inventory.view", label: "Inventory View" },
      { key: "inventory.manage", label: "Inventory Manage" },
    ],
  },
  {
    group: "Teammates",
    items: [
      { key: "employees.view", label: "Teammates View" },
      { key: "employees.manage", label: "Teammates Manage" },
    ],
  },
  {
    group: "Ops",
    items: [{ key: "ops.view", label: "Ops View" }],
  },
];

function rolePresetAllowed(role: string | null, perm: string) {
  const r = (role ?? "employee").toLowerCase();
  if (
    r === "employee" ||
    r === "team_member_1" ||
    r === "team_member_2" ||
    r === "team_lead_1" ||
    r === "team_lead_2"
  ) {
    return perm === "vehicles.view" || perm === "equipment.view" || perm === "maintenance.view";
  }
  if (r === "mechanic") {
    return (
      perm === "vehicles.view" ||
      perm === "equipment.view" ||
      perm === "maintenance.view" ||
      perm === "inventory.view" ||
      perm === "ops.view" ||
      perm === "maintenance.manage" ||
      perm === "inventory.manage"
    );
  }
  if (r === "office_admin" || r === "owner" || r === "operations_manager") {
    return (
      perm === "vehicles.view" ||
      perm === "equipment.view" ||
      perm === "maintenance.view" ||
      perm === "inventory.view" ||
      perm === "employees.view" ||
      perm === "ops.view" ||
      perm === "vehicles.manage" ||
      perm === "equipment.manage" ||
      perm === "maintenance.manage" ||
      perm === "inventory.manage" ||
      perm === "employees.manage"
    );
  }
  return false;
}

export default function EditEmployeeClient({ id }: { id: string }) {
  const router = useRouter();

  const [employee, setEmployee] = useState<Teammate | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [permissionsErrMsg, setPermissionsErrMsg] = useState<string | null>(null);
  const [canManagePermissions, setCanManagePermissions] = useState(false);
  const [allowMap, setAllowMap] = useState<Record<string, true>>({});
  const [denyMap, setDenyMap] = useState<Record<string, true>>({});

  const safeId = useMemo(() => decodeURIComponent(id), [id]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrMsg(null);

      const supabase = createSupabaseBrowser();
      let canManage = false;

      // who am I (for self-protection checks)
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (!authErr) {
        const userId = authData?.user?.id ?? null;
        setMyUserId(userId);
        if (userId) {
          const { data: canManageData, error: canManageErr } = await supabase.rpc("has_permission", {
            p_user_id: userId,
            p_perm: "employees.manage",
          });
          if (canManageErr) {
            console.error("Permission check error:", canManageErr);
            setCanManagePermissions(false);
          } else {
            canManage = Boolean(canManageData);
            setCanManagePermissions(canManage);
          }
        }
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, status, email, phone, department")
        .eq("id", safeId)
        .maybeSingle();

      if (error) {
        console.error("Edit employee load error:", error);
        setErrMsg(error.message);
        setEmployee(null);
        setLoading(false);
        return;
      }

      if (!data) {
        setEmployee(null);
        setLoading(false);
        return;
      }

      setEmployee(data);

      if (!canManage) {
        setAllowMap({});
        setDenyMap({});
        setPermissionsErrMsg(null);
      } else {
        const { data: overridesRow, error: overridesErr } = await supabase
          .from("user_permission_overrides")
          .select("allow, deny")
          .eq("user_id", safeId)
          .maybeSingle();

        if (overridesErr) {
          console.error("Permission overrides load error:", overridesErr);
          setPermissionsErrMsg(overridesErr.message);
        } else {
          const allowObj = (overridesRow?.allow ?? {}) as Record<string, unknown>;
          const denyObj = (overridesRow?.deny ?? {}) as Record<string, unknown>;
          const nextAllow: Record<string, true> = {};
          const nextDeny: Record<string, true> = {};
          for (const [perm, value] of Object.entries(allowObj)) {
            if (value === true) nextAllow[perm] = true;
          }
          for (const [perm, value] of Object.entries(denyObj)) {
            if (value === true && !nextAllow[perm]) nextDeny[perm] = true;
          }
          setAllowMap(nextAllow);
          setDenyMap(nextDeny);
          setPermissionsErrMsg(null);
        }
      }

      setLoading(false);
    }

    load();
  }, [safeId]);

  const isSelf = !!myUserId && employee?.id === myUserId;
  const isOwner = (employee?.role ?? "").toLowerCase() === "owner";
  const isSelfOwner = isSelf && isOwner;
  const departmentValue = DEPARTMENT_OPTIONS.includes(employee?.department as Department)
    ? (employee?.department as Department)
    : DEPARTMENT_OPTIONS[0];
  const allPermissionKeys = useMemo(
    () => PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key)),
    []
  );

  function getPermissionState(perm: string): PermissionState {
    if (allowMap[perm]) return "allow";
    if (denyMap[perm]) return "deny";
    return "inherit";
  }

  function setPermissionState(perm: string, state: PermissionState) {
    setPermissionsErrMsg(null);
    setAllowMap((prev) => {
      const next = { ...prev };
      delete next[perm];
      if (state === "allow") next[perm] = true;
      return next;
    });
    setDenyMap((prev) => {
      const next = { ...prev };
      delete next[perm];
      if (state === "deny") next[perm] = true;
      return next;
    });
  }

  async function savePermissions() {
    if (!employee) return;
    if (!canManagePermissions) return;

    setSavingPermissions(true);
    setPermissionsErrMsg(null);

    const supabase = createSupabaseBrowser();
    const allowPayload: Record<string, true> = {};
    const denyPayload: Record<string, true> = {};
    for (const perm of allPermissionKeys) {
      const state = getPermissionState(perm);
      if (state === "allow") allowPayload[perm] = true;
      if (state === "deny") denyPayload[perm] = true;
    }

    const { error } = await supabase.from("user_permission_overrides").upsert(
      {
        user_id: employee.id,
        allow: allowPayload,
        deny: denyPayload,
      },
      { onConflict: "user_id" }
    );

    setSavingPermissions(false);
    if (error) {
      console.error("Permission overrides save error:", error);
      setPermissionsErrMsg(error.message);
      return;
    }
  }

  function resetAllPermissionsToDefault() {
    setPermissionsErrMsg(null);
    setAllowMap({});
    setDenyMap({});
  }

  async function save() {
    if (!employee) return;

    // UI-level self protection (DB trigger should also enforce)
    if (isSelfOwner && (employee.role ?? "").toLowerCase() !== "owner") {
      alert("Owners cannot demote themselves.");
      return;
    }

    if (!employee.email?.trim()) {
      alert("Email is required.");
      return;
    }
    if (!employee.phone?.trim()) {
      alert("Phone is required.");
      return;
    }

    setSaving(true);
    setErrMsg(null);

    const supabase = createSupabaseBrowser();

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: employee.full_name,
        role: employee.role,
        status: employee.status,
        phone: employee.phone?.trim() ?? null,
        department: employee.department,
      })
      .eq("id", employee.id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/employees");
  }

  async function deactivate() {
    if (!employee) return;

    if (isSelfOwner) {
      alert("Owner account cannot be deactivated from the app.");
      return;
    }

    const ok = confirm(
      `Deactivate ${employee.full_name || "this employee"}?\n\nThey will remain in the system but marked Inactive.`
    );
    if (!ok) return;

    setSaving(true);
    setErrMsg(null);

    const supabase = createSupabaseBrowser();

    const { error } = await supabase
      .from("profiles")
      .update({ status: "Inactive" })
      .eq("id", employee.id);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/employees");
  }

  if (loading) return <p style={{ padding: 32, opacity: 0.8 }}>Loading...</p>;

  if (errMsg) {
    return (
      <main style={{ padding: 32, maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ marginBottom: 6 }}>Edit Teammate</h1>
        <div style={{ ...cardStyle, marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Supabase error</div>
          <div style={{ opacity: 0.9 }}>{errMsg}</div>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            Teammate ID: <code>{safeId}</code>
          </div>

          <div style={{ marginTop: 14 }}>
            <button onClick={() => router.push("/employees")} style={buttonStyle}>
              Back
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!employee) {
    return (
      <main style={{ padding: 32, maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ marginBottom: 6 }}>Edit Teammate</h1>
        <div style={{ ...cardStyle, marginTop: 12 }}>
          <div style={{ opacity: 0.9 }}>Teammate not found.</div>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            Teammate ID: <code>{safeId}</code>
          </div>

          <div style={{ marginTop: 14 }}>
            <button onClick={() => router.push("/employees")} style={buttonStyle}>
              Back
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 32, maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Edit Teammate</h1>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            Update role, status, and contact details.
          </div>
        </div>

        <button onClick={() => router.push("/employees")} style={secondaryButtonStyle}>
          Back
        </button>
      </div>

      <div style={{ marginTop: 14, ...cardStyle }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Profile</div>

        <div style={gridStyle}>
          <Field label="Full Name">
            <input
              value={employee.full_name ?? ""}
              onChange={(e) => setEmployee({ ...employee, full_name: e.target.value })}
              placeholder="Full Name"
              style={inputStyle}
            />
          </Field>

          <Field label="Role">
            <select
              value={(employee.role ?? "employee") as string}
              onChange={(e) => setEmployee({ ...employee, role: e.target.value })}
              style={{ ...inputStyle, opacity: isSelfOwner ? 0.8 : 1 }}
              disabled={isSelfOwner}
            >
              <option value="owner">Owner</option>
              <option value="operations_manager">Operations Manager</option>
              <option value="office_admin">Office Admin</option>
              <option value="mechanic">Mechanic</option>
              <option value="team_lead_1">Team Lead 1</option>
              <option value="team_lead_2">Team Lead 2</option>
              <option value="team_member_1">Team Member 1</option>
              <option value="team_member_2">Team Member 2</option>
              <option value="employee">Teammate (Legacy)</option>
            </select>
            {isSelfOwner ? (
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                Owners cannot change their own role.
              </div>
            ) : null}
          </Field>

          <Field label="Status">
            <select
              value={employee.status ?? "Active"}
              onChange={(e) => setEmployee({ ...employee, status: e.target.value })}
              style={{ ...inputStyle, opacity: isSelfOwner ? 0.8 : 1 }}
              disabled={isSelfOwner}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            {isSelfOwner ? (
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                Owner account cannot be deactivated here.
              </div>
            ) : null}
          </Field>

          <Field label="Phone *">
            <input
              value={employee.phone ?? ""}
              onChange={(e) => setEmployee({ ...employee, phone: e.target.value })}
              placeholder="Phone"
              style={inputStyle}
              required
            />
          </Field>

          <Field label="Department *">
            <select
              value={departmentValue}
              onChange={(e) => setEmployee({ ...employee, department: e.target.value as Department })}
              style={inputStyle}
              required
            >
              {DEPARTMENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Email (read-only)">
            <input value={employee.email ?? ""} readOnly style={{ ...inputStyle, opacity: 0.8 }} />
          </Field>

          <Field label="Teammate ID (read-only)">
            <input value={employee.id} readOnly style={{ ...inputStyle, opacity: 0.8 }} />
          </Field>
        </div>
      </div>

      <div style={{ marginTop: 14, ...cardStyle }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>Permissions</div>
        <div style={{ opacity: 0.72, fontSize: 13, marginBottom: 12 }}>
          Per-user overrides on top of role defaults.
        </div>

        {!canManagePermissions ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            You do not have permission to edit per-user permission overrides.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.group} style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>{group.group}</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {group.items.map((item) => {
                    const state = getPermissionState(item.key);
                    const roleDefaultAllowed = rolePresetAllowed(employee.role, item.key);
                    return (
                      <div
                        key={item.key}
                        style={{
                          border: "1px solid rgba(255,255,255,0.10)",
                          borderRadius: 10,
                          padding: 10,
                          display: "grid",
                          gridTemplateColumns: "minmax(180px, 1fr) auto",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700 }}>{item.label}</div>
                          <div style={{ fontSize: 12, opacity: 0.72 }}>
                            <code>{item.key}</code> · Role default: {roleDefaultAllowed ? "Allowed" : "Denied"}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setPermissionState(item.key, "inherit")}
                            style={{
                              ...segButtonStyle,
                              ...(state === "inherit" ? segButtonActiveNeutralStyle : {}),
                            }}
                          >
                            Inherit
                          </button>
                          <button
                            type="button"
                            onClick={() => setPermissionState(item.key, "allow")}
                            style={{
                              ...segButtonStyle,
                              ...(state === "allow" ? segButtonActiveAllowStyle : {}),
                            }}
                          >
                            Allow
                          </button>
                          <button
                            type="button"
                            onClick={() => setPermissionState(item.key, "deny")}
                            style={{
                              ...segButtonStyle,
                              ...(state === "deny" ? segButtonActiveDenyStyle : {}),
                            }}
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {permissionsErrMsg ? (
              <div style={{ fontSize: 13, color: "#ffb0b0" }}>{permissionsErrMsg}</div>
            ) : null}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={savePermissions}
                style={buttonStyle}
                disabled={savingPermissions || saving}
              >
                {savingPermissions ? "Saving Permissions..." : "Save Permissions"}
              </button>
              <button
                type="button"
                onClick={resetAllPermissionsToDefault}
                style={secondaryButtonStyle}
                disabled={savingPermissions || saving}
              >
                Reset all to role defaults
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={save} style={buttonStyle} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </button>

        <button onClick={() => router.push("/employees")} style={secondaryButtonStyle} disabled={saving}>
          Cancel
        </button>

        <button
          onClick={deactivate}
          style={{
            ...secondaryButtonStyle,
            opacity: isSelfOwner ? 0.5 : 0.95,
            cursor: isSelfOwner ? "not-allowed" : "pointer",
          }}
          disabled={saving || isSelfOwner}
          title={isSelfOwner ? "Owner account cannot be deactivated here" : "Deactivate employee"}
        >
          Deactivate
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
        Deactivating keeps the employee record for history/auditing.
      </div>
    </main>
  );
}

/* ---------------- UI helpers ---------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

/* ---------------- Styles ---------------- */

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "transparent",
  color: "inherit",
  fontWeight: 800,
  opacity: 0.9,
  cursor: "pointer",
};

const segButtonStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const segButtonActiveNeutralStyle: React.CSSProperties = {
  border: "1px solid rgba(180,180,180,0.4)",
  background: "rgba(180,180,180,0.14)",
};

const segButtonActiveAllowStyle: React.CSSProperties = {
  border: "1px solid rgba(126,255,167,0.55)",
  background: "rgba(126,255,167,0.18)",
};

const segButtonActiveDenyStyle: React.CSSProperties = {
  border: "1px solid rgba(255,120,120,0.55)",
  background: "rgba(255,120,120,0.18)",
};
