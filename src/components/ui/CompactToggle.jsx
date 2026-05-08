export default function CompactToggle({ checked, onChange, label, className = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`compact-toggle ${checked ? 'is-on' : ''} ${className}`}
      onClick={() => onChange(!checked)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
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
