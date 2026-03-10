"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

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

  const effectiveHighlightedIndex =
    highlightedIndex >= 0 && highlightedIndex < filtered.length
      ? highlightedIndex
      : filtered.length > 0
        ? 0
        : -1;
  const activeOptionId =
    effectiveHighlightedIndex >= 0
      ? `${listboxId}-opt-${filtered[effectiveHighlightedIndex]?.id}`
      : undefined;

  function closeMenu() {
    setOpen(false);
    setQuery("");
    setHighlightedIndex(-1);
  }

  function openMenu(preferred: "selected" | "first" | "last" = "selected") {
    if (disabled) return;
    const list = options;
    let nextIndex = -1;
    if (preferred === "selected") {
      const selectedIndex = list.findIndex((option) => option.id === value);
      nextIndex = selectedIndex >= 0 ? selectedIndex : list.length > 0 ? 0 : -1;
    } else if (preferred === "last") {
      nextIndex = list.length - 1;
    } else {
      nextIndex = list.length > 0 ? 0 : -1;
    }
    setQuery("");
    setHighlightedIndex(nextIndex);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      closeMenu();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
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
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => {
          if (open) {
            closeMenu();
            return;
          }
          openMenu("selected");
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openMenu("first");
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            openMenu("last");
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openMenu("selected");
          }
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
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId}
              placeholder="Search teammate..."
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeMenu();
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlightedIndex((prev) => {
                    const start = prev < 0 ? 0 : prev + 1;
                    return Math.min(filtered.length - 1, start);
                  });
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlightedIndex((prev) => {
                    if (prev < 0) return filtered.length - 1;
                    return Math.max(0, prev - 1);
                  });
                  return;
                }
                if (event.key === "Home") {
                  event.preventDefault();
                  setHighlightedIndex(filtered.length > 0 ? 0 : -1);
                  return;
                }
                if (event.key === "End") {
                  event.preventDefault();
                  setHighlightedIndex(filtered.length - 1);
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  const option = filtered[effectiveHighlightedIndex];
                  if (!option) return;
                  onChange(option.id);
                  closeMenu();
                }
              }}
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
          <div
            id={listboxId}
            role="listbox"
            aria-label={placeholder}
            style={{ maxHeight: 290, overflowY: "auto" }}
          >
            {allowClear ? (
              <div
                id={`${listboxId}-opt-clear`}
                role="option"
                aria-selected={!value}
                style={optionButtonStyle}
                onMouseEnter={() => setHighlightedIndex(-1)}
                onClick={() => {
                  onChange("");
                  closeMenu();
                }}
              >
                <div style={{ opacity: 0.78 }}>{clearLabel}</div>
              </div>
            ) : null}
            {filtered.map((option, index) => (
              <div
                key={option.id}
                id={`${listboxId}-opt-${option.id}`}
                role="option"
                aria-selected={value === option.id}
                style={{
                  ...optionButtonStyle,
                  background:
                    effectiveHighlightedIndex === index
                      ? "rgba(120,180,255,0.2)"
                      : value === option.id
                        ? "rgba(120,180,255,0.15)"
                        : "transparent",
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => {
                  onChange(option.id);
                  closeMenu();
                }}
              >
                <EmployeeBadgeRow option={option} avatarUrl={avatarUrlById?.[option.id]} />
              </div>
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
