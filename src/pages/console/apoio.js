import { LAYOUTS, layoutDoTema } from "@/layouts";

// Formatação e constantes da tela do Console, usadas pela tela e pelo gancho.
/**
 * Console da Plataforma (S1-2, ADR-008 §7).
 *
 * Painel do super-admin `plataforma` (dono do SaaS): lista os
 * estabelecimentos (tenants) e cria novos. É a tela que efetivamente
 * "liga" o multi-tenant comercial — o 2º cliente em diante nasce aqui.
 *
 * Por que é intuitiva (Princípio nº1): uma coisa só na tela — a lista de
 * estabelecimentos — e uma única ação principal, sempre visível no topo
 * ("Novo estabelecimento"). Cada um dos quatro estados tem tratamento
 * humano e explícito: carregando (esqueleto/spinner), vazio (convite a
 * criar o primeiro), erro (aviso + "Tentar de novo") e sucesso (faixa
 * verde confirmando o que foi criado). Nada de jargão: "estabelecimento",
 * "plano", "responsável".
 */

/**
 * Rótulos dos atalhos de situação, na linguagem do dono — nunca os nomes
 * técnicos dos status (`carencia`, `bloqueado`). A ordem de `FILTROS_SITUACAO`
 * é a ordem na tela: o recorte mais largo primeiro.
 */
export const ROTULOS_FILTRO = {
  todos: "Todos",
  atencao: "Precisam de atenção",
  em_dia: "Em dia",
};

/**
 * Quantos estabelecimentos a lista mostra por vez (CONSOLE-UX 14). Vinte cabe
 * em duas ou três rolagens e já passa da conta de quem precisa de atenção num
 * dia normal — quem quiser o resto pede.
 */
export const BLOCO_LISTA = 20;



export function formatarData(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

// `data_vencimento` é `date` puro (YYYY-MM-DD), sem hora. Passar por
// new Date() faria o navegador ler como UTC e recuar um dia no fuso do
// Brasil (-03) — "vence 04/08" para um vencimento em 05/08, justamente o
// número que o dono usa para decidir se cobra hoje. Formata pela string.
export function formatarVencimento(iso) {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

// Mostra o nome amigável do plano (do catálogo), com o código como
// fallback caso o catálogo não tenha carregado.
export function rotularPlano(planos, codigo) {
  return planos.find((p) => p.codigo === codigo)?.nome ?? codigo;
}

// Nome amigável do layout atual do tenant (catálogo src/layouts).
// layoutDoTema já degrada para "padrao" quando o tema não define layout.
export function rotularLayout(tema) {
  const codigo = layoutDoTema(tema);
  return LAYOUTS[codigo]?.nome ?? codigo;
}

// O botão diz QUANTOS add-ons estão ligados, não "Add-ons": o dono precisa
// enxergar da lista quem já contratou algo, sem abrir estabelecimento por
// estabelecimento (Princípio nº1 — estado sempre visível).
// Quando a leitura falha a contagem vem vazia, e vazio é indistinguível de
// "não tem nenhum" — o dono leria "Sem add-ons" em todos os cards e poderia
// desligar cobrança de quem tem módulo ligado. A tela diz que não sabe.
export function rotularAddons(quantos, erro) {
  if (erro) return "Add-ons indisponíveis";
  const n = Number(quantos) || 0;
  if (n === 0) return "Sem add-ons";
  if (n === 1) return "1 add-on";
  return `${n} add-ons`;
}
