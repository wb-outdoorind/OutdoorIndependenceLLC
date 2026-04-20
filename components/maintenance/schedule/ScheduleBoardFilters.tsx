type ScheduleBoardFiltersProps = {
  showUnscheduled: boolean;
  onToggleUnscheduled: (value: boolean) => void;
};

export default function ScheduleBoardFilters({
  showUnscheduled,
  onToggleUnscheduled,
}: ScheduleBoardFiltersProps) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <input
        type="checkbox"
        checked={showUnscheduled}
        onChange={(event) => onToggleUnscheduled(event.target.checked)}
      />
      Show Unscheduled
    </label>
  );
}
