import "./IndicadorRede.css";

// Badge global de estado da conexão (Leva 11 — offline-first).
// Recebe tudo por props (montado dentro do AppProvider, não consome o
// contexto). Some quando está online e sem pendências — presença na tela
// só quando há algo que o operador precisa saber.
export default function IndicadorRede({ online, pendencias = 0, visivel = true }) {
  if (!visivel) return null;
  if (online && pendencias === 0) return null;

  const texto = !online
    ? pendencias > 0
      ? `Sem internet — ${pendencias} ${pendencias === 1 ? "pedido guardado" : "pedidos guardados"} para enviar`
      : "Sem internet — os pedidos ficam guardados aqui"
    : `Enviando ${pendencias} ${pendencias === 1 ? "pedido guardado" : "pedidos guardados"}...`;

  return (
    <div
      className={`indicador-rede ${online ? "indicador-rede--sincronizando" : "indicador-rede--offline"}`}
      role="status"
      aria-live="polite"
    >
      <span className="indicador-rede__ponto" aria-hidden="true" />
      {texto}
    </div>
  );
}
