import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { deliveryDeveEstarAberto, paraMinutos } from "./deliveryHorario";

/**
 * Guard da leva 5 do Run 6 — o delivery decidia coisas do dia a dia do
 * restaurante no relógio de Greenwich (20260903_delivery_horario_e_numero_
 * no_fuso.sql).
 *
 * Dois defeitos com a mesma raiz:
 *   D14 — o número humano do pedido usava `now()` e `created_at::date` em
 *         UTC. Às 21h de Brasília o expediente "virava o dia" e a contagem
 *         reiniciava em 001 no meio do movimento. E como a sequência saía
 *         de `count(*)+1`, apagar um pedido do dia fazia a conta devolver
 *         para sempre um número que já existia — com UNIQUE(tenant, numero),
 *         a vitrine parava de aceitar pedidos e não voltava sozinha.
 *   D15 — o horário de funcionamento (`config_delivery.horario`) não era
 *         lido por NENHUMA função do servidor. Quem abria e fechava a loja
 *         era um setInterval dentro da tela do Delivery: sem um admin com
 *         aquela tela aberta na hora da virada, a loja não abria (prejuízo
 *         silencioso) ou não fechava (pedido às 3 da manhã).
 *
 * Não existe Postgres neste ambiente, então a prova é feita em duas metades
 * que se completam:
 *
 *   (1) A migration termina num bloco DO $$ ... $$ que EXECUTA as funções
 *       novas contra casos conhecidos e ABORTA a migração se algum resultado
 *       divergir. Isso prova, no banco de verdade e no momento de aplicar,
 *       que o SQL faz o que os casos dizem.
 *
 *   (2) Este teste lê aqueles mesmos casos do arquivo e confere cada
 *       expectativa contra `deliveryDeveEstarAberto`/`paraMinutos` — a regra
 *       em JS que a UI usa. Isso prova que os casos do autoteste são a
 *       verdade do app, e não uma segunda regra inventada no SQL.
 *
 * Juntas: SQL == casos (provado ao aplicar) e casos == JS (provado aqui).
 * Se alguém mexer no SQL e afrouxar um caso para "passar", este teste
 * quebra; se mexer no SQL sem mexer nos casos, a migration não aplica.
 *
 * Migrations são histórico imutável: os arquivos que introduziram o
 * problema continuam no disco como estão, e a corretiva usa CREATE OR
 * REPLACE. O guard garante que ela roda depois de todos eles.
 */
const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
const MIGRACAO_CORRETIVA = "20260903_delivery_horario_e_numero_no_fuso.sql";

const FUSO_PADRAO = "America/Sao_Paulo";

const conteudoCorretiva = readFileSync(join(MIGRATIONS_DIR, MIGRACAO_CORRETIVA), "utf8");

// Tira os comentários ANTES de juntar as linhas: sem isso, um "--" engoliria
// todo o resto do bloco ao virar uma linha só. Corta também o comentário de
// FIM de linha: sem isso um `-- antes era , 3, '0')` escrito ao lado de código
// correto seria lido como se fosse o código. Cortar em `--` cegamente
// estragaria uma string SQL que contivesse `--`; não existe nenhuma nas
// migrations de delivery, e se um dia existir é aqui que se trata.
function semComentarioDeFim(linha) {
  return linha.replace(/--.*$/, "");
}

function semComentarios(sql) {
  return sql
    .split("\n")
    .map((linha) => (linha.trim().startsWith("--") ? "" : semComentarioDeFim(linha)))
    .join("\n");
}

function linhasAtivas(sql) {
  return sql
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("--"))
    .map(semComentarioDeFim);
}

// Corpo do autoteste (do DO $auto$ até o fim), em uma linha só.
const blocoAutoteste = semComentarios(
  conteudoCorretiva.slice(conteudoCorretiva.indexOf("DO $auto$"))
).replace(/\s+/g, " ");

