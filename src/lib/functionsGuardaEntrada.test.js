import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  decidirAcesso,
  mensagemRecusa,
  sanitizarHistorico,
  ERRO_INATIVO,
  MAX_TEXTO_HISTORICO,
  MAX_TURNOS_HISTORICO,
  PAPEIS_ADMIN,
  PAPEIS_FISCAL_EMISSAO,
  PAPEIS_GERENCIA,
  PAPEIS_IMPORTACAO,
  PAPEIS_PLATAFORMA,
} from "../../supabase/functions/_shared/guardaEntrada.ts";

/**
 * As cinco Edge Functions não-fiscais decidiam o acesso só pelo PAPEL:
 *
 *     if (callerData?.role !== "admin") return 403;
 *
 * `public.users` tem `active boolean NOT NULL DEFAULT true` e o app inteiro
 * honra a coluna — o login busca o perfil com `.eq("active", true)` e a lista
 * de usuários também (src/context/AppContext.jsx). Desativar é como o sistema
 * tira alguém de circulação sem apagar o histórico.
 *
 * Só que desativar a linha NÃO invalida o JWT já emitido, e nenhuma function
 * olhava a coluna. Pelo tempo de vida do token, um admin desativado seguia
 * podendo criar e apagar contas de acesso (`manage-user`), gravar por cima do
 * cardápio (`importar-dados`), ler o resumo do negócio (`jarvas-assistente`) e
 * queimar a cota de IA (`ler-cardapio-ia`) — e um super-admin da plataforma
 * desativado seguia criando estabelecimentos novos
 * (`provisionar-estabelecimento`). A tela dizia que ele estava fora;
 * o servidor, que estava dentro.
 *
 * Duas metades, instrumentos diferentes — mesma divisão de
 * `provisionamentoCompensacao.test.js`:
 *
 *   (A) COMPORTAMENTO — `_shared/guardaEntrada.ts` foi extraído para poder ser
 *       executado aqui: é puro, não toca em nada do Deno.
 *
 *   (B) TEXTO — os index.ts chamam `Deno.serve` no topo e importam de URL,
 *       então nenhum teste consegue carregá-los. Para a fiação, o instrumento
 *       é o dos outros guards do repositório: ler o arquivo e afirmar sobre o
 *       texto. Isso prova que a borda CHAMA a guarda; que a guarda decide
 *       certo é a metade (A).
 */

const RAIZ = join(__dirname, "../..");
const FUNCOES = {
  "manage-user": join(RAIZ, "supabase/functions/manage-user/index.ts"),
  "jarvas-assistente": join(RAIZ, "supabase/functions/jarvas-assistente/index.ts"),
  "importar-dados": join(RAIZ, "supabase/functions/importar-dados/index.ts"),
  "ler-cardapio-ia": join(RAIZ, "supabase/functions/ler-cardapio-ia/index.ts"),
  "provisionar-estabelecimento": join(RAIZ, "supabase/functions/provisionar-estabelecimento/index.ts"),
};

/**
 * As fiscais. Cancelar uma NFC-e autorizada e queimar uma faixa de numeração
 * são os atos mais irreversíveis do sistema, e as duas seguiam decidindo
 * acesso só pelo papel — o mesmo furo que a guarda fecha nas outras cinco.
 * Ficam num mapa separado porque o gate delas nasceu com outro formato
 * (`perfil?.role !== ...`, não `callerData`), e é justamente esse formato que
 * não pode voltar.
 *
 * Emitir e reenviar entraram depois, e por um furo PIOR: elas não tinham gate
 * NENHUM. Bastava um JWT válido — o do garçom serve — para emitir documento
 * fiscal em nome do estabelecimento, ou para reenviar em lote as notas que
 * ficaram em contingência. Autenticação sem autorização.
 */
const FUNCOES_FISCAIS = {
  "emitir-nfce": join(RAIZ, "supabase/functions/emitir-nfce/index.ts"),
  "reenviar-nfce": join(RAIZ, "supabase/functions/reenviar-nfce/index.ts"),
  "cancelar-nfce": join(RAIZ, "supabase/functions/cancelar-nfce/index.ts"),
  "inutilizar-nfce": join(RAIZ, "supabase/functions/inutilizar-nfce/index.ts"),
};

