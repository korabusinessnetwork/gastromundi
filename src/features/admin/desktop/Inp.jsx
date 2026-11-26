
export default function Inp({ value, onChange, placeholder, type = "text", disabled }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`admin__input${disabled ? " admin__input--disabled" : ""}`}
    />
  );
}