// Variáveis de horário declaradas no topo do autoteste (h_dia, h_noite, …).
function horariosDeclarados(bloco) {
  const mapa = new Map();
  const re = /(\w+)\s+jsonb\s*:=\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(bloco)) !== null) mapa.set(m[1], JSON.parse(m[2]));
  return mapa;
}

// Divide os argumentos de uma chamada respeitando as strings SQL — o JSON do
// horário está cheio de vírgulas dentro de aspas.
function separarArgumentos(bruto) {
  const args = [];
  let atual = "";
  let dentroDeString = false;
  for (const ch of bruto) {
    if (ch === "'") dentroDeString = !dentroDeString;
    if (ch === "," && !dentroDeString) {
      args.push(atual.trim());
      atual = "";
      continue;
    }
    atual += ch;
  }
  if (atual.trim() !== "") args.push(atual.trim());
  return args;
}

function valorSql(bruto) {
  if (bruto == null) return undefined;
  const t = bruto.trim();
  if (/^NULL$/i.test(t)) return null;
  if (/^TRUE$/i.test(t)) return true;
  if (/^FALSE$/i.test(t)) return false;
  if (t.startsWith("'")) return t.slice(1, -1);
  return t; // nome de variável
}

// '2026-07-29 21:00:00+00' → Date. O offset de 2 dígitos do Postgres não é
// ISO válido em todo motor de JS; completa para +00:00.
function paraInstante(texto) {
  const iso = texto.trim().replace(" ", "T");
  return new Date(/[+-]\d{2}$/.test(iso) ? `${iso}:00` : iso);
}

/**
 * O relógio de parede de um fuso, como um Date que responde getDay()/
 * getHours() nesses valores — é assim que a regra em JS lê a hora, e é o
 * único jeito de comparar com o SQL sem depender do fuso da máquina do CI.
 */
function relogioLocal(instante, fuso) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(instante)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return new Date(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour) % 24,
    Number(partes.minute),
    Number(partes.second)
  );
}

// Casos de delivery_aberto_agora extraídos do autoteste. Dentro de um
// `IF ... IS NOT TRUE THEN RAISE`, o resultado ESPERADO é TRUE.
function casosDeAbertura(bloco, declarados) {
  const casos = [];
  const re = /public\.delivery_aberto_agora\s*\(([^()]*)\)\s*IS NOT (TRUE|FALSE)/gi;
  let m;
  while ((m = re.exec(bloco)) !== null) {
    const args = separarArgumentos(m[1]);
    const horarioBruto = valorSql(args[0]);
    const horario =
      horarioBruto === null
        ? null
        : declarados.has(horarioBruto)
          ? declarados.get(horarioBruto)
          : JSON.parse(horarioBruto);
    casos.push({
      chamada: m[0],
      horario,
      manual: valorSql(args[1]),
      fuso: args.length > 2 ? valorSql(args[2]) : FUSO_PADRAO,
      instante: args.length > 3 ? valorSql(args[3]) : null,
      esperado: m[2].toUpperCase() === "TRUE",
    });
  }
  return casos;
}

// Casos de hhmm_para_minutos. `<> 485` espera 485; `IS NOT NULL` espera nulo.
function casosDeMinutos(bloco) {
  const casos = [];
  const re = /public\.hhmm_para_minutos\s*\(([^()]*)\)\s*(?:<>\s*(\d+)|IS NOT NULL)/gi;
  let m;
  while ((m = re.exec(bloco)) !== null) {
    casos.push({
      chamada: m[0],
      entrada: valorSql(m[1]),
      esperado: m[2] === undefined ? null : Number(m[2]),
    });
  }
  return casos;
}

const declarados = horariosDeclarados(blocoAutoteste);
const casosAbertura = casosDeAbertura(blocoAutoteste, declarados);
const casosMinutos = casosDeMinutos(blocoAutoteste);

