import type { CSSProperties } from "react";
import ScheduleCardList from "./ScheduleCardList";
import ScheduleColumnHeader from "./ScheduleColumnHeader";
import type { AssigneeOption, DropCardArgs, ScheduleColumnData } from "./types";

type ScheduleDayColumnProps = {
  column: ScheduleColumnData;
  compactCards: boolean;
  draggingTaskKey: string | null;
  focusedTaskKey: string | null;
  assigneeOptions: AssigneeOption[];
  assigneeLabelMap: Map<string, string>;
  onDragStart: (taskKey: string) => void;
  onDragEnd: () => void;
  onDropCard: (args: DropCardArgs) => void;
  onAssign: (taskKey: string, assigneeId: string | null) => void;
  onTimeChange: (taskKey: string, time: string | null) => void;
};

const columnStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 10,
  background: "rgba(255,255,255,0.03)",
  minHeight: 320,
};

export default function ScheduleDayColumn({
  column,
  compactCards,
  draggingTaskKey,
  focusedTaskKey,
  assigneeOptions,
  assigneeLabelMap,
  onDragStart,
  onDragEnd,
  onDropCard,
  onAssign,
  onTimeChange,
}: ScheduleDayColumnProps) {
  return (
    <div
      style={columnStyle}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (!draggingTaskKey) return;
        onDropCard({
          taskKey: draggingTaskKey,
          targetDate: column.date,
          targetIndex: null,
        });
        onDragEnd();
      }}
    >
      <ScheduleColumnHeader
        label={column.label}
        subtitle={column.subtitle}
        count={column.cards.length}
      />
      <ScheduleCardList
        cards={column.cards}
        compactCards={compactCards}
        columnDate={column.date}
        draggingTaskKey={draggingTaskKey}
        focusedTaskKey={focusedTaskKey}
        assigneeOptions={assigneeOptions}
        assigneeLabelMap={assigneeLabelMap}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDropCard={onDropCard}
        onAssign={onAssign}
        onTimeChange={onTimeChange}
      />
    </div>
  );
}
