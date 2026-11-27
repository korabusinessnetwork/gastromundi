import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { MIGRATIONS_DIR } from "@/test/migracoes";

/**
 * Guard de 20261009_integridade_do_historico.sql, e da regra maior que ela
 * criou: o que foi pedido e o que foi vendido não se apaga.
 *
 * Havia três caminhos de exclusão de histórico. Dois no código (cancelar
 * comanda apagava a `pending`; cancelar venda apagava as linhas
 * relacionais e o lançamento) e um no banco: TODA policy dessas tabelas é
 * `FOR ALL`, então DELETE sempre foi permitido — a única coisa que
 * segurava era a tela não oferecer o botão.
 *
 * Este arquivo prende os dois lados. A parte mais importante é a última:
 * uma varredura que falha se ALGUÉM voltar a escrever um DELETE de
 * histórico no app, inclusive em código que ainda não existe.
 */
const MIGRACAO = "20261009_integridade_do_historico.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

/** Tabelas que guardam o que aconteceu. O app lê e marca; nunca apaga. */
const TABELAS_DE_HISTORICO = [
  "vendas",
  "venda_itens",
  "venda_pagamentos",
  "sales",
  "lancamentos",
  "delivery_pedidos",
  "delivery_pedido_itens",
  "comandas_arquivadas",
];

describe("o banco recusa apagar histórico", () => {
  it("toda tabela de histórico ganha a trava de DELETE", () => {
    for (const t of TABELAS_DE_HISTORICO) {
      expect(sql).toContain(`'${t}'`);
    }
  });

  it("a trava é RESTRICTIVE e recusa sempre", () => {
    // RESTRICTIVE soma-se às policies que já existem em vez de substituir:
    // uma policy PERMISSIVE nova não reabre o buraco por engano.
    expect(sql).toMatch(/AS RESTRICTIVE FOR DELETE USING \(false\)/);
  });

  it("`pending` NÃO entra na trava, e isso é de propósito", () => {
    // Finalizar tira a comanda da tela de trabalho; quem passa a ser o
    // registro é a venda. Travar o DELETE aqui quebraria o PDV inteiro.
    const listaDeTravadas = sql.slice(sql.indexOf("FOREACH t IN ARRAY"), sql.indexOf("LOOP", sql.indexOf("FOREACH t IN ARRAY")));
    expect(listaDeTravadas).not.toMatch(/'pending'/);
  });
});

describe("a comanda que sai deixa cópia", () => {
  it("o arquivo é escrito por gatilho, não pela tela", () => {
    // Na tela, a garantia dependeria de alguém lembrar. No gatilho vale
    // também para script e para bug.
    expect(sql).toMatch(/BEFORE DELETE ON public\.pending/);
    expect(sql).toMatch(/CREATE TRIGGER pending_arquiva_antes_de_sair/);
  });

  it("guarda a linha INTEIRA, não um punhado de colunas", () => {
    // `pending` já ganhou colunas depois de criada. Um arquivo de colunas
    // fixas pararia de guardar a próxima sem avisar.
    expect(sql).toContain("to_jsonb(OLD)");
  });

  it("a mesma comanda saindo de novo atualiza a cópia em vez de estourar", () => {
    expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
  });

  it("o gatilho é SECURITY DEFINER — o app arquiva sem ganhar direito de escrever no arquivo", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.arquivar_comanda\(\)[\s\S]{0,200}SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
  });
});

describe("cancelar deixa de significar apagar", () => {
  it("a venda ganha onde ser marcada como cancelada", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS cancelada\s+boolean\s+NOT NULL DEFAULT false/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS motivo_cancelamento/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS cancelada_por/);
  });

  it("o lançamento aceita 'cancelado' sem perder os status que já existiam", () => {
    expect(sql).toMatch(/CHECK \(status IN \('previsto', 'pago', 'recebido', 'vencido', 'cancelado'\)\)/);
  });

  it("a conferência prova o cancelamento no banco, não só a coluna", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'Integridade: não deu para marcar a venda como cancelada/);
    expect(sql).toMatch(/RAISE EXCEPTION 'Integridade: o lançamento não aceitou o status cancelado/);
    expect(sql).toMatch(/RAISE EXCEPTION 'Integridade: comanda apagada não deixou cópia/);
  });
});

// ── A varredura ────────────────────────────────────────────────────
// O teste acima prova a migração. Este prova o CÓDIGO, e continua valendo
// para arquivo que ainda não existe: se alguém escrever um
// `.from("vendas").delete()` amanhã, a suíte cai aqui em vez de o
// histórico sumir em produção.
describe("nenhum caminho do app apaga histórico", () => {
  function arquivosDeCodigo(dir) {
    const achados = [];
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        achados.push(...arquivosDeCodigo(caminho));
      } else if (/\.(js|jsx)$/.test(entrada.name) && !/\.test\.(js|jsx)$/.test(entrada.name)) {
        achados.push(caminho);
      }
    }
    return achados;
  }

  it("nenhum .from(<tabela de histórico>).delete() no código", () => {
    const ofensores = [];
    for (const arquivo of arquivosDeCodigo("src")) {
      const texto = readFileSync(arquivo, "utf8");
      for (const tabela of TABELAS_DE_HISTORICO) {
        // .from("vendas")...delete()  —  tolera encadeamento e quebra de linha
        const padrao = new RegExp(`from\\(\\s*["'\`]${tabela}["'\`]\\s*\\)[\\s\\S]{0,200}?\\.delete\\(`, "g");
        if (padrao.test(texto)) {
          ofensores.push(`${arquivo.replace(/^src\//, "")} → ${tabela}`);
        }
      }
    }
    expect(
      ofensores,
      `Estes caminhos apagam histórico. Cancelar é MARCAR (vendas.cancelada, `
      + `lancamentos.status='cancelado'), nunca apagar — ver `
      + `supabase/migrations/${MIGRACAO}:\n  ${ofensores.join("\n  ")}`,
    ).toEqual([]);
  });
});