/**
 * Os cabeçalhos CITAM o código que foi removido para explicar o furo; sem
 * tirar os comentários, "isto não existe mais" falharia por causa da própria
 * documentação.
 */
function semComentariosTs(caminho) {
  return readFileSync(caminho, "utf8")
    .split("\n")
    .map((linha) => linha.replace(/\r$/, ""))
    .filter((linha) => {
      const t = linha.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/"));
    })
    .join("\n");
}

// ── (A) COMPORTAMENTO ──────────────────────────────────────────────

describe("decidirAcesso — o defeito: papel sem atividade", () => {
  it("recusa o admin DESATIVADO que ainda tem JWT válido", () => {
    const demitido = { role: "admin", active: false };
    expect(decidirAcesso(demitido, PAPEIS_ADMIN)).toEqual({ ok: false, motivo: "inativo" });
    expect(decidirAcesso(demitido, PAPEIS_GERENCIA)).toEqual({ ok: false, motivo: "inativo" });
    expect(decidirAcesso(demitido, PAPEIS_IMPORTACAO)).toEqual({ ok: false, motivo: "inativo" });
  });

  it("libera o admin ativo", () => {
    expect(decidirAcesso({ role: "admin", active: true }, PAPEIS_ADMIN)).toEqual({ ok: true, motivo: null });
  });

  it("distingue conta desativada de papel errado — a causa muda a frase", () => {
    expect(decidirAcesso({ role: "garcom", active: true }, PAPEIS_ADMIN).motivo).toBe("papel");
    expect(decidirAcesso({ role: "garcom", active: false }, PAPEIS_ADMIN).motivo).toBe("inativo");
  });
});

describe("decidirAcesso — falha fechado", () => {
  it("recusa quem não tem linha em users", () => {
    for (const vazio of [null, undefined]) {
      expect(decidirAcesso(vazio, PAPEIS_ADMIN)).toEqual({ ok: false, motivo: "sem_perfil" });
    }
  });

  it("recusa quando o select ESQUECEU de pedir `active`", () => {
    // A coluna é NOT NULL no banco: indefinida aqui só por consulta incompleta.
    // Liberar nesse caso deixaria o furo voltar por um `select` mal escrito.
    expect(decidirAcesso({ role: "admin" }, PAPEIS_ADMIN)).toEqual({ ok: false, motivo: "inativo" });
  });

  it("exige `active` booleano true — nada de valor 'parecido com verdadeiro'", () => {
    for (const quase of ["true", 1, "sim", {}, []]) {
      expect(decidirAcesso({ role: "admin", active: quase }, PAPEIS_ADMIN).motivo).toBe("inativo");
    }
  });

  it("recusa papel que não é texto", () => {
    for (const lixo of [123, null, undefined, {}, ["admin"]]) {
      expect(decidirAcesso({ role: lixo, active: true }, PAPEIS_ADMIN).motivo).toBe("papel");
    }
  });
});

