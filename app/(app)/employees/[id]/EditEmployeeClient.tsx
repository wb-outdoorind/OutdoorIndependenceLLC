"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { writeAudit } from "@/lib/audit";

type Employee = {
  id: string;
  full_name: string | null;
  role: string | null;
  status: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
};

export default function EditEmployeeClient({ id }: { id: string }) {
  const router = useRouter();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const safeId = useMemo(() => decodeURIComponent(id), [id]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrMsg(null);

      const supabase = createSupabaseBrowser();

      // who am I (for self-protection checks)
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (!authErr) setMyUserId(authData?.user?.id ?? null);

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
      setLoading(false);
    }

    load();
  }, [safeId]);

  const isSelf = !!myUserId && employee?.id === myUserId;
  const isOwner = (employee?.role ?? "").toLowerCase() === "owner";
  const isSelfOwner = isSelf && isOwner;

  async function save() {
    if (!employee) return;

    // UI-level self protection (DB trigger should also enforce)
    if (isSelfOwner && (employee.role ?? "").toLowerCase() !== "owner") {
      alert("Owners cannot demote themselves.");
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
        phone: employee.phone,
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
        <h1 style={{ marginBottom: 6 }}>Edit Employee</h1>
        <div style={{ ...cardStyle, marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Supabase error</div>
          <div style={{ opacity: 0.9 }}>{errMsg}</div>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            Employee ID: <code>{safeId}</code>
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
        <h1 style={{ marginBottom: 6 }}>Edit Employee</h1>
        <div style={{ ...cardStyle, marginTop: 12 }}>
          <div style={{ opacity: 0.9 }}>Employee not found.</div>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            Employee ID: <code>{safeId}</code>
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
          <h1 style={{ marginBottom: 6 }}>Edit Employee</h1>
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
              <option value="office_admin">Office Admin</option>
              <option value="mechanic">Mechanic</option>
              <option value="employee">Employee</option>
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

          <Field label="Phone">
            <input
              value={employee.phone ?? ""}
              onChange={(e) => setEmployee({ ...employee, phone: e.target.value })}
              placeholder="Phone"
              style={inputStyle}
            />
          </Field>

          <Field label="Department">
            <input
              value={employee.department ?? ""}
              onChange={(e) => setEmployee({ ...employee, department: e.target.value })}
              placeholder="Department"
              style={inputStyle}
            />
          </Field>

          <Field label="Email (read-only)">
            <input value={employee.email ?? ""} readOnly style={{ ...inputStyle, opacity: 0.8 }} />
          </Field>

          <Field label="Employee ID (read-only)">
            <input value={employee.id} readOnly style={{ ...inputStyle, opacity: 0.8 }} />
          </Field>
        </div>
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
