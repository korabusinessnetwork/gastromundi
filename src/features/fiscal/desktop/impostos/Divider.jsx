
export default function Divider({ label }) {
  return (
    <div className="impostos-admin__divider">
      <div className="impostos-admin__divider-linha" />
      <span className="impostos-admin__divider-label">{label}</span>
      <div className="impostos-admin__divider-linha" />
    </div>
  );
}

// ── Modal de configuração fiscal ─────────────────────────────────────
