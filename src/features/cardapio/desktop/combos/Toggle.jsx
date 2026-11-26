export default function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`combos-view__toggle${value ? " combos-view__toggle--ligado" : ""}`}
    >
      <span className="combos-view__toggle-bolinha" />
    </button>
  );
}
