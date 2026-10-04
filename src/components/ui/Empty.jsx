export default function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="empty">
      {Icon && (
        <div className="empty-icon">
          <Icon />
        </div>
      )}
      {title && <div className="empty-title">{title}</div>}
      {children && <div className="empty-text">{children}</div>}
      {action}
    </div>
  );
}
