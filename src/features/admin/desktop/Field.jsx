
export default function Field({ label, children }) {
  return (
    <div className="admin__field">
      <div className="admin__field-label">
        {label}
      </div>
      {children}
    </div>
  );
}