describe("decidirAcesso — as listas de papel espelham o gate da tela", () => {
  it("gerência = admin e gerente (o `isAdmin` da ConfiguracoesView)", () => {
    expect(decidirAcesso({ role: "gerente", active: true }, PAPEIS_GERENCIA).ok).toBe(true);
    expect(decidirAcesso({ role: "gerente", active: true }, PAPEIS_ADMIN).ok).toBe(false);
  });

  it("importação aceita o super-admin da plataforma; as outras, não", () => {
    const plataforma = { role: "plataforma", active: true };
    expect(decidirAcesso(plataforma, PAPEIS_IMPORTACAO).ok).toBe(true);
    expect(decidirAcesso(plataforma, PAPEIS_ADMIN).ok).toBe(false);
    expect(decidirAcesso(plataforma, PAPEIS_GERENCIA).ok).toBe(false);
  });

  it("criar estabelecimento é SÓ da plataforma — nem o admin do cliente entra", () => {
    expect(decidirAcesso({ role: "plataforma", active: true }, PAPEIS_PLATAFORMA).ok).toBe(true);
    expect(decidirAcesso({ role: "admin", active: true }, PAPEIS_PLATAFORMA).ok).toBe(false);
    expect(decidirAcesso({ role: "gerente", active: true }, PAPEIS_PLATAFORMA).ok).toBe(false);
  });

  it("o super-admin DESATIVADO não provisiona mais — é o papel mais poderoso", () => {
    expect(decidirAcesso({ role: "plataforma", active: false }, PAPEIS_PLATAFORMA))
      .toEqual({ ok: false, motivo: "inativo" });
  });

  it("emitir NFC-e é ato de caixa pra cima — garçom fica de fora", () => {
    for (const papel of ["caixa", "gerente", "admin"]) {
      expect(decidirAcesso({ role: papel, active: true }, PAPEIS_FISCAL_EMISSAO).ok).toBe(true);
    }
    for (const papel of ["garcom", "cozinha", "plataforma", ""]) {
      expect(decidirAcesso({ role: papel, active: true }, PAPEIS_FISCAL_EMISSAO).ok).toBe(false);
    }
  });

  it("o caixa DESATIVADO não emite mais, mesmo com o JWT ainda de pé", () => {
    expect(decidirAcesso({ role: "caixa", active: false }, PAPEIS_FISCAL_EMISSAO))
      .toEqual({ ok: false, motivo: "inativo" });
  });

  it("emissão é mais larga que gerência, e cancelamento continua mais estreito", () => {
    const caixa = { role: "caixa", active: true };
    expect(decidirAcesso(caixa, PAPEIS_FISCAL_EMISSAO).ok).toBe(true);
    expect(decidirAcesso(caixa, PAPEIS_GERENCIA).ok).toBe(false);
    expect(decidirAcesso(caixa, PAPEIS_ADMIN).ok).toBe(false);
  });

  it("garçom e caixa não passam em nenhuma", () => {
    for (const papel of ["garcom", "caixa", "cozinha", ""]) {
      const perfil = { role: papel, active: true };
      expect(decidirAcesso(perfil, PAPEIS_ADMIN).ok).toBe(false);
      expect(decidirAcesso(perfil, PAPEIS_GERENCIA).ok).toBe(false);
      expect(decidirAcesso(perfil, PAPEIS_IMPORTACAO).ok).toBe(false);
      expect(decidirAcesso(perfil, PAPEIS_PLATAFORMA).ok).toBe(false);
    }
  });
});

describe("mensagemRecusa", () => {
  it("conta desativada tem causa própria — 'não é admin' mentiria", () => {
    expect(mensagemRecusa("inativo", "Acesso restrito a administradores.")).toBe(ERRO_INATIVO);
  });

  it("o resto usa a frase da função que chamou", () => {
    const padrao = "Assistente disponível apenas para gerência.";
    expect(mensagemRecusa("papel", padrao)).toBe(padrao);
    expect(mensagemRecusa("sem_perfil", padrao)).toBe(padrao);
    expect(mensagemRecusa(null, padrao)).toBe(padrao);
  });
});

