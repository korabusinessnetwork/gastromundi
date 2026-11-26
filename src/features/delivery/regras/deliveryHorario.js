// ──────────────────────────────────────────────────────────────────
// deliveryHorario — abertura automática do delivery (agendamento).
//
// O dono define, nas Configurações, os DIAS da semana e uma ou mais
// FAIXAS de horário em que o delivery deve abrir e fechar sozinho. Isso
// mora em `config_delivery.horario` (JSONB) com a forma:
//
//   { auto: boolean, dias: number[], faixas: [{ abre:"HH:MM", fecha:"HH:MM" }] }
//
//   • auto   — liga/desliga o agendamento. Desligado ⇒ controle 100% manual.
//   • dias   — dias de atendimento no padrão Date.getDay(): 0=domingo … 6=sábado.
//   • faixas — janelas de atendimento do dia. Cada faixa tem `abre`/`fecha`
//              (relógio local do operador). Suporta VÁRIAS por dia, ex.:
//              08:00–10:00, 11:00–14:00 e 18:00–00:00. `fecha` pode ser MENOR
//              que `abre` (vira a noite: abre 18:00, fecha 02:00 do dia seguinte).
//              As faixas valem para TODOS os dias selecionados em `dias`.
//
// Compatibilidade: configs antigas guardavam uma única janela em `abre`/`fecha`
// no topo do objeto. `normalizarHorario` migra esse formato para `faixas`
// automaticamente, então nada quebra ao ler dados já salvos.
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

// Faixa sugerida ao adicionar a primeira janela: 18:00 às 23:00. Só um
// ponto de partida amigável — o dono ajusta.
export const FAIXA_PADRAO = Object.freeze({ abre: "18:00", fecha: "23:00" });

