export default function ChipGroup({ options = [], value, onChange, multiple = false, compact = false }) {
  const selected = multiple ? (Array.isArray(value) ? value : []) : [value].filter(Boolean);
  const getOptionValue = (option) => (option && typeof option === 'object' ? option.value : option);
  const getOptionLabel = (option) => (option && typeof option === 'object' ? option.label : option);

  function toggle(option) {
    const optionValue = getOptionValue(option);
    if (multiple) {
      onChange(selected.includes(optionValue)
        ? selected.filter((item) => item !== optionValue)
        : [...selected, optionValue]);
      return;
    }
    onChange(value === optionValue ? '' : optionValue);
  }

  return (
    <div className={compact ? 'chip-group compact-chip-group' : 'chip-group'}>
      {options.map((option) => (
        <button
          type="button"
          key={getOptionValue(option)}
          className={selected.includes(getOptionValue(option)) ? 'is-selected' : ''}
          onClick={() => toggle(option)}
        >
          {getOptionLabel(option)}
        </button>
      ))}
    </div>
  );
}
