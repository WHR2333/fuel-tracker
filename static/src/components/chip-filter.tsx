// Horizontal-scrolling chip filter. Single-select; value === current active chip.

interface Option<T extends string> {
  value: T;
  label: string;
  emoji?: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}

export function ChipFilter<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <div className="chip-filter">
      {options.map((o) => (
        <button
          key={o.value}
          className={`chip${o.value === value ? " active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.emoji ? `${o.emoji} ` : ""}{o.label}
        </button>
      ))}
    </div>
  );
}