"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { writeAudit } from "@/lib/audit";

type Teammate = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  middle_initial: string | null;
  last_name: string | null;
  nickname: string | null;
  role: string;
  status: string;
  email: string | null;
  phone: string | null;
  department: string | null;
};

type ResendInviteResponse = {
  error?: string;
  temporaryPassword?: string;
  inviteEmailSent?: boolean;
  inviteEmailConfigured?: boolean;
  inviteEmailError?: string | null;
};

function buildLegalName(emp: Teammate) {
  const first = (emp.first_name ?? "").trim();
  const middle = (emp.middle_initial ?? "").trim().slice(0, 1).toUpperCase();
  const last = (emp.last_name ?? "").trim();
  const joined = [first, middle || null, last].filter(Boolean).join(" ").trim();
  return joined || (emp.full_name ?? "").trim();
}

function displayName(emp: Teammate) {
  return (
    (emp.nickname ?? "").trim() ||
    (emp.first_name ?? "").trim() ||
    (emp.full_name ?? "").trim() ||
    (emp.email ?? "").trim() ||
    emp.id
  );
}

export default function EmployeesClient({ role }: { role: string }) {
  const [employees, setEmployees] = useState<Teammate[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const canManage =
    role === "owner" || role === "operations_manager" || role === "sales_manager" || role === "office_admin";

  /* ===============================
     Load Teammates
  =============================== */

  useEffect(() => {
    async function loadEmployees() {
      const supabase = createSupabaseBrowser();

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, middle_initial, last_name, nickname, role, status, email, phone, department")
        .order("last_name")
        .order("first_name");

      if (!error && data) {
        setEmployees(data);
      }

      setLoading(false);
    }

    loadEmployees();
  }, []);

  /* ===============================
     Filters
  =============================== */

  const rolesInData = useMemo(() => {
    const set = new Set(employees.map((e) => (e.role || "").trim()).filter(Boolean));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [employees]);

  const statusesInData = useMemo(() => {
    const set = new Set(employees.map((e) => (e.status || "").trim()).filter(Boolean));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [employees]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return employees.filter((e) => {
      if (roleFilter !== "All" && e.role !== roleFilter) return false;
      if (statusFilter !== "All" && e.status !== statusFilter) return false;

      if (!query) return true;

      const hay = [e.full_name, e.email ?? "", e.phone ?? "", e.department ?? "", e.role ?? "", e.status ?? ""]
        .concat([e.first_name ?? "", e.middle_initial ?? "", e.last_name ?? "", e.nickname ?? ""])
        .join(" ")
        .toLowerCase();

      return hay.includes(query);
    });
  }, [employees, q, roleFilter, statusFilter]);

  /* ===============================
     Resend Invite + Audit
  =============================== */

  async function resendInvite(emp: Teammate) {
    const ok = confirm(`Reset login for ${emp.email || "this teammate"} with a new random temporary password?`);
    if (!ok) return;

    const res = await fetch("/api/employees/resend-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: emp.id }),
    });

    const contentType = res.headers.get("content-type") || "";
    const data: ResendInviteResponse = contentType.includes("application/json")
      ? await res.json()
      : { error: await res.text() };

    if (!res.ok) {
      alert(data?.error || "Failed to reset teammate login.");
      return;
    }

    // ✅ Audit (best-effort; don’t block user flow)
    await writeAudit({
      action: "reset_temp_password",
      table_name: "profiles",
      record_id: emp.id,
      meta: { email: emp.email ?? null },
    });

    const tempPassword = (data?.temporaryPassword || "").trim();
    const emailStatus =
      data?.inviteEmailSent === true
        ? "Invite email sent."
        : data?.inviteEmailConfigured === false
          ? "Invite email not sent (email service not configured)."
          : data?.inviteEmailError
            ? `Invite email failed (${data.inviteEmailError}).`
            : "Invite email status unknown.";
    alert(
      `Temporary password reset to ${tempPassword || "(not returned)"}. ${emailStatus} User must change password on next login.`
    );
  }

  async function auditEditClick(emp: Teammate) {
    // Optional: track that an admin opened an employee record
    await writeAudit({
      action: "open_employee_edit",
      table_name: "profiles",
      record_id: emp.id,
      meta: { email: emp.email ?? null },
    });
  }

  /* ===============================
     Render
  =============================== */

  return (
    <main style={{ padding: 32, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ marginBottom: 6 }}>Teammates</h1>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            Search, filter, and manage employee profiles.
          </div>
        </div>

        {canManage && (
          <Link href="/employees/new" style={buttonStyle}>
            + Add Teammate
          </Link>
        )}
      </div>

      {/* Filters */}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, phone, department..."
          style={{ ...inputStyle, minWidth: 260 }}
        />

        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={inputStyle}>
          {rolesInData.map((r) => (
            <option key={r} value={r}>
              Role: {r}
            </option>
          ))}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={inputStyle}>
          {statusesInData.map((s) => (
            <option key={s} value={s}>
              Status: {s}
            </option>
          ))}
        </select>

        <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.7 }}>
          Showing <strong>{filtered.length}</strong> of <strong>{employees.length}</strong>
        </div>
      </div>

      {/* Teammate Cards */}
      {loading ? (
        <p style={{ opacity: 0.7, marginTop: 18 }}>Loading...</p>
      ) : (
        <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
          {filtered.map((emp) => (
            <div key={emp.id} style={cardStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                {/* Left Side Info */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{displayName(emp)}</div>

                    <span style={badgeStyle()}>{prettyRole(emp.role)}</span>

                    <span style={badgeStyle()}>{emp.status || "Unknown"}</span>
                  </div>

                  {(() => {
                    const legalName = buildLegalName(emp);
                    const display = displayName(emp);
                    if (!legalName || legalName.toLowerCase() === display.toLowerCase()) return null;
                    return <div style={{ marginTop: 4, opacity: 0.66, fontSize: 12 }}>Legal: {legalName}</div>;
                  })()}

                  <div
                    style={{
                      marginTop: 8,
                      opacity: 0.75,
                      fontSize: 13,
                      lineHeight: 1.45,
                    }}
                  >
                    {emp.email && <div>Email: {emp.email}</div>}
                    {emp.phone && <div>Phone: {emp.phone}</div>}
                    {emp.department && <div>Dept: {emp.department}</div>}
                  </div>
                </div>

                {/* Right Side Actions */}
                {canManage && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                    <Link
                      href={`/employees/${encodeURIComponent(emp.id)}`}
                      style={smallButtonStyle}
                      onClick={() => auditEditClick(emp)}
                    >
                      Edit
                    </Link>

                    {emp.email && (
                      <button type="button" onClick={() => resendInvite(emp)} style={smallButtonStyle}>
                        Reset Password
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {!filtered.length && (
            <div style={{ ...cardStyle, opacity: 0.8 }}>No employees match your filters.</div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <Link href="/" style={{ opacity: 0.9 }}>
          ← Back Home
        </Link>
      </div>
    </main>
  );
}

/* ===============================
   Helpers
=============================== */

function prettyRole(role: string) {
  const r = (role || "").toLowerCase();
  if (r === "owner") return "Owner";
  if (r === "operations_manager") return "Operations Manager";
  if (r === "office_admin") return "Office Admin";
  if (r === "sales_manager") return "Sales Manager";
  if (r === "mechanic") return "Mechanic";
  if (r === "team_lead_1") return "Team Lead 1";
  if (r === "team_lead_2") return "Team Lead 2";
  if (r === "team_member_1") return "Team Member 1";
  if (r === "team_member_2") return "Team Member 2";
  if (r === "apprentice") return "Apprentice";
  if (r === "employee") return "Teammate (Legacy)";
  return role || "Unknown";
}

function badgeStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    fontSize: 12,
    fontWeight: 800,
  };
}

/* ===============================
   Styles
=============================== */

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 800,
  textDecoration: "none",
};

const smallButtonStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 700,
  textDecoration: "none",
  fontSize: 13,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
};
