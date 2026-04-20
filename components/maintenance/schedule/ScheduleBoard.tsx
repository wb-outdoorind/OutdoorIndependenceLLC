import ScheduleDayColumn from "./ScheduleDayColumn";
import type {
  AssigneeOption,
  DropCardArgs,
  ScheduleColumnData,
} from "./types";

type ScheduleBoardProps = {
  columns: ScheduleColumnData[];
  unscheduledColumn: ScheduleColumnData | null;
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

export default function ScheduleBoard({
  columns,
  unscheduledColumn,
  draggingTaskKey,
  focusedTaskKey,
  assigneeOptions,
  assigneeLabelMap,
  onDragStart,
  onDragEnd,
  onDropCard,
  onAssign,
  onTimeChange,
}: ScheduleBoardProps) {
  const totalColumns = columns.length + (unscheduledColumn ? 1 : 0);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${totalColumns}, minmax(200px, 1fr))`,
        gap: 10,
        overflowX: "auto",
        alignItems: "start",
      }}
    >
      {unscheduledColumn ? (
        <ScheduleDayColumn
          column={unscheduledColumn}
          compactCards={false}
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
      ) : null}
      {columns.map((column) => (
        <ScheduleDayColumn
          key={column.id}
          column={column}
          compactCards={true}
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
      ))}
    </div>
  );
}