describe("sanitizarHistorico — o corpo do cliente não derruba o Jarvas", () => {
  it("não estoura com item nulo no array (era TypeError → 500)", () => {
    expect(() => sanitizarHistorico([null, undefined, 7, "oi", []])).not.toThrow();
    expect(sanitizarHistorico([null, undefined, 7, "oi", []])).toEqual([]);
  });

  it("descarta texto vazio (virava bloco vazio, que a Anthropic recusa → 502)", () => {
    expect(sanitizarHistorico([{ papel: "usuario", texto: "   " }])).toEqual([]);
    expect(sanitizarHistorico([{ papel: "usuario", texto: "" }])).toEqual([]);
  });

  it("descarta texto que não é texto", () => {
    expect(sanitizarHistorico([{ papel: "usuario", texto: 42 }])).toEqual([]);
    expect(sanitizarHistorico([{ papel: "usuario", texto: null }])).toEqual([]);
  });

  it("traduz os papéis para os da API", () => {
    expect(sanitizarHistorico([
      { papel: "usuario", texto: "quanto vendi ontem?" },
      { papel: "jarvas", texto: "R$ 1.200,00." },
    ])).toEqual([
      { role: "user", content: "quanto vendi ontem?" },
      { role: "assistant", content: "R$ 1.200,00." },
    ]);
  });

  it("qualquer papel que não seja 'jarvas' conta como turno do usuário", () => {
    expect(sanitizarHistorico([{ papel: "sistema", texto: "x" }])[0].role).toBe("user");
  });

  it("devolve vazio quando não é array", () => {
    for (const lixo of [null, undefined, "oi", 3, {}]) {
      expect(sanitizarHistorico(lixo)).toEqual([]);
    }
  });

  it("mantém os tetos de turnos e de tamanho", () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ({ papel: "usuario", texto: `p${i}` }));
    const saida = sanitizarHistorico(muitos);
    expect(saida).toHaveLength(MAX_TURNOS_HISTORICO);
    expect(saida[saida.length - 1].content).toBe("p19");

    const gigante = sanitizarHistorico([{ papel: "usuario", texto: "a".repeat(9000) }]);
    expect(gigante[0].content).toHaveLength(MAX_TEXTO_HISTORICO);
  });
});

// ── (B) TEXTO: as bordas estão fiadas na guarda ────────────────────

