
export default function CardBtn({ onClick, children }) {
  return (
    <button onClick={onClick} className="admin__card-btn">
      {children}
    </button>
  );
}
