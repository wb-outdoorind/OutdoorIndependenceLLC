import MaintenanceScheduleCard from "./MaintenanceScheduleCard";
import type { AssigneeOption, DropCardArgs, MaintenanceCardData } from "./types";

type ScheduleCardListProps = {
  cards: MaintenanceCardData[];
  compactCards: boolean;
  columnDate: string | null;
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

export default function ScheduleCardList({
  cards,
  compactCards,
  columnDate,
  draggingTaskKey,
  focusedTaskKey,
  assigneeOptions,
  assigneeLabelMap,
  onDragStart,
  onDragEnd,
  onDropCard,
  onAssign,
  onTimeChange,
}: ScheduleCardListProps) {
  return (
    <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
      {cards.map((card, index) => (
        <MaintenanceScheduleCard
          key={card.key}
          card={card}
          compact={compactCards}
          isFocused={focusedTaskKey === card.key}
          assigneeOptions={assigneeOptions}
          assigneeLabel={assigneeLabelMap.get(card.assignedTo ?? "") || "Unassigned"}
          onAssign={onAssign}
          onTimeChange={onTimeChange}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDrop={() => {
            if (!draggingTaskKey) return;
            onDropCard({
              taskKey: draggingTaskKey,
              targetDate: columnDate,
              targetIndex: index,
            });
            onDragEnd();
          }}
        />
      ))}
    </div>
  );
}
