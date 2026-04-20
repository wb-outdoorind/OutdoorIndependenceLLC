import Link from "next/link";
import { useState, type CSSProperties } from "react";
import AssigneeSelect from "./AssigneeSelect";
import ScheduleTimeField from "./ScheduleTimeField";
import type { AssigneeOption, MaintenanceCardData } from "./types";

type MaintenanceScheduleCardProps = {
  card: MaintenanceCardData;
  compact: boolean;
  isFocused: boolean;
  assigneeOptions: AssigneeOption[];
  assigneeLabel: string;
  onAssign: (taskKey: string, assigneeId: string | null) => void;
  onTimeChange: (taskKey: string, time: string | null) => void;
  onDragStart: (taskKey: string) => void;
  onDragEnd: () => void;
  onDrop: () => void;
};

const buttonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.08)",
  color: "inherit",
  borderRadius: 10,
  padding: "8px 10px",
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
  fontSize: 12,
};

const expandAffordanceStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  opacity: 0.72,
  whiteSpace: "nowrap",
};

function softBadgeStyle(): CSSProperties {
  return {
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.2)",
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
}

function statusBadgeStyle(status: MaintenanceCardData["status"]): CSSProperties {
  if (status === "Closed") {
    return {
      ...softBadgeStyle(),
      borderColor: "rgba(80,200,120,0.45)",
      background: "rgba(80,200,120,0.14)",
    };
  }
  if (status === "Open" || status === "Pending Approval") {
    return {
      ...softBadgeStyle(),
      borderColor: "rgba(245,200,90,0.45)",
      background: "rgba(245,200,90,0.16)",
    };
  }
  if (status === "In Progress") {
    return {
      ...softBadgeStyle(),
      borderColor: "rgba(120,180,255,0.45)",
      background: "rgba(120,180,255,0.16)",
    };
  }
  return softBadgeStyle();
}

function waitingOnPartsBadgeStyle(): CSSProperties {
  return {
    ...softBadgeStyle(),
    borderColor: "rgba(255,170,85,0.55)",
    background: "rgba(255,170,85,0.18)",
  };
}

function overdueBadgeStyle(): CSSProperties {
  return {
    ...softBadgeStyle(),
    borderColor: "rgba(255,138,138,0.62)",
    background: "rgba(255,115,115,0.2)",
    color: "#ffd9d9",
  };
}

function priorityBadgeStyle(priority: MaintenanceCardData["priority"]): CSSProperties {
  if (priority === "Urgent") {
    return {
      ...softBadgeStyle(),
      borderColor: "rgba(255,120,120,0.55)",
      background: "rgba(255,120,120,0.16)",
    };
  }
  if (priority === "High") {
    return {
      ...softBadgeStyle(),
      borderColor: "rgba(255,175,90,0.55)",
      background: "rgba(255,175,90,0.16)",
    };
  }
  if (priority === "Low") {
    return {
      ...softBadgeStyle(),
      borderColor: "rgba(140,220,170,0.45)",
      background: "rgba(140,220,170,0.13)",
    };
  }
  return softBadgeStyle();
}

export default function MaintenanceScheduleCard({
  card,
  compact,
  isFocused,
  assigneeOptions,
  assigneeLabel,
  onAssign,
  onTimeChange,
  onDragStart,
  onDragEnd,
  onDrop,
}: MaintenanceScheduleCardProps) {
  const showDerivedWaiting =
    card.waitingOnParts &&
    (card.status === "Open" || card.status === "Scheduled" || card.status === "Pending Approval");
  const displayStatus = showDerivedWaiting ? "Waiting on Parts" : card.status;
  const [expanded, setExpanded] = useState(false);
  const showCompactMode = compact;
  const showDetailControls = showCompactMode ? expanded : true;

  return (
    <div
      data-maintenance-task-key={card.key}
      draggable
      onDragStart={() => onDragStart(card.key)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      onClick={(event) => {
        if (!showCompactMode) return;
        const target = event.target as HTMLElement;
        if (target.closest("a,button,input,select,textarea,label")) return;
        setExpanded((prev) => !prev);
      }}
      style={{
        border: card.overdue
          ? "1px solid rgba(255,120,120,0.38)"
          : card.waitingOnParts
          ? "1px solid rgba(255,170,85,0.34)"
          : "1px solid rgba(255,255,255,0.12)",
        borderRadius: 12,
        background: card.overdue
          ? "rgba(255,120,120,0.09)"
          : card.waitingOnParts
          ? "rgba(255,170,85,0.07)"
          : "rgba(255,255,255,0.03)",
        boxShadow: isFocused ? "0 0 0 2px rgba(120,180,255,0.5), 0 10px 22px rgba(0,0,0,0.36)" : "none",
        padding: showCompactMode ? "7px 8px" : 10,
        display: "grid",
        gap: showCompactMode ? 5 : 8,
        cursor: showCompactMode ? "pointer" : "grab",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 900, fontSize: showCompactMode ? 12.5 : 14, lineHeight: showCompactMode ? 1.15 : 1.25 }}>
          {card.title}
        </div>
        {showCompactMode ? (
          <span style={expandAffordanceStyle}>{expanded ? "Hide ▴" : "Details ▾"}</span>
        ) : (
          <span style={statusBadgeStyle(displayStatus)}>{displayStatus}</span>
        )}
      </div>
      <div style={{ fontSize: showCompactMode ? 11 : 12, opacity: 0.8 }}>
        {card.assetName} • {card.assetType === "vehicle" ? "Vehicle" : "Equipment"}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={priorityBadgeStyle(card.priority)}>{card.priority}</span>
        <span style={{ ...softBadgeStyle(), fontWeight: 700, opacity: 0.86 }}>{assigneeLabel}</span>
        {card.overdue ? <span style={overdueBadgeStyle()}>Overdue</span> : null}
        {card.waitingOnParts ? (
          <span style={waitingOnPartsBadgeStyle()}>
            Waiting on Parts
            {card.waitingOnPartsSources > 1 ? ` (${card.waitingOnPartsSources})` : ""}
          </span>
        ) : null}
        {card.scheduledTime ? (
          <span style={{ ...softBadgeStyle(), opacity: 0.86, fontWeight: 700 }}>
            {card.scheduledTime.slice(0, 5)}
          </span>
        ) : null}
      </div>

      {showCompactMode && expanded ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(false);
            }}
            style={{
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.05)",
              color: "inherit",
              borderRadius: 8,
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Collapse
          </button>
        </div>
      ) : null}

      {showDetailControls ? (
        <>
          {showCompactMode ? <span style={statusBadgeStyle(displayStatus)}>{displayStatus}</span> : null}
          <AssigneeSelect
            value={card.assignedTo}
            options={assigneeOptions}
            onChange={(assigneeId) => onAssign(card.key, assigneeId)}
          />
          <ScheduleTimeField
            value={card.scheduledTime}
            onChange={(time) => onTimeChange(card.key, time)}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={card.requestHref} style={buttonStyle}>
              Open Request
            </Link>
            <Link href={card.assetHref} style={buttonStyle}>
              Open Asset
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
