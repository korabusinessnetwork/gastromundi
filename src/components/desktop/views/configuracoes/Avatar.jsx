
export default function Avatar({ name, size = 40 }) {
  const initials = (name ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="cfg__avatar" style={{ "--avatar-tam": `${size}px` }}>
      {initials}
    </div>
  );
}
