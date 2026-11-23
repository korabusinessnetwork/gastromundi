
export default function TextInput({ value, onChange, placeholder, type = "text", maxLength, disabled, autoFocus, name, autoComplete, ignorarGerenciadorDeSenha }) {
  return (
    <input
      autoFocus={autoFocus}
      type={type}
      name={name}
      autoComplete={autoComplete}
      data-1p-ignore={ignorarGerenciadorDeSenha ? "" : undefined}
      data-lpignore={ignorarGerenciadorDeSenha ? "true" : undefined}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      className={`cfg__input${disabled ? " cfg__input--disabled" : ""}`}
    />
  );
}
