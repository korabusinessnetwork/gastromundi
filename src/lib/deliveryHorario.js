// ──────────────────────────────────────────────────────────────────
// deliveryHorario — abertura automática do delivery (agendamento).
//
// O dono define, nas Configurações, os DIAS da semana e o HORÁRIO em que
// o delivery deve abrir e fechar sozinho. Isso mora em
// `config_delivery.horario` (JSONB) com a forma:
//
//   { auto: boolean, abre: "HH:MM"|null, fecha: "HH:MM"|null, dias: number[] }
//
//   • auto  — liga/desliga o agendamento. Desligado ⇒ controle 100% manual.
//   • abre  — hora que a loja abre (relógio local do operador).
//   • fecha — hora que a loja fecha. Pode ser MENOR que `abre` (vira a noite,
//             ex.: abre 18:00, fecha 02:00 do dia seguinte).
//   • dias  — dias de atendimento no padrão Date.getDay(): 0=domingo … 6=sábado.
//
// Sem servidor/cron (fase de bootstrap, custo zero): quem reconcilia o flag
// `config_delivery.aberto` com o horário é o app do operador enquanto está
// aberto — a mesma máquina que já opera o delivery. As funções aqui são
// PURAS (sem I/O, sem env) para nascerem com teste e serem reaproveitáveis.
// ──────────────────────────────────────────────────────────────────

// Dias da semana no padrão getDay() (0=domingo). `curto` para chips/resumo,
// `label` para leitura por extenso. Ordem = ordem de exibição na UI.
export const DIAS_SEMANA = [
  { id: 0, curto: "Dom", label: "Domingo" },
  { id: 1, curto: "Seg", label: "Segunda" },
  { id: 2, curto: "Ter", label: "Terça" },
  { id: 3, curto: "Qua", label: "Quarta" },
  { id: 4, curto: "Qui", label: "Quinta" },
  { id: 5, curto: "Sex", label: "Sexta" },
  { id: 6, curto: "Sáb", label: "Sábado" },
];

// Sugestão inicial ao ligar o agendamento pela primeira vez: todos os dias,
// 18:00 às 23:00. Só um ponto de partida amigável — o dono ajusta.
export const HORARIO_PADRAO = Object.freeze({
  auto: false,
  abre: "18:00",
  fecha: "23:00",
  dias: [0, 1, 2, 3, 4, 5, 6],
});

/**
 * "HH:MM" → minutos desde a meia-noite (0..1439). Aceita "8:05" e "08:05".
 * Qualquer coisa inválida (fora de faixa, formato errado, não-string) → null.
 * @param {string} hhmm
 * @returns {number|null}
 */
