
export default function Td({ children, right, muted, nowrap, color }) {
  return (
    <td
      className={
        "relatorio-view__td"
        + (right  ? " relatorio-view__td--direita" : "")
        + (muted  ? " relatorio-view__td--apagado" : "")
        + (nowrap ? " relatorio-view__td--nowrap"  : "")
      }
      style={{ "--td-cor": color }}
    >
      {children}
    </td>
  );
}
