# Refatoração 6.9b: Configurações, impressão e mesas passam a morar em `src/features/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefas T20b e T20f (rodadas
> acrescentadas na 6.3). A T20f entrou junto, explicado abaixo.

## A mudança

Mudança só de lugar, com `git mv`, pelo mesmo script da 6.1. Nenhuma linha de lógica mudou.

- **`src/features/configuracoes/desktop/`**: a tela de Configurações com todas as abas (Geral,
  usuários, meios de pagamento, categorias, unidades de medida, delivery, identidade, importar e
  exportar, minha assinatura) e a antiga pasta `views/configuracoes/`.
- **`src/features/impressao/`** (feature nova):
  - `dados/impressao.js`: monta comprovante, cupom e via de produção e lê a configuração (o
    antigo `src/lib/impressao.js`);
  - `regras/`: a antiga pasta `src/lib/impressao/` inteira, com layout da comanda, pontos de
    impressão, despacho, formatador da térmica, os dois CSS do papel e os drivers;
  - `desktop/`: as telas de Configurações, Impressão (layout da comanda, perfil da impressora,
    pontos de impressão, pedidos sem internet).
- **`src/features/mesas/desktop/`**: a administração de mesas.
- 81 arquivos movidos. Os comentários que citavam os caminhos antigos, no código e em
  `docs/03_REGRAS_DE_NEGOCIO/` (Cozinha, Ponte, Migração de dados), apontam para os novos. O
  guarda de SQL de excluir unidade de medida lê o teste da aba pelo caminho; o caminho foi
  corrigido junto.

**Por que mesas entrou aqui:** a tela de Configurações abre a administração de mesas. Com
Configurações em `features/` e mesas ainda em `components/desktop/`, o lint reprovou (uma feature
não depende de tela do computador, regra que é erro desde a fase 4). Levar mesas junto era o
caminho que não afrouxa a regra.

## Diferenças

DIFERENCAS

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Configurações, impressão e mesas em `src/features/` com `git mv`, testes junto | `git status` mostra renomeações |
| 2 | Nenhum import nem leitura de fonte aponta para o caminho antigo | busca e guardas da suíte |
| 3 | Nenhuma tela muda | `comparar` com as 209 telas |
| 4 | Suíte verde, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim. Suíte 269 arquivos e 4446 testes, verde; build limpo; lint 0 erros e 25
  avisos. Chamadas ao Supabase fora de `dados/`: FORA_DE_DADOS.
- Qualidade: nenhum crítico ou importante.
