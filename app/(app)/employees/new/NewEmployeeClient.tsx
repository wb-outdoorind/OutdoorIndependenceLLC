"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ApiResponse = { error?: string; temporaryPassword?: string };
const DEPARTMENT_OPTIONS = [
  "Mowing",
  "Administration",
  "Landscaping",
  "Fertilizing",
  "Maintenance",
] as const;
type Department = (typeof DEPARTMENT_OPTIONS)[number];
type AssignableRole =
  | "team_lead_1"
  | "team_lead_2"
  | "team_member_1"
  | "team_member_2"
  | "mechanic"
  | "office_admin"
  | "operations_manager"
  | "owner";

export default function NewEmployeeClient() {
  const router = useRouter();

  const [full_name, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("team_member_1");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState<Department>("Mowing");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const payload = {
      full_name: full_name.trim(),
      email: email.trim().toLowerCase(),
      role,
      phone: phone.trim(),
      department,
    };

    if (!payload.full_name) return setMsg("Full name is required.");
    if (!payload.email) return setMsg("Email is required.");
    if (!payload.phone) return setMsg("Phone is required.");

    setSaving(true);
    try {
      const res = await fetch("/api/employees/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // ✅ SAFELY parse response (JSON or text)
      const contentType = res.headers.get("content-type") || "";
      let data: ApiResponse | null = null;

      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        data = { error: text || "Empty response (route may have crashed)" };
      }

      if (!res.ok) {
        setMsg(data?.error || "Failed to create teammate account.");
        setSaving(false);
        return;
      }

      setMsg(
        `Teammate created. Temporary password: ${data?.temporaryPassword ?? "Outdoor2026!"}. User must change it on first login.`
      );
      router.push("/employees");
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : "Failed to create teammate account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ padding: 32, maxWidth: 760, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "baseline",
        }}
      >
        <div>
          <h1 style={{ marginBottom: 6 }}>Add Teammate</h1>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            This creates the teammate login and profile with a temporary password.
          </div>
        </div>
        <Link href="/employees" style={{ opacity: 0.9 }}>
          Back
        </Link>
      </div>

      <form onSubmit={onSubmit} style={{ marginTop: 14, ...cardStyle }}>
        <div style={{ fontWeight: 900, marginBottom: 12 }}>Teammate Details</div>

        <div style={gridStyle}>
          <Field label="Full Name *">
            <input
              value={full_name}
              onChange={(e) => setFullName(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Email *">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              inputMode="email"
              placeholder="name@company.com"
            />
          </Field>

          <Field label="Role *">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AssignableRole)}
              style={inputStyle}
            >
              <option value="team_lead_1">Team Lead 1</option>
              <option value="team_lead_2">Team Lead 2</option>
              <option value="team_member_1">Team Member 1</option>
              <option value="team_member_2">Team Member 2</option>
              <option value="mechanic">Mechanic</option>
              <option value="office_admin">Office Admin</option>
              <option value="operations_manager">Operations Manager</option>
              <option value="owner">Owner</option>
            </select>
          </Field>

          <Field label="Phone *">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} required />
          </Field>

          <Field label="Department *">
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value as Department)}
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
        </div>

        {msg ? <div style={{ marginTop: 12, opacity: 0.9 }}>{msg}</div> : null}

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="submit" disabled={saving} style={buttonStyle}>
            {saving ? "Creating account..." : "Create Teammate Account"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/employees")}
            style={secondaryButtonStyle}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

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
