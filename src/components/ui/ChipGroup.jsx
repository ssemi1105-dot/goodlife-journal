export default function ChipGroup({ options = [], value, onChange, multiple = false, compact = false }) {
  const selected = multiple ? (Array.isArray(value) ? value : []) : [value].filter(Boolean);

  function toggle(option) {
    if (multiple) {
      onChange(selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option]);
      return;
    }
    onChange(value === option ? '' : option);
  }

  return (
    <div className={compact ? 'chip-group compact-chip-group' : 'chip-group'}>
      {options.map((option) => (
        <button
          type="button"
          key={option}
          className={selected.includes(option) ? 'is-selected' : ''}
          onClick={() => toggle(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
