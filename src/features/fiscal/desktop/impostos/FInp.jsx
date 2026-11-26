
export default function FInp({ value, onChange, placeholder, maxLength, disabled, type = "text" }) {
  return (
    <input
      type={type}
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      className={`impostos-admin__input${disabled ? " impostos-admin__input--disabled" : ""}`}
    />
  );
}
