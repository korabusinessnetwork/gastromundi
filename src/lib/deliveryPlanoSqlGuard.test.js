import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import MODULOS from "@/constants/modulos";

/**
 * Guard de regressão do DL30 — a vitrine pública tem que respeitar o plano.
 *
 * `delivery` é módulo pago. Toda rota do dono é fechada por
 * `requiredModulo={MODULOS.DELIVERY}`, mas as quatro RPCs que o cliente
 * final chama SEM LOGIN só conferiam se o slug resolvia um tenant. Numa
 * queda de plano ('avancado' → 'medio') a loja pública seguia no ar
 * recebendo pedido de verdade enquanto /app/delivery ficava bloqueado:
 * pedido que ninguém prepara, e módulo pago rodando de graça.
 *
 * O conserto é de um ponto só — as quatro resolvem o tenant pelo helper
 * `delivery_tenant_por_slug`, e o gate entra ali. Este arquivo existe
 * para que esse "um ponto só" continue verdadeiro: a checagem mais
 * importante aqui não é a linha do gate (item b), é o item (f), que
 * cobra que TODA versão das RPCs anônimas passe pelo helper. No dia em
 * que alguém escrever uma RPC pública que leia `tenants` por slug
 * direto, o gate deixa de cobrir tudo — e é este teste que avisa.
 *
 * Não há Postgres no CI, então o que se garante aqui é o texto da
 * migração (mesmo instrumento de rlsJwtClaimGuard.test.js e
 * deliveryLimitesSqlGuard.test.js):
 *   (a) ela existe e roda depois de tudo que ela precisa já estar de pé;
 *   (b) o gate está no helper, com o código de módulo certo;
 *   (c) o helper continua SECURITY DEFINER com search_path fixo;
 *   (d) `tenant_tem_modulo` recuperou o search_path — ela passou a
 *       responder a chamador anônimo;
 *   (e) nenhuma linha ativa deixou para trás a versão sem gate;
 *   (f) as quatro RPCs anônimas passam pelo helper, em toda versão;
 *   (g) `branding_por_slug` NÃO é gated — é ela que pinta a tela de
 *       login, e quem não tem delivery tem login;
 *   (h) a premissa do gate: delivery é módulo de plano, não add-on
 *       avulso. Se um dia virar add-on, o gate passa a olhar a tabela
 *       errada e derruba quem paga — este teste quebra antes disso.
 *
 * A garantia de que a PRODUÇÃO ficou correta é o bloco DO $conf$ no fim
 * da migração, que consulta pg_proc ao vivo — isso este teste não
 * substitui, e o item (i) só confere que o bloco existe.
 */
const RAIZ = join(__dirname, "../..");
const MIGRATIONS_DIR = join(RAIZ, "supabase/migrations");
const CORRETIVA = "20260906_delivery_exige_modulo_no_plano.sql";
const FUNDACAO = "20260804_delivery_fundacao.sql";
const MODULO_NOS_PLANOS = "20260805_delivery_modulo_planos.sql";
const ADDONS = "20260718_addons.sql";

/** As portas que um desconhecido consegue bater. */
const RPCS_ANONIMAS = [
  "cardapio_publico",
  "calcular_taxa_entrega",
  "criar_pedido_delivery",
];

function ler(arquivo) {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
}

/** Linhas de SQL ativo — comentário `--` explicando o bug é permitido. */
function linhasAtivas(conteudo) {
  return conteudo.split("\n").filter((linha) => !linha.trim().startsWith("--"));
}

function semComentarios(conteudo) {
  return linhasAtivas(conteudo).join("\n");
}

const arquivos = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));