describe("as cinco funções não-fiscais consultam users com `active`", () => {
  for (const [nome, caminho] of Object.entries(FUNCOES)) {
    it(`${nome} pede a coluna active e chama decidirAcesso`, () => {
      const fonte = semComentariosTs(caminho);
      expect(fonte).toContain('from("users")');
      expect(fonte).toMatch(/\.select\("role,[^"]*active"\)/);
      expect(fonte).toContain("decidirAcesso(");
      expect(fonte).toContain('from "../_shared/guardaEntrada.ts"');
    });
  }

  it("nenhuma delas decide acesso só pelo papel", () => {
    for (const caminho of Object.values(FUNCOES)) {
      const fonte = semComentariosTs(caminho);
      expect(fonte).not.toMatch(/callerData\?\.role !== "admin"/);
      expect(fonte).not.toMatch(/callerData\?\.role !== "plataforma"/);
      expect(fonte).not.toMatch(/\["admin", "gerente"\]\.includes\(callerData\.role\)/);
    }
  });
});

describe("as quatro funções fiscais barram a conta desativada e o papel errado", () => {
  for (const [nome, caminho] of Object.entries(FUNCOES_FISCAIS)) {
    it(`${nome} pede a coluna active e chama decidirAcesso`, () => {
      const fonte = semComentariosTs(caminho);
      expect(fonte).toContain('from("users")');
      expect(fonte).toMatch(/\.select\("role,[^"]*active"\)/);
      expect(fonte).toContain("decidirAcesso(");
      expect(fonte).toContain('from "../_shared/guardaEntrada.ts"');
    });
  }

  it("nenhuma delas volta a decidir só pelo papel", () => {
    for (const caminho of Object.values(FUNCOES_FISCAIS)) {
      const fonte = semComentariosTs(caminho);
      expect(fonte).not.toMatch(/perfil\?\.role !== "admin"/);
      expect(fonte).not.toMatch(/perfil\?\.role !== "gerente"/);
    }
  });

  it("cancelar exige gerência e inutilizar exige admin — o peso do ato não mudou", () => {
    expect(semComentariosTs(FUNCOES_FISCAIS["cancelar-nfce"]))
      .toContain("decidirAcesso(perfil, PAPEIS_GERENCIA)");
    expect(semComentariosTs(FUNCOES_FISCAIS["inutilizar-nfce"]))
      .toContain("decidirAcesso(perfil, PAPEIS_ADMIN)");
  });

  it("emitir e reenviar usam a lista de emissão — caixa entra, garçom não", () => {
    expect(semComentariosTs(FUNCOES_FISCAIS["emitir-nfce"]))
      .toContain("decidirAcesso(perfil, PAPEIS_FISCAL_EMISSAO)");
    expect(semComentariosTs(FUNCOES_FISCAIS["reenviar-nfce"]))
      .toContain("decidirAcesso(perfil, PAPEIS_FISCAL_EMISSAO)");
  });

  it("o gate vem ANTES de qualquer leitura de config fiscal ou de venda", () => {
    // Ordem importa: se o 403 sair depois da consulta, quem não pode emitir
    // ainda descobre se o estabelecimento tem fiscal ligado e se a venda
    // existe — 403 vira oráculo. O gate é o passo 1b, logo após o getUser.
    for (const nome of ["emitir-nfce", "reenviar-nfce"]) {
      const fonte = semComentariosTs(FUNCOES_FISCAIS[nome]);
      const gate = fonte.indexOf("decidirAcesso(");
      const config = fonte.indexOf('from("tenant_fiscal_config")');
      expect(gate).toBeGreaterThan(-1);
      expect(config).toBeGreaterThan(-1);
      expect(gate).toBeLessThan(config);
    }
  });
});

describe("manage-user — username que dá conta inacessível e credencial órfã", () => {
  it("normaliza o username em vez de só baixar a caixa", () => {
    const fonte = semComentariosTs(FUNCOES["manage-user"]);
    // `${uname}@${slug}.local` precisa sobreviver ao sanitizeInput da tela de
    // login, senão a conta nasce impossível de redigitar. Mesma invariante que
    // validacaoProvisionamento garante no provisionamento.
    expect(fonte).toContain("normalizarUsername(username)");
    expect(fonte).not.toContain("username.trim().toLowerCase();");
    expect(fonte).toContain("MAX_USERNAME");
    expect(fonte).toContain("MIN_SENHA");
  });

  it("confere o vínculo do auth_id e desfaz a credencial quando nada casa", () => {
    const fonte = semComentariosTs(FUNCOES["manage-user"]);
    const i = fonte.indexOf('.update({ auth_id: data.user.id })');
    expect(i).toBeGreaterThanOrEqual(0);
    const trecho = fonte.slice(i, i + 900);
    expect(trecho).toContain('.select("id")');
    expect(trecho).toContain("removerCredencialOrfa(");
    // O resultado descartado era o defeito: `await supabaseAdmin...update(...)`
    // terminando em `;` logo depois do filtro de tenant.
    expect(trecho).not.toMatch(/\.eq\("tenant_id", callerTenantId\);/);
  });
});

describe("jarvas-assistente monta o histórico pelo sanitizador", () => {
  it("não mapeia o corpo cru do cliente", () => {
    const fonte = semComentariosTs(FUNCOES["jarvas-assistente"]);
    expect(fonte).toContain("sanitizarHistorico(historico)");
    expect(fonte).not.toContain("historico.slice(-6)");
    expect(fonte).not.toContain("String(m.texto)");
  });
});

describe("o catch não entrega o erro interno ao cliente", () => {
  it("devolvem frase fechada e logam o resto", () => {
    for (const nome of ["manage-user", "importar-dados", "provisionar-estabelecimento"]) {
      const fonte = semComentariosTs(FUNCOES[nome]);
      // Erro de supabase-js/Postgres carrega tabela, coluna e constraint.
      expect(fonte).not.toMatch(/error: e\.message/);
      expect(fonte).not.toMatch(/error: \(e as Error\)\.message/);
      expect(fonte).toContain("console.error(");
    }
  });

  it("provisionar-estabelecimento ainda devolve a causa das falhas PREVISTAS", () => {
    // Só o catch-all foi fechado. Slug repetido, e-mail já cadastrado e perfil
    // rejeitado seguem chegando ao Console com o motivo — sem isso, quem
    // cadastra o cliente novo não sabe o que corrigir e tenta de novo às cegas.
    const fonte = semComentariosTs(FUNCOES["provisionar-estabelecimento"]);
    expect(fonte).toContain("eTenant?.message");
    expect(fonte).toContain("eAuth?.message");
    expect(fonte).toContain("ePerfil.message");
  });
});
