"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type Choice = "pass" | "fail" | "na";

type EquipmentRow = {
  id: string;
  name: string | null;
  equipment_type: string | null;
  current_hours: number | null;
};

type TemplateRow = {
  id: string;
  equipment_type: string;
  name: string;
  checklist: unknown;
  is_active: boolean;
};

type ChecklistItem = {
  key: string;
  label: string;
};

function equipmentHoursKey(equipmentId: string) {
  return `equipment:${equipmentId}:hours`;
}

function normalizeChecklist(raw: unknown): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  if (!raw) return items;

  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 1) {
      const entry = raw[i];
      if (typeof entry === "string" && entry.trim()) {
        items.push({ key: `item_${i}`, label: entry.trim() });
        continue;
      }
      if (entry && typeof entry === "object") {
        const obj = entry as { key?: unknown; label?: unknown; name?: unknown };
        const key = typeof obj.key === "string" && obj.key.trim() ? obj.key.trim() : `item_${i}`;
        const labelCandidate = typeof obj.label === "string" ? obj.label : typeof obj.name === "string" ? obj.name : "";
        const label = labelCandidate.trim() || key;
        items.push({ key, label });
      }
    }
    return items;
  }

  if (typeof raw === "object") {
    const obj = raw as { items?: unknown } & Record<string, unknown>;

    if (Array.isArray(obj.items)) {
      return normalizeChecklist(obj.items);
    }

    const entries = Object.entries(obj).filter(([k]) => k !== "items");
    for (let i = 0; i < entries.length; i += 1) {
      const [key, value] = entries[i];
      if (!key.trim()) continue;

      if (typeof value === "string" && value.trim()) {
        items.push({ key, label: value.trim() });
      } else if (value && typeof value === "object") {
        const maybe = value as { label?: unknown; name?: unknown };
        const labelCandidate = typeof maybe.label === "string" ? maybe.label : typeof maybe.name === "string" ? maybe.name : "";
        items.push({ key, label: labelCandidate.trim() || key });
      } else {
        items.push({ key, label: key });
      }
    }
  }

  return items;
}

function ChoiceToggle({ value, onChange }: { value: Choice; onChange: (v: Choice) => void }) {
  const pill = (active: boolean): React.CSSProperties => ({
    padding: "6px 10px",
    borderRadius: 999,
    border: active ? "1px solid rgba(255,255,255,0.26)" : "1px solid rgba(255,255,255,0.14)",
    background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    userSelect: "none",
  });

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <span style={pill(value === "pass")} onClick={() => onChange("pass")}>Pass</span>
      <span style={pill(value === "fail")} onClick={() => onChange("fail")}>Fail</span>
      <span style={pill(value === "na")} onClick={() => onChange("na")}>N/A</span>
    </div>
  );
}