/**
 * O texto de uma função dentro de um arquivo, da assinatura à próxima — já sem
 * comentários. Conferir âncora sobre o fonte cru é falso positivo garantido: o
 * corpo consertado EXPLICA em português a fórmula que substituiu, então as
 * palavras do bug continuam escritas no arquivo depois de sumirem do código. E
 * o recorte também precisa do texto limpo: existe migration com um
 * `CREATE OR REPLACE FUNCTION` citado dentro de comentário, que abriria um
 * bloco fantasma.
 */
function blocosDaFuncao(sql, nomeFuncao) {
  const limpo = semComentarios(sql);
  const marcas = [...limpo.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_0-9]+)\b/g)];
  return marcas
    .map((marca, i) => ({
      nome: marca[1],
      texto: limpo.slice(marca.index, i + 1 < marcas.length ? marcas[i + 1].index : limpo.length),
    }))
    .filter((bloco) => bloco.nome === nomeFuncao)
    .map((bloco) => bloco.texto);
}

/**
 * As duas formas erradas de numerar o pedido, e a única certa.
 *
 * `lpad(n::text, 3, '0')` TRUNCA o que passa de três dígitos: o pedido 1000
 * virava 100 e colidia com o de número 100. A troca óbvia, `to_char(n,'FM000')`,
 * é pior: o Postgres não expande o gabarito, o que não cabe vira '###', e '###'
 * não casa com o filtro `-[0-9]+` que alimenta o MAX — a sequência para de
 * enxergar a própria linha, repete o número para sempre e a loja trava.
 *
 * A proibição precisa exigir a VÍRGULA antes do 3 (`, 3, '0')`), senão ela
 * acusa o próprio conserto: `greatest(3, length(...))` também contém "3,".
 */