// Sugestão inicial ao ligar o agendamento pela primeira vez: todos os dias,
// uma faixa 18:00 às 23:00. Só um ponto de partida amigável — o dono ajusta.
export const HORARIO_PADRAO = Object.freeze({
  auto: false,
  dias: [0, 1, 2, 3, 4, 5, 6],
  faixas: [{ ...FAIXA_PADRAO }],
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

// "HH:MM" (ou "H:M") → "HH:MM" zero-padded, ou null se inválido.
function normalizarHora(bruto) {
  const min = paraMinutos(bruto);
  return min == null ? null : paraHHMM(min);
}

/**
 * Extrai a lista de faixas de um objeto de horário, migrando o formato antigo
 * (uma única janela em `abre`/`fecha` no topo) para a lista `faixas`. Cada
 * faixa vira `{ abre, fecha }` com horas normalizadas ("H:M" → "HH:MM") ou
 * null. Faixas totalmente vazias (abre e fecha ambos nulos) são descartadas —
 * são ruído de edição, não janelas reais.
 * @param {object} h
 * @returns {{abre:string|null, fecha:string|null}[]}
 */
function normalizarFaixas(h) {
  const brutas = Array.isArray(h.faixas)
    ? h.faixas
    : // Formato legado: janela única em abre/fecha no topo do objeto.
      (h.abre != null || h.fecha != null ? [{ abre: h.abre, fecha: h.fecha }] : []);
  return brutas
    .filter((f) => f && typeof f === "object")
    .map((f) => ({ abre: normalizarHora(f.abre), fecha: normalizarHora(f.fecha) }))
    .filter((f) => f.abre != null || f.fecha != null);
}

/**
 * Sanitiza o objeto de horário vindo da UI ou do banco. Nunca confia direto:
 * garante os tipos, zera dias inválidos/duplicados, migra o formato legado de
 * janela única para `faixas` e normaliza cada hora "H:M" → "HH:MM".
 * Sempre devolve a forma completa (nunca campos faltando).
 * @param {*} bruto
 * @returns {{auto:boolean, dias:number[], faixas:{abre:string|null, fecha:string|null}[]}}
 */
export function normalizarHorario(bruto) {
  const h = bruto && typeof bruto === "object" ? bruto : {};
  const dias = Array.isArray(h.dias)
    ? [...new Set(h.dias.map(Number))]
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
        .sort((a, b) => a - b)
    : [];
  return {
    auto: h.auto === true,
    dias,
    faixas: normalizarFaixas(h),
  };
}

// Uma faixa individual está completa (abre e fecha válidos e diferentes)?
function faixaCompleta(f) {
  return f.abre != null && f.fecha != null && f.abre !== f.fecha;
}

/**
 * O horário está completo o bastante para governar a abertura?
 * Desligado (auto:false) é sempre "válido" (não há o que preencher).
 * Ligado exige: ao menos 1 dia, ao menos 1 faixa, e TODAS as faixas completas
 * (abre e fecha válidos e diferentes entre si).
 * Serve para habilitar o botão Salvar na UI (prevenção de erro, Princípio nº 1).
 * @param {*} horario
 * @returns {boolean}
 */
export function horarioValido(horario) {
  const h = normalizarHorario(horario);
  if (!h.auto) return true;
  return h.dias.length > 0 && h.faixas.length > 0 && h.faixas.every(faixaCompleta);
}

/**
 * Dado o horário e um instante `agora`, o delivery DEVERIA estar aberto?
 *   • null  ⇒ o agendamento não governa (desligado ou incompleto): não mexa
 *             no controle manual.
 *   • true  ⇒ dentro de ALGUMA faixa de atendimento agora.
 *   • false ⇒ agendamento ativo e válido, mas fora de todas as faixas.
 *
 * Faixa que vira a noite (fecha < abre) é tratada corretamente: no dia ativo
 * conta a partir de `abre`; a madrugada seguinte (o "rescaldo") só conta se o
 * dia ANTERIOR era um dia de atendimento. Com múltiplas faixas, basta UMA
 * estar aberta para o delivery estar aberto.
 *
 * @param {*} horario  objeto de config_delivery.horario
 * @param {Date} [agora]
 * @returns {boolean|null}
 */
export function deliveryDeveEstarAberto(horario, agora = new Date()) {
  const h = normalizarHorario(horario);
  if (!h.auto) return null;
  // Incompleto ⇒ não governa (não fecha a loja por engano).
  if (!horarioValido(h)) return null;

  const dia = agora.getDay();
  const diaAnterior = (dia + 6) % 7;
  const minutos = agora.getHours() * 60 + agora.getMinutes();
  const ativo = (d) => h.dias.includes(d);

  const faixaAberta = (f) => {
    const abre = paraMinutos(f.abre);
    const fecha = paraMinutos(f.fecha);
    if (fecha > abre) {
      // Janela no mesmo dia: [abre, fecha).
      return ativo(dia) && minutos >= abre && minutos < fecha;
    }
    // Janela noturna (vira a meia-noite).
    const noturnoHoje = ativo(dia) && minutos >= abre; // trecho até a meia-noite
    const rescaldoOntem = ativo(diaAnterior) && minutos < fecha; // madrugada seguinte
    return noturnoHoje || rescaldoOntem;
  };

  return h.faixas.some(faixaAberta);
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

// Uma faixa → "18:00 às 23:00" (ou "… (do dia seguinte)" quando vira a noite).
// Fecha às 00:00 (meia-noite) é o fim natural do dia, não vira a madrugada —
// coerente com deliveryDeveEstarAberto, que não gera rescaldo quando fecha=0.
function resumoFaixa(f) {
  const fecha = paraMinutos(f.fecha);
  const vira = fecha < paraMinutos(f.abre) && fecha !== 0;
  return `${f.abre} às ${f.fecha}${vira ? " (do dia seguinte)" : ""}`;
}

/**
 * Frase amigável do agendamento para a tela, ex.:
 *   "Seg a Sex · 18:00 às 23:00"
 *   "todos os dias · 08:00 às 10:00, 11:00 às 14:00, 18:00 às 00:00"
 *   "Dom, Sáb · 18:00 às 02:00 (do dia seguinte)"
 * Retorna null quando não há agendamento válido para descrever.
 * @param {*} horario
 * @returns {string|null}
 */
export function resumoHorario(horario) {
  const h = normalizarHorario(horario);
  if (!h.auto || !horarioValido(h)) return null;
  return `${resumoDias(h.dias)} · ${h.faixas.map(resumoFaixa).join(", ")}`;
}
