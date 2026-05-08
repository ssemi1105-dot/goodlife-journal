export default function ModalHeader({ eyebrow, title, onClose, children }) {
  return (
    <header className="modal-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {children}
      </div>
      <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">×</button>
    </header>
  );
}