const LPAD_QUE_TRUNCA = /\blpad\s*\(.*,\s*3\s*,\s*'0'\s*\)/;
const TO_CHAR_QUE_ESTOURA = /'FM0+'/;
const LPAD_QUE_CRESCE = /\blpad\s*\([^,]+,\s*greatest\(\s*3\s*,\s*length\(/;

/** O conserto, por função: se um destes sumir do corpo, o bug voltou. */
const ANCORAS_DO_CONSERTO = {
  criar_pedido_delivery: {
    exigidas: [
      /to_char\(timezone\(v_fuso, now\(\)\), 'YYMMDD'\)/,
      LPAD_QUE_CRESCE,
      /IF NOT COALESCE\(public\.delivery_aberto_agora\(v_cfg\.horario, v_cfg\.aberto, v_fuso\), false\) THEN/,
    ],
    proibidas: [LPAD_QUE_TRUNCA, TO_CHAR_QUE_ESTOURA],
  },
  cardapio_publico: {
    exigidas: [
      /'aberto',\s*public\.delivery_aberto_agora\(\s*v_cfg\.horario, v_cfg\.aberto, v_cfg\.fuso\)/,
    ],
    proibidas: [],
  },
};

describe("Delivery — guard do horário e do número do pedido no fuso do estabelecimento", () => {
  it("a migração corretiva roda depois das que definiram as funções, e quem vier depois leva o conserto junto", () => {
    const arquivos = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));
    expect(arquivos).toContain(MIGRACAO_CORRETIVA);

    const definidoras = arquivos.filter((nome) => {
      if (nome === MIGRACAO_CORRETIVA) return false;
      const sql = readFileSync(join(MIGRATIONS_DIR, nome), "utf8");
      return (
        /FUNCTION public\.criar_pedido_delivery/.test(sql) ||
        /FUNCTION public\.cardapio_publico/.test(sql)
      );
    });

    // Sanity: as duas funções nasceram em migrations anteriores.
    const anteriores = definidoras.filter((nome) => nome < MIGRACAO_CORRETIVA);
    expect(anteriores.length).toBeGreaterThan(0);

    // Migration é histórico imutável, então este arquivo não pode "rodar
    // depois de tudo" para sempre: uma correção futura vai refazer as
    // mesmas funções. O que precisa valer é que ela carregue o conserto
    // adiante — o jeito mais fácil de perder este bug de novo é copiar um
    // corpo antigo por cima da versão consertada, e nada quebraria.
    let blocosConferidos = 0;
    for (const posterior of definidoras.filter((nome) => nome > MIGRACAO_CORRETIVA)) {
      const sql = readFileSync(join(MIGRATIONS_DIR, posterior), "utf8");
      for (const [funcao, ancoras] of Object.entries(ANCORAS_DO_CONSERTO)) {
        for (const bloco of blocosDaFuncao(sql, funcao)) {
          blocosConferidos += 1;
          for (const ancora of ancoras.exigidas) {
            expect(
              ancora.test(bloco),
              `${posterior} redefine ${funcao} sem ${ancora} — o conserto do fuso/número foi desfeito`
            ).toBe(true);
          }
          for (const proibida of ancoras.proibidas) {
            expect(
              proibida.test(bloco),
              `${posterior} redefine ${funcao} usando ${proibida} — a numeração do pedido voltou a quebrar`
            ).toBe(false);
          }
        }
      }
    }

    // Hoje a 20260907 refaz as duas funções. Se um rename fizer
    // `blocosDaFuncao` devolver vazio, o laço acima não asserta nada e o teste
    // passaria oco — verde sem ter conferido coisa nenhuma.
    expect(blocosConferidos).toBeGreaterThan(0);
  });

  it("a corretiva recria as duas funções e cria a coluna de fuso", () => {
    expect(conteudoCorretiva).toMatch(
      /CREATE OR REPLACE FUNCTION public\.criar_pedido_delivery/
    );
    expect(conteudoCorretiva).toMatch(/CREATE OR REPLACE FUNCTION public\.cardapio_publico/);
    expect(conteudoCorretiva).toMatch(
      /ALTER TABLE public\.config_delivery\s+ADD COLUMN IF NOT EXISTS fuso text/
    );
  });

  it("nenhuma linha ativa da corretiva volta a usar o dia de Greenwich, o lpad que trunca ou o FM000 que estoura", () => {
    const ativas = linhasAtivas(conteudoCorretiva);
    // O dia do pedido não pode mais sair de created_at em UTC.
    expect(ativas.filter((l) => /created_at::date\s*=\s*now\(\)::date/.test(l))).toEqual([]);
    // As duas formas que quebram a numeração, pelos motivos do comentário de
    // LPAD_QUE_TRUNCA lá em cima.
    expect(ativas.filter((l) => LPAD_QUE_TRUNCA.test(l))).toEqual([]);
    expect(ativas.filter((l) => TO_CHAR_QUE_ESTOURA.test(l))).toEqual([]);
    // A sequência não pode voltar a sair de count(*), que trava a loja depois
    // de um pedido apagado.
    expect(ativas.filter((l) => /count\(\*\)\s*\+\s*1/.test(l))).toEqual([]);
    // O dia vem do fuso do estabelecimento, e o número é formatado sem truncar.
    expect(conteudoCorretiva).toMatch(/to_char\(timezone\(v_fuso, now\(\)\), 'YYMMDD'\)/);
    expect(conteudoCorretiva).toMatch(/max\(split_part\(numero, '-', 2\)::int\), 0\) \+ v_try/);
    expect(LPAD_QUE_CRESCE.test(conteudoCorretiva)).toBe(true);
  });

  it("a proibição pega a fórmula que trunca e deixa passar a que cresce", () => {
    // Sem provar os dois lados, o caminho mais fácil de "fazer o guard passar"
    // é afrouxar a regex até ela não pegar mais nada — e aí o guard vira
    // enfeite justamente no dia em que alguém reintroduzir o bug.
    expect(LPAD_QUE_TRUNCA.test("v_numero := lpad(v_seq::text, 3, '0');")).toBe(true);
    expect(LPAD_QUE_TRUNCA.test("v_numero := lpad(numero, 3,'0');")).toBe(true);
    expect(TO_CHAR_QUE_ESTOURA.test("to_char(v_seq, 'FM000')")).toBe(true);

    const certa = "lpad(v_seq::text, greatest(3, length(v_seq::text)), '0')";
    expect(LPAD_QUE_TRUNCA.test(certa)).toBe(false);
    expect(TO_CHAR_QUE_ESTOURA.test(certa)).toBe(false);
    expect(LPAD_QUE_CRESCE.test(certa)).toBe(true);
  });

  it("a âncora não se satisfaz com a fórmula citada dentro de um comentário", () => {
    // O corpo consertado explica em português o que substituiu, então as duas
    // fórmulas antigas continuam escritas no arquivo — só que em comentário.
    // Se a conferência olhasse o fonte cru, o guard aprovaria texto morto.
    const sql = [
      "CREATE OR REPLACE FUNCTION public.criar_pedido_delivery()",
      "-- antes: to_char(v_seq, 'FM000') e lpad(v_seq::text, 3, '0')",
      "BEGIN",
      "  v_numero := 'sem numeração aqui';  -- to_char(v_seq, 'FM000')",
      "END;",
    ].join("\n");
    const [bloco] = blocosDaFuncao(sql, "criar_pedido_delivery");
    expect(TO_CHAR_QUE_ESTOURA.test(bloco)).toBe(false);
    expect(LPAD_QUE_TRUNCA.test(bloco)).toBe(false);
  });

  it("as duas portas de entrada passaram a consultar o horário, e a do pedido continua fail-closed", () => {
    // Vitrine: o `aberto` publicado é o resultado do horário, não o flag cru.
    expect(conteudoCorretiva).toMatch(
      /'aberto',\s*public\.delivery_aberto_agora\(\s*v_cfg\.horario, v_cfg\.aberto, v_cfg\.fuso\)/
    );
    // Entrada do pedido: NULL não pode escorregar como "aberto".
    expect(conteudoCorretiva).toMatch(
      /IF NOT COALESCE\(public\.delivery_aberto_agora\(v_cfg\.horario, v_cfg\.aberto, v_fuso\), false\) THEN/
    );
    // Fuso inválido não derruba a loja: cai no padrão.
    expect(conteudoCorretiva).toMatch(/FUNCTION public\.fuso_valido/);
    expect(conteudoCorretiva).toMatch(/pg_timezone_names/);
  });

  it("o corpo da regra em SQL espelha cláusula por cláusula a regra em JS", () => {
    // A prova definitiva de comportamento é o DO $auto$, que roda no Postgres
    // na hora de aplicar. Mas ele roda UMA vez: se alguém editar este arquivo
    // depois, ninguém mais executa aquelas asserções. Estas âncoras são o
    // arame no CI — cada uma corresponde a um jeito concreto de a loja quebrar.
    const ativas = linhasAtivas(conteudoCorretiva).join("\n");

    // Fim EXCLUSIVO da janela. Com `<=`, a loja fica aberta um minuto depois
    // de fechar, todo dia, e aceita um pedido que ninguém vai fazer.
    expect(ativas).toMatch(/v_minutos\s*<\s*v_fecha\[v_i\]/);
    expect(ativas).not.toMatch(/v_minutos\s*<=\s*v_fecha/);

    // "Ontem" para o rescaldo da madrugada. Com `+ 1` viraria "amanhã": a
    // madrugada de quinta passaria a depender de sexta ser dia de atendimento.
    expect(ativas).toMatch(/\(v_dia \+ 6\) % 7/);

    // 0 = domingo, igual a getDay(). ISODOW é 1..7 e deslocaria a semana toda.
    expect(ativas).toMatch(/EXTRACT\(DOW\s+FROM v_local\)/);
    expect(ativas).not.toMatch(/ISODOW/);

    // A faixa é descartada pelo valor NORMALIZADO, não pelo JSON cru — é o que
    // normalizarFaixas faz. Filtrar no cru mantém a faixa ilegível na lista e
    // derruba o agendamento inteiro por ruído de edição.
    expect(ativas).toMatch(/\)\s*k\s*WHERE a IS NOT NULL OR b IS NOT NULL;/);
    expect(ativas).not.toMatch(/f ->> '(abre|fecha)' IS NOT NULL/);

    // `auto` é estritamente o booleano true (h.auto === true no app).
    expect(ativas).toMatch(/p_horario -> 'auto', 'null'::jsonb\) <> 'true'::jsonb/);

    // Agendamento incompleto devolve o controle manual — nunca fecha por engano.
    expect(ativas).toMatch(
      /IF cardinality\(v_dias\) = 0 OR v_qtd = 0 OR v_furadas > 0 THEN\s*\n\s*RETURN v_manual;/
    );
  });

  it("a corretiva termina com o autoteste que aborta a migração se o SQL divergir", () => {
    expect(conteudoCorretiva).toMatch(/DO \$auto\$/);
    expect(conteudoCorretiva.trimEnd().endsWith("$auto$;")).toBe(true);
    // Um autoteste que não levanta exceção não testa nada.
    expect((blocoAutoteste.match(/RAISE EXCEPTION/g) || []).length).toBeGreaterThan(20);
  });

  it("o autoteste cobre os dois defeitos e as bordas da regra", () => {
    expect(casosAbertura.length).toBeGreaterThanOrEqual(20);
    expect(casosMinutos.length).toBeGreaterThanOrEqual(5);
    expect(declarados.size).toBeGreaterThanOrEqual(4);

    // Precisa existir ao menos um par de casos no MESMO instante com fusos
    // diferentes e resultados opostos — é isso que prova que o relógio do
    // estabelecimento manda, e não o de Greenwich.
    const comInstante = casosAbertura.filter((c) => c.instante);
    const parDeFusos = comInstante.some((a) =>
      comInstante.some(
        (b) =>
          a.instante === b.instante &&
          a.fuso !== b.fuso &&
          JSON.stringify(a.horario) === JSON.stringify(b.horario) &&
          a.esperado !== b.esperado
      )
    );
    expect(parDeFusos).toBe(true);

    // E ao menos um caso em que o horário CONTRARIA o flag gravado em cada
    // sentido — o defeito era justamente o flag mandar sozinho.
    expect(
      casosAbertura.some((c) => c.instante && c.manual === false && c.esperado === true)
    ).toBe(true);
    expect(
      casosAbertura.some((c) => c.instante && c.manual === true && c.esperado === false)
    ).toBe(true);
  });

  it.each(casosMinutos.map((c) => [c.chamada, c]))(
    "hhmm_para_minutos concorda com paraMinutos — %s",
    (_titulo, caso) => {
      expect(paraMinutos(caso.entrada)).toBe(caso.esperado);
    }
  );

  it.each(casosAbertura.map((c) => [c.chamada, c]))(
    "delivery_aberto_agora concorda com deliveryDeveEstarAberto — %s",
    (_titulo, caso) => {
      if (caso.instante) {
        const agora = relogioLocal(paraInstante(caso.instante), caso.fuso);
        const governa = deliveryDeveEstarAberto(caso.horario, agora);
        expect(governa ?? !!caso.manual).toBe(caso.esperado);
      } else {
        // Sem instante explícito o SQL usa now(): o caso só pode ser um em que
        // o agendamento NÃO governa, senão o resultado dependeria da hora em
        // que o teste roda.
        expect(deliveryDeveEstarAberto(caso.horario, new Date())).toBeNull();
        expect(!!caso.manual).toBe(caso.esperado);
      }
    }
  );
});
