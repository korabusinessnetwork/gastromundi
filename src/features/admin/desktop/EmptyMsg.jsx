
export default function EmptyMsg({ icon: Icon, msg }) {
  return (
    <div className="admin__empty">
      <div className="admin__empty-icone"><Icon size={44} /></div>
      <div className="admin__empty-msg">{msg}</div>
    </div>
  );
}
