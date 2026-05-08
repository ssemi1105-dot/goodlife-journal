export default function SectionHeader({ eyebrow, title, action }) {
  return (
    <div className="section-title compact-section-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
