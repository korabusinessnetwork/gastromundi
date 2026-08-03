import "./SeloStatus.css";

/**
 * Selo humano de situação da assinatura, compartilhado pelo Console.
 *
 * Nasceu dentro do `PlanosDashboard` e saiu de lá quando a lista de
 * estabelecimentos passou a mostrar a mesma informação: com duas cópias, as
 * duas abas acabariam divergindo no texto (uma diria "Em atraso", a outra
 * "Vencido") para o mesmo tenant, e quem lê não teria como saber qual está
 * certa. Uma definição só, nas duas telas.
 *
 * Rótulo em português do dia a dia, sem jargão de billing (Princípio nº1):
 * `carencia` vira "Em atraso", `sem_assinatura` vira "Sem assinatura".
 *
 * @param {"ativo"|"carencia"|"bloqueado"|"cancelado"|"sem_assinatura"} status
 * @param {number|null} [dias] dias para vencer (negativo = já venceu)
 */
export default function SeloStatus({ status, dias }) {
  const mapa = {
    ativo:
      dias != null && dias <= 5
        ? { classe: "vencendo", texto: dias === 0 ? "Vence hoje" : `Vence em ${dias} dia${dias === 1 ? "" : "s"}` }
        : { classe: "ativo", texto: "Ativo" },
    carencia: { classe: "carencia", texto: dias != null ? `Em atraso (${Math.abs(dias)}d)` : "Em atraso" },
    bloqueado: { classe: "bloqueado", texto: "Bloqueado" },
    cancelado: { classe: "cancelado", texto: "Cancelado" },
    sem_assinatura: { classe: "sem", texto: "Sem assinatura" },
  };
  const { classe, texto } = mapa[status] ?? mapa.sem_assinatura;
  return <span className={`selo-status selo-status--${classe}`}>{texto}</span>;
}
