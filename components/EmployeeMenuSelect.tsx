"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  employeeBadgeInitials,
  employeeBadgePrimary,
  employeeBadgeSearchText,
  employeeBadgeSecondary,
  type EmployeeBadgeOption,
} from "@/lib/employeeBadges";

type EmployeeMenuSelectProps = {
  value: string;
  onChange: (nextValue: string) => void;
  options: EmployeeBadgeOption[];
  placeholder: string;
  disabled?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
  avatarUrlById?: Record<string, string>;
  style?: React.CSSProperties;
};

const triggerBaseStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  textAlign: "left",
};

const panelStyle: React.CSSProperties = {
  position: "absolute",
  zIndex: 120,
  left: 0,
  right: 0,
  marginTop: 6,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(16,18,24,0.98)",
  boxShadow: "0 20px 45px rgba(0,0,0,0.45)",
  overflow: "hidden",
};

const optionButtonStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "transparent",
  color: "inherit",
  textAlign: "left",
  padding: "8px 10px",
  cursor: "pointer",
};

function avatarStyle() {
  return {
    width: 30,
    height: 30,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.08)",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    fontSize: 12,
    fontWeight: 900,
    flexShrink: 0,
  } as const;
}

function EmployeeBadgeRow({
  option,
  selected,
  avatarUrl,
}: {
  option: EmployeeBadgeOption;
  selected?: boolean;
  avatarUrl?: string;
}) {
  const primary = employeeBadgePrimary(option);
  const secondary = employeeBadgeSecondary(option);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
      <div style={avatarStyle()}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={primary}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span>{employeeBadgeInitials(option)}</span>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 800,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {primary}
        </div>
        <div
          style={{
            opacity: selected ? 0.92 : 0.74,
            fontSize: 12,
            lineHeight: 1.25,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {secondary}
        </div>
      </div>
    </div>
  );
}

export default function EmployeeMenuSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  allowClear = false,
  clearLabel = "Clear selection",
  avatarUrlById,
  style,
}: EmployeeMenuSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return options.find((option) => option.id === trimmed) ?? null;
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => employeeBadgeSearchText(option).includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => queryInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        style={{ ...triggerBaseStyle, ...style }}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        disabled={disabled}
      >
        {selected ? (
          <EmployeeBadgeRow
            option={selected}
            selected
            avatarUrl={avatarUrlById?.[selected.id]}
          />
        ) : (
          <span style={{ opacity: 0.72 }}>{placeholder}</span>
        )}
        <span aria-hidden style={{ opacity: 0.7, fontSize: 12 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div style={panelStyle}>
          <div style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <input
              ref={queryInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search teammate..."
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.03)",
                color: "inherit",
              }}
            />
          </div>
          <div style={{ maxHeight: 290, overflowY: "auto" }}>
            {allowClear ? (
              <button
                type="button"
                style={optionButtonStyle}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <div style={{ opacity: 0.78 }}>{clearLabel}</div>
              </button>
            ) : null}
            {filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                style={{
                  ...optionButtonStyle,
                  background: value === option.id ? "rgba(120,180,255,0.15)" : "transparent",
                }}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                <EmployeeBadgeRow option={option} avatarUrl={avatarUrlById?.[option.id]} />
              </button>
            ))}
            {!filtered.length ? (
              <div style={{ padding: "10px 12px", opacity: 0.72 }}>No teammates found.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
