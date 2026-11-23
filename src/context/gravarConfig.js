import { gravarChaveConfig } from "@/features/configuracoes/dados/config";
import { reportarFalha } from "@/lib/observabilidade";

/**
 * Grava uma chave de `config` e, se o banco recusar, chama `desfazer` para a
 * tela voltar ao valor anterior (o ajuste é otimista). Usado pela fatia da
 * configuração e pelos ajustes do caixa (fundo e abertura), que também moram
 * em `config` (tarefa 2.9 do plano de refatoração).
 */
export async function gravarConfig(chave, valor, desfazer) {
  const { error } = await gravarChaveConfig(chave, valor);
  if (error) {
    console.error(`config upsert (${chave}) error:`, error);
    reportarFalha(error, { acao: "gravarConfig", tabela: "config", key: chave });
    desfazer();
    return { error };
  }
  return { error: null };
}
