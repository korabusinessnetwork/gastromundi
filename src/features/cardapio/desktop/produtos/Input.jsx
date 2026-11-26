
export default function Input({ value, onChange, placeholder, maxLength, type }) {
  return (
    <input type={type ?? "text"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} className="produtos-view__input" />
  );
}
