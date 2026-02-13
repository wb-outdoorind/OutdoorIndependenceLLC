"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { writeAudit } from "@/lib/audit";

type Employee = {
  id: string;
  full_name: string;
  role: string;
  status: string;
  email: string | null;
  phone: string | null;
  department: string | null;
};

export default function EmployeesClient({ role }: { role: string }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const canManage = role === "owner" || role === "office_admin";

  /* ===============================
     Load Employees
  =============================== */

  useEffect(() => {
    async function loadEmployees() {
      const supabase = createSupabaseBrowser();

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role, status, email, phone, department")
        .order("full_name");

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
        .join(" ")
        .toLowerCase();

      return hay.includes(query);
    });
  }, [employees, q, roleFilter, statusFilter]);

  /* ===============================
     Resend Invite + Audit
  =============================== */

  async function resendInvite(emp: Employee) {
    const ok = confirm(`Resend invite email to ${emp.email || "this employee"}?`);
    if (!ok) return;

    const res = await fetch("/api/employees/resend-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: emp.id }),
    });

    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await res.json()
      : { error: await res.text() };

    if (!res.ok) {
      alert(data?.error || "Failed to resend invite.");
      return;
    }

    // ✅ Audit (best-effort; don’t block user flow)
    await writeAudit({
      action: "resend_invite",
      table_name: "profiles",
      record_id: emp.id,
      meta: { email: emp.email ?? null },
    });

    alert("Invite resent successfully.");
  }

  async function auditEditClick(emp: Employee) {
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
          <h1 style={{ marginBottom: 6 }}>Employees</h1>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            Search, filter, and manage employee profiles.
          </div>
        </div>

        {canManage && (
          <Link href="/employees/new" style={buttonStyle}>
            + Add Employee
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

      {/* Employee Cards */}
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
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{emp.full_name}</div>

                    <span style={badgeStyle()}>{prettyRole(emp.role)}</span>

                    <span style={badgeStyle()}>{emp.status || "Unknown"}</span>
                  </div>

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
                        Resend Invite
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
  if (r === "office_admin") return "Office Admin";
  if (r === "mechanic") return "Mechanic";
  if (r === "employee") return "Employee";
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