export function paraMinutos(hhmm) {
  if (typeof hhmm !== "string") return null;
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

// minutos → "HH:MM" (sempre zero-padded). Uso interno para normalizar.
function paraHHMM(min) {
  if (!Number.isFinite(min)) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Sanitiza o objeto de horário vindo da UI ou do banco. Nunca confia direto:
 * garante os tipos, zera dias inválidos/duplicados e normaliza "H:M" → "HH:MM".
 * Sempre devolve a forma completa (nunca campos faltando).
 * @param {*} bruto
 * @returns {{auto:boolean, abre:string|null, fecha:string|null, dias:number[]}}
 */
export function normalizarHorario(bruto) {
  const h = bruto && typeof bruto === "object" ? bruto : {};
  const dias = Array.isArray(h.dias)
    ? [...new Set(h.dias.map(Number))]
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
        .sort((a, b) => a - b)
    : [];
  const minAbre = paraMinutos(h.abre);
  const minFecha = paraMinutos(h.fecha);
  return {
    auto: h.auto === true,
    abre: minAbre == null ? null : paraHHMM(minAbre),
    fecha: minFecha == null ? null : paraHHMM(minFecha),
    dias,
  };
}

/**
 * O horário está completo o bastante para governar a abertura?
 * Desligado (auto:false) é sempre "válido" (não há o que preencher).
 * Ligado exige: abre e fecha válidos, diferentes entre si, e ao menos 1 dia.
 * Serve para habilitar o botão Salvar na UI (prevenção de erro, Princípio nº 1).
 * @param {*} horario
 * @returns {boolean}
 */
export function horarioValido(horario) {
  const h = normalizarHorario(horario);
  if (!h.auto) return true;
  return h.abre != null && h.fecha != null && h.abre !== h.fecha && h.dias.length > 0;
}

/**
 * Dado o horário e um instante `agora`, o delivery DEVERIA estar aberto?
 *   • null  ⇒ o agendamento não governa (desligado ou incompleto): não mexa
 *             no controle manual.
 *   • true  ⇒ dentro da janela de atendimento agora.
 *   • false ⇒ agendamento ativo e válido, mas fora da janela (dia/horário).
 *
 * Janela que vira a noite (fecha < abre) é tratada corretamente: no dia ativo
 * conta a partir de `abre`; a madrugada seguinte (o "rescaldo") só conta se o
 * dia ANTERIOR era um dia de atendimento.
 *
 * @param {*} horario  objeto de config_delivery.horario
 * @param {Date} [agora]
 * @returns {boolean|null}
 */
export function deliveryDeveEstarAberto(horario, agora = new Date()) {
  const h = normalizarHorario(horario);
  if (!h.auto) return null;
  const abre = paraMinutos(h.abre);
  const fecha = paraMinutos(h.fecha);
  // Incompleto ⇒ não governa (não fecha a loja por engano).
  if (abre == null || fecha == null || abre === fecha || h.dias.length === 0) return null;

  const dia = agora.getDay();
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  const ativo = (d) => h.dias.includes(d);

  if (fecha > abre) {
    // Janela no mesmo dia: [abre, fecha).
    return ativo(dia) && minutos >= abre && minutos < fecha;
  }
  // Janela noturna (vira a meia-noite).
  const diaAnterior = (dia + 6) % 7;
  const noturnoHoje = ativo(dia) && minutos >= abre; // trecho até a meia-noite
  const rescaldoOntem = ativo(diaAnterior) && minutos < fecha; // madrugada seguinte
  return noturnoHoje || rescaldoOntem;
}

/**
 * Compara o estado desejado (pelo horário) com o `aberto` gravado e diz se
 * é preciso mudar o flag — o coração da reconciliação client-side.
 *   • { mudar:false } quando o agendamento não governa OU já está no estado certo.
 *   • { mudar:true, aberto } quando o flag precisa virar para `aberto`.
 * @param {*} config  linha de config_delivery (usa .aberto e .horario)
 * @param {Date} [agora]
 * @returns {{mudar:boolean, aberto:boolean}}
 */
export function ajusteAutomaticoAbertura(config, agora = new Date()) {
  const desejado = deliveryDeveEstarAberto(config?.horario, agora);
  const atual = !!config?.aberto;
  if (desejado === null || desejado === atual) return { mudar: false, aberto: atual };
  return { mudar: true, aberto: desejado };
}

// Junta dias contíguos em "Seg a Sex"; senão lista "Dom, Sáb". Para exibição.
function resumoDias(dias) {
  const d = [...new Set(dias)].filter((n) => n >= 0 && n <= 6).sort((a, b) => a - b);
  if (d.length === 0) return "nenhum dia";
  if (d.length === 7) return "todos os dias";
  const contiguo = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
  if (contiguo && d.length >= 3) {
    return `${DIAS_SEMANA[d[0]].curto} a ${DIAS_SEMANA[d[d.length - 1]].curto}`;
  }
  return d.map((n) => DIAS_SEMANA[n].curto).join(", ");
}

/**
 * Frase amigável do agendamento para a tela, ex.:
 *   "Seg a Sex · 18:00 às 23:00"
 *   "todos os dias · 18:00 às 02:00 (do dia seguinte)"
 * Retorna null quando não há agendamento válido para descrever.
 * @param {*} horario
 * @returns {string|null}
 */
export function resumoHorario(horario) {
  const h = normalizarHorario(horario);
  if (!horarioValido(h) || !h.auto) return null;
  const vira = paraMinutos(h.fecha) < paraMinutos(h.abre);
  return `${resumoDias(h.dias)} · ${h.abre} às ${h.fecha}${vira ? " (do dia seguinte)" : ""}`;
}