/** Migrações cujo SQL ativo define a função. */
function arquivosQueDefinem(nomeFuncao) {
  return arquivos.filter((n) =>
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nomeFuncao}\\b`).test(
      semComentarios(ler(n))
    )
  );
}

/**
 * O texto de CADA definição da função dentro de um arquivo — do cabeçalho
 * até o começo da próxima função.
 *
 * Olhar o arquivo inteiro não serve: uma mesma migração define várias RPCs
 * (a 20260903, por exemplo, refaz `cardapio_publico` E
 * `criar_pedido_delivery`). Se uma delas deixar de passar pelo helper, o
 * arquivo inteiro continua mencionando o helper por causa da outra, e a
 * função desgarrada — a que ficaria FORA do gate de plano — passaria batida.
 * Devolve uma lista porque duas sobrecargas do mesmo nome podem conviver.
 */
function blocosDaFuncao(sql, nomeFuncao) {
  const marcas = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_0-9]+)\b/g)];
  return marcas
    .map((marca, i) => ({
      nome: marca[1],
      texto: sql.slice(marca.index, i + 1 < marcas.length ? marcas[i + 1].index : sql.length),
    }))
    .filter((bloco) => bloco.nome === nomeFuncao)
    .map((bloco) => bloco.texto);
}

describe("Delivery público — guard do gate de plano (DL30)", () => {
  it("a migração existe e roda depois de tudo em que ela se apoia", () => {
    expect(arquivos).toContain(CORRETIVA);

    // O helper e as RPCs precisam existir antes de serem gated; e o
    // módulo já precisa estar nos planos, senão o gate fecharia a loja
    // de todo mundo no instante em que rodasse.
    for (const dependencia of [FUNDACAO, MODULO_NOS_PLANOS, ADDONS]) {
      expect(arquivos).toContain(dependencia);
      expect(CORRETIVA > dependencia).toBe(true);
    }

    // O gate mora no HELPER: recriá-lo depois daqui desfaria o gate, então
    // nenhuma migração pode redefinir `delivery_tenant_por_slug` depois
    // desta.
    const versoesHelper = arquivosQueDefinem("delivery_tenant_por_slug");
    expect(
      versoesHelper.length,
      "nenhuma migração define delivery_tenant_por_slug"
    ).toBeGreaterThan(0);
    for (const arquivo of versoesHelper) {
      if (arquivo === CORRETIVA) continue;
      expect(CORRETIVA > arquivo, `${CORRETIVA} não roda depois de ${arquivo}`).toBe(true);
    }

    // As RPCs, ao contrário, podem ser refeitas depois daqui — o gate não
    // está no corpo delas. O que não pode é uma versão nova parar de
    // resolver o tenant PELO helper: aí a vitrine voltaria a abrir fora do
    // plano sem que uma linha do gate fosse tocada.
    for (const rpc of RPCS_ANONIMAS) {
      const versoes = arquivosQueDefinem(rpc);
      expect(versoes.length, `nenhuma migração define ${rpc}`).toBeGreaterThan(0);
      for (const arquivo of versoes.filter((n) => n > CORRETIVA)) {
        const blocos = blocosDaFuncao(semComentarios(ler(arquivo)), rpc);
        for (const bloco of blocos) {
          expect(
            /delivery_tenant_por_slug\s*\(\s*p_slug\s*\)/.test(bloco),
            `${arquivo} redefine ${rpc} sem resolver o tenant pelo helper com o gate de plano`
          ).toBe(true);
        }
      }
    }
  });

  it("o gate está no helper e cobra o módulo delivery", () => {
    const sql = semComentarios(ler(CORRETIVA));

    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.delivery_tenant_por_slug\(p_slug text\)/
    );
    // A condição em si. O `t.id` importa: passar o slug ou outro tenant
    // aqui liberaria geral sem quebrar sintaxe.
    expect(sql).toMatch(
      /WHERE t\.slug = lower\(btrim\(coalesce\(p_slug, ''\)\)\)\s+AND public\.tenant_tem_modulo\(t\.id, 'delivery'\)/
    );
  });

  it("o código do módulo no banco é o mesmo que o front usa", () => {
    // Espelho do gate: a tela esconde o Delivery por
    // moduloHabilitado(..., MODULOS.DELIVERY). Se os dois textos
    // divergirem, servidor e tela passam a discordar em silêncio — a
    // loja fica no ar para quem o app diz que não tem o módulo.
    const sql = semComentarios(ler(CORRETIVA));
    const achado = /public\.tenant_tem_modulo\(t\.id, '([a-z_]+)'\)/.exec(sql);

    expect(achado, "gate sem chamada a tenant_tem_modulo").not.toBeNull();
    expect(achado[1]).toBe(MODULOS.DELIVERY);
  });

  it("o helper continua SECURITY DEFINER com search_path fixo", () => {
    const sql = semComentarios(ler(CORRETIVA));

    // Sem SECURITY DEFINER o helper para de enxergar `tenants` pelo
    // anon e a vitrine inteira cai; sem search_path fixo ele vira
    // superfície de ataque agora que decide o que um anônimo vê.
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.delivery_tenant_por_slug\(p_slug text\)\s+RETURNS uuid\s+LANGUAGE sql\s+SECURITY DEFINER\s+SET search_path = public\s+STABLE/
    );
  });

  it("tenant_tem_modulo recupera o search_path que um CREATE OR REPLACE apagou", () => {
    const sql = semComentarios(ler(CORRETIVA));
    expect(sql).toMatch(
      /ALTER FUNCTION public\.tenant_tem_modulo\(uuid, text\) SET search_path = public;/
    );

    // A premissa do conserto: a última migração a tocar na função a
    // recriou sem a cláusula (ordem lexicográfica, 'fix' < 'multitenant').
    const ultimaQueRecriou = arquivosQueDefinem("tenant_tem_modulo").sort().pop();
    const corpo = semComentarios(ler(ultimaQueRecriou));
    const bloco = corpo.slice(corpo.indexOf("public.tenant_tem_modulo"));
    expect(bloco.slice(0, 400)).not.toMatch(/SET search_path/);
  });

  it("nenhuma linha ativa deixou para trás o helper sem gate", () => {
    const ativas = linhasAtivas(ler(CORRETIVA));
    const semGate = ativas.filter(
      (l) =>
        /WHERE t\.slug = lower\(btrim\(coalesce\(p_slug, ''\)\)\)\s*$/.test(l.trimEnd())
    );
    // A linha do WHERE só pode aparecer seguida do AND do gate.
    for (const linha of semGate) {
      const posicao = ativas.indexOf(linha);
      expect(ativas[posicao + 1]).toMatch(/AND public\.tenant_tem_modulo/);
    }
  });

  it("as quatro portas anônimas passam pelo helper — em toda versão", () => {
    // Esta é a checagem que sustenta o conserto de um ponto só. Uma RPC
    // pública que resolva o tenant por conta própria fica FORA do gate.
    for (const rpc of RPCS_ANONIMAS) {
      const versoes = arquivosQueDefinem(rpc);
      expect(versoes.length, `nenhuma migração define ${rpc}`).toBeGreaterThan(0);

      for (const arquivo of versoes) {
        const blocos = blocosDaFuncao(semComentarios(ler(arquivo)), rpc);
        expect(blocos.length, `${rpc} não localizada em ${arquivo}`).toBeGreaterThan(0);

        // Corpo por corpo, não arquivo por arquivo: é a única forma de
        // pegar a função que se desgarrou do helper num arquivo que
        // define várias.
        for (const bloco of blocos) {
          expect(
            bloco,
            `${rpc} em ${arquivo} não resolve o tenant pelo helper`
          ).toMatch(/v_tenant\s+uuid\s*:=\s*public\.delivery_tenant_por_slug\(p_slug\)/);
        }
      }
    }

    // As duas sobrecargas de calcular_taxa_entrega seguem vivas e
    // concedidas ao anon — a de 5 argumentos não derrubou a de 3.
    const grants = arquivos
      .flatMap((n) => linhasAtivas(ler(n)))
      .filter((l) => /GRANT\s+EXECUTE ON FUNCTION[^;]*TO anon/.test(l));
    expect(grants.some((l) => /calcular_taxa_entrega\(text, text, text\)/.test(l))).toBe(
      true
    );
    expect(
      grants.some((l) =>
        /calcular_taxa_entrega\(text, text, text, numeric, numeric\)/.test(l)
      )
    ).toBe(true);
  });

  it("branding_por_slug fica fora do gate — é a marca da tela de login", () => {
    const [arquivoBranding] = arquivosQueDefinem("branding_por_slug");
    expect(arquivoBranding, "branding_por_slug não existe").toBeTruthy();

    const sql = semComentarios(ler(arquivoBranding));
    const inicio = sql.indexOf("CREATE OR REPLACE FUNCTION public.branding_por_slug");
    const corpo = sql.slice(inicio, sql.indexOf("$$;", inicio));

    // Gatear a marca deixaria o login de todo estabelecimento sem
    // delivery sem logo e sem cor — quebra maior do que a que se conserta.
    expect(corpo).not.toMatch(/delivery_tenant_por_slug|tenant_tem_modulo/);
  });

  it("a premissa: delivery é módulo de plano, não add-on avulso", () => {
    // O gate lê `planos_modulos`. Se delivery virasse add-on
    // (`tenant_addons`), quem pagasse pelo add-on num plano menor seria
    // tirado do ar por este mesmo gate.
    const planos = semComentarios(ler(MODULO_NOS_PLANOS));
    expect(planos).toMatch(/INSERT INTO public\.planos_modulos/);
    expect(planos).toMatch(/\('alto',\s*'delivery'\)/);
    expect(planos).toMatch(/\('avancado',\s*'delivery'\)/);

    const codigosDeAddon = [
      ...semComentarios(ler(ADDONS)).matchAll(/\('([a-z_]+)',\s*'[^']+',\s*'[^']*'\)/g),
    ].map((m) => m[1]);
    expect(codigosDeAddon).toEqual(["nfe", "tef"]);
    expect(codigosDeAddon).not.toContain("delivery");
  });

  it("a migração confere ao vivo se o gate pegou", () => {
    const sql = semComentarios(ler(CORRETIVA));

    expect(sql).toMatch(/pg_get_functiondef/);
    expect(sql).toMatch(/position\('tenant_tem_modulo' in v_def\) = 0/);
    expect(sql).toMatch(/RAISE EXCEPTION 'delivery_tenant_por_slug sem o gate de módulo/);
    expect(sql).toMatch(/RAISE EXCEPTION 'tenant_tem_modulo sem search_path fixo/);
  });
});