export default function EquipmentPreventativeMaintenancePage() {
  const router = useRouter();
  const params = useParams<{ equipmentID: string }>();
  const equipmentId = decodeURIComponent(params.equipmentID);

  const [equipment, setEquipment] = useState<EquipmentRow | null>(null);
  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);

  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [resultState, setResultState] = useState<Record<string, Choice>>({});

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setLoadError(null);

      const supabase = createSupabaseBrowser();
      const { data: equipmentData, error: equipmentError } = await supabase
        .from("equipment")
        .select("id,name,equipment_type,current_hours")
        .eq("id", equipmentId)
        .maybeSingle();

      if (!alive) return;
      if (equipmentError) {
        console.error("[equipment-pm] equipment load error:", equipmentError);
        setLoadError(equipmentError.message);
        setLoading(false);
        return;
      }

      const eq = (equipmentData as EquipmentRow | null) ?? null;
      if (!eq) {
        setLoadError(`Equipment not found. Tried id=\"${equipmentId}\"`);
        setLoading(false);
        return;
      }

      setEquipment(eq);
      if (typeof eq.current_hours === "number") {
        setHours(String(eq.current_hours));
      }

      if (!eq.equipment_type?.trim()) {
        setTemplate(null);
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: templateData, error: templateError } = await supabase
        .from("equipment_pm_templates")
        .select("id,equipment_type,name,checklist,is_active")
        .eq("equipment_type", eq.equipment_type)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!alive) return;
      if (templateError) {
        console.error("[equipment-pm] template load error:", templateError);
        setLoadError(templateError.message);
        setLoading(false);
        return;
      }

      const tpl = (templateData as TemplateRow | null) ?? null;
      setTemplate(tpl);

      const normalized = normalizeChecklist(tpl?.checklist);
      setItems(normalized);
      setResultState(
        normalized.reduce<Record<string, Choice>>((acc, item) => {
          acc[item.key] = "pass";
          return acc;
        }, {})
      );

      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, [equipmentId]);

  const failCount = useMemo(() => {
    return Object.values(resultState).filter((v) => v === "fail").length;
  }, [resultState]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!equipment) {
      setSubmitError("Equipment not loaded.");
      return;
    }

    const parsedHours = hours.trim() ? Number(hours) : null;
    if (hours.trim() && (!Number.isFinite(parsedHours) || (parsedHours ?? 0) < 0)) {
      alert("Enter valid hours.");
      return;
    }

    const summary = failCount > 0 ? `${failCount} failed item(s)` : "All checked items passed";

    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("equipment_pm_events").insert({
      equipment_id: equipment.id,
      template_id: template?.id ?? null,
      hours: parsedHours,
      notes: notes.trim() || null,
      result: {
        templateName: template?.name ?? null,
        summary,
        checklistItems: items,
        responses: resultState,
      },
    });

    if (error) {
      console.error("[equipment-pm] event insert failed:", error);
      setSubmitError(error.message);
      return;
    }

    if (parsedHours != null) {
      localStorage.setItem(equipmentHoursKey(equipment.id), String(parsedHours));
    }

    router.push(`/equipment/${encodeURIComponent(equipment.id)}`);
  }

  const missingTemplate = !loading && !loadError && (!template || items.length === 0);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", paddingBottom: 32 }}>
      <h1 style={{ marginBottom: 6 }}>Equipment Preventative Maintenance</h1>
      <div style={{ opacity: 0.75, lineHeight: 1.4 }}>
        Equipment ID: <strong>{equipmentId}</strong>
        {equipment?.name ? (
          <>
            {" "}• <strong>{equipment.name}</strong>
          </>
        ) : null}
        <span style={{ marginLeft: 10, opacity: 0.85 }}>
          Type: <strong>{equipment?.equipment_type ?? "-"}</strong>
        </span>
      </div>

      {loading ? <div style={{ marginTop: 12, opacity: 0.75 }}>Loading template...</div> : null}

      {loadError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d", opacity: 0.95 }}>{loadError}</div>
      ) : null}

      {missingTemplate ? (
        <div style={{ marginTop: 12, ...cardStyle() }}>
          <div style={{ fontWeight: 900 }}>No PM template found for this equipment type.</div>
          <div style={{ marginTop: 8, opacity: 0.8 }}>
            Create a template for <strong>{equipment?.equipment_type ?? "this type"}</strong> to enable PM events.
          </div>
          <Link
            href={`/equipment/pm-templates/new?equipmentType=${encodeURIComponent(equipment?.equipment_type ?? "")}`}
            style={{ display: "inline-block", marginTop: 10, ...buttonStyle }}
          >
            Create PM Template
          </Link>
        </div>
      ) : null}

      {submitError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ff9d9d", opacity: 0.95 }}>
          Failed to save PM event: {submitError}
        </div>
      ) : null}

      {!missingTemplate && template ? (
        <form onSubmit={onSubmit} style={{ marginTop: 16 }}>
          <div style={cardStyle()}>
            <div style={{ fontWeight: 900 }}>{template.name}</div>
            <div style={{ marginTop: 4, opacity: 0.75, fontSize: 13 }}>
              {items.length} checklist item{items.length === 1 ? "" : "s"}
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {items.map((item) => (
                <div
                  key={item.key}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    padding: 10,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>{item.label}</div>
                  <ChoiceToggle
                    value={resultState[item.key] ?? "pass"}
                    onChange={(v) => setResultState((prev) => ({ ...prev, [item.key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16, ...cardStyle() }}>
            <div style={gridStyle()}>
              <Field label="Hours (optional)">
                <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="numeric" placeholder="e.g. 1540" style={inputStyle()} />
              </Field>

              <Field label="Summary">
                <div style={{ ...inputStyle(), opacity: 0.85, minHeight: 42 }}>
                  {failCount > 0 ? `${failCount} failed item(s)` : "All checked items passed"}
                </div>
              </Field>
            </div>

            <div style={{ marginTop: 12 }}>
              <Field label="Notes (optional)">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} style={{ ...inputStyle(), resize: "vertical" }} />
              </Field>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" style={buttonStyle()}>
              Save PM Event
            </button>
            <button type="button" onClick={() => router.push(`/equipment/${encodeURIComponent(equipmentId)}`)} style={secondaryButtonStyle()}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function gridStyle(): React.CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.03)",
    color: "inherit",
  };
}

function buttonStyle(): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "inherit",
    fontWeight: 900,
    textDecoration: "none",
    cursor: "pointer",
  };
}

function secondaryButtonStyle(): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "transparent",
    color: "inherit",
    fontWeight: 800,
    cursor: "pointer",
    opacity: 0.9,
  };
}
