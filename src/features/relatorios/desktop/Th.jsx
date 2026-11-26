
export default function Th({ children, right }) {
  return (
    <th className={"relatorio-view__th" + (right ? " relatorio-view__th--direita" : "")}>
      {children}
    </th>
  );
}
