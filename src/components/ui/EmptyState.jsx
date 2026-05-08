export default function EmptyState({ title = '표시할 내용이 없습니다.', description = '' }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {description && <span>{description}</span>}
    </div>
  );
}
