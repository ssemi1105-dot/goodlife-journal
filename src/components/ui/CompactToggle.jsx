export default function CompactToggle({ checked, onChange, label, className = '', disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`compact-toggle ${checked ? 'is-on' : ''} ${className}`}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      onKeyDown={(event) => {
        if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onChange(!checked);
        }
      }}
    >
      <span className="compact-toggle-track">
        <i />
      </span>
      {label && <strong>{label}</strong>}
    </button>
  );
}
