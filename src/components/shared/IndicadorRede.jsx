import "./IndicadorRede.css";

// Badge global de estado da conexão (Leva 11 — offline-first).
// Recebe tudo por props (montado dentro do AppProvider, não consome o
// contexto). Some quando está online e sem pendências — presença na tela
// só quando há algo que o operador precisa saber.
export default function IndicadorRede({
  online,
  pendencias = 0,
  visivel = true,
  falhaEnvio = false,
  semArmazenamento = false,
}) {
  if (!visivel) return null;
  if (online && pendencias === 0 && !semArmazenamento) return null;

  const guardados = `${pendencias} ${pendencias === 1 ? "pedido guardado" : "pedidos guardados"}`;

  // `semArmazenamento` é o banco local que não abriu (aba anônima, dados de site
  // bloqueados, outra aba segurando uma versão antiga). A fila continua
  // funcionando, mas só na memória desta aba: fechar o navegador apaga pedido
  // que já saiu para o cliente. Prometer "pedidos guardados" aqui seria mentira,
  // então o aviso vem na frente de tudo quando há pendência de verdade, e fica
  // discreto enquanto não há nada em risco.
  if (semArmazenamento) {
    if (pendencias > 0) {
      return (
        <div className="indicador-rede indicador-rede--alerta" role="status" aria-live="polite">
          <span className="indicador-rede__ponto" aria-hidden="true" />
          {`Atenção, ${guardados} só nesta aba, fechar o navegador perde ${pendencias === 1 ? "esse pedido" : "esses pedidos"}`}
        </div>
      );
    }
    return (
      <div
        className={`indicador-rede ${online ? "indicador-rede--aviso" : "indicador-rede--offline"}`}
        role="status"
        aria-live="polite"
      >
        <span className="indicador-rede__ponto" aria-hidden="true" />
        {online
          ? "Este navegador não está guardando os pedidos, evite fechar a aba"
          : "Sem internet, e os pedidos ficam só nesta aba, evite fechar o navegador"}
      </div>
    );
  }

  // `falhaEnvio` é a última tentativa de envio que parou num erro de rede com o
  // navegador ainda se dizendo online (link do provedor caído, portal cativo,
  // servidor fora do ar). Antes a tela dizia "Enviando..." para sempre nessa
  // situação, afirmando estar fazendo o que não estava. Quem opera precisa
  // saber que a fila está PARADA, e que alguém vai tentar de novo sozinho.
  let texto;
  let variante;
  if (!online) {
    texto = pendencias > 0
      ? `Sem internet, ${guardados} para enviar`
      : "Sem internet, os pedidos ficam guardados aqui";
    variante = "indicador-rede--offline";
  } else if (falhaEnvio) {
    texto = `Sem conexão com o servidor, ${guardados} esperando, tentando de novo sozinho`;
    variante = "indicador-rede--falha";
  } else {
    texto = `Enviando ${guardados}...`;
    variante = "indicador-rede--sincronizando";
  }

  return (
    <div
      className={`indicador-rede ${variante}`}
      role="status"
      aria-live="polite"
    >
      <span className="indicador-rede__ponto" aria-hidden="true" />
      {texto}
    </div>
  );
}
