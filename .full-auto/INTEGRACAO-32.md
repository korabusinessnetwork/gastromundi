# Integração do PR #32 na estrutura atual (T30 a T37)

Pedido do dono (2026-11-26): "Faz do jeito recomendado", isto é, integrar o #32 por assunto, em
rodadas, parando antes de qualquer migration ir para produção.

## Onde está o trabalho

- Cópia de trabalho: `/home/user/gm-integra-32`, branch local `integra-32` (não enviada ao GitHub
  enquanto a suíte estiver vermelha). `node_modules` é link para o do repositório principal.
- Branch do #32: `origin/claude/gastromundi-combos-produtos-hu3j6p`. Ponto em comum com a main:
  `9ffff740` (14/09).
- Etapa 1 feita: commit `71b9079f`, merge com os 64 conflitos resolvidos pela versão da main.
- `/home/user/gm-conflitos32.txt`: os 95 caminhos que conflitaram.
- `/home/user/gm-novos-fora32.txt`: arquivos do #32 que ficaram fora do merge (telas antigas que a
  refatoração quebrou em partes, e telas novas que o git tentou pôr em pastas erradas). Trazer de
  `git show origin/claude/gastromundi-combos-produtos-hu3j6p:<caminho>` ao portar cada assunto.
- O que o #32 mudou num arquivo antigo: `git diff 9ffff740 origin/claude/gastromundi-combos-produtos-hu3j6p -- <caminho antigo>`.

## Estado medido logo depois do merge

47 arquivos de teste vermelhos (283 testes) de 307, e o build quebra em 3 pontos:
`calcularBaixasSubprodutos` e `calcularBaixasProdutosCombo` (o #32 acrescentou ao `lib/combos.js`
antigo, que hoje é `features/cardapio/regras/combos.js`) e `renderizarComprovanteCaixa` (acrescentado
ao `lib/impressao/renderizar.js`, hoje `features/impressao/regras/renderizar.js`).

## Como cada rodada trabalha

1. Para o assunto da vez, ler o diff do #32 nos arquivos antigos e trazer a mudança para o arquivo
   novo correspondente (mapa de caminhos: specs da fase 6 e `memory/patterns.md`).
2. Arquivo novo do #32 vai para a feature certa (`dados/` se fala com o Supabase, `regras/` se é
   puro, `desktop/` se é tela), com `git mv` quando já está na árvore.
3. Código que entra segue o padrão de hoje: CSS co-localizado com `--gm-*`, sem estilo inline, sem
   cor fixa, sem emoji, sem travessão em texto de tela, tela sem Supabase direto.
4. Suíte do domínio verde, guardas verdes, fotos do domínio comparadas.
5. As migrations do #32 entram no repositório como estão; nenhuma vai para produção sem o dono.

## Ordem

T30 compilar e suíte verde (os três exports, os testes em `src/lib/` que leem caminho antigo, e os
guardas); depois T31 combos e grupos de escolha, T32 integridade e dinheiro, T33 entregadores e
fechamento do delivery, T34 vitrine e checkout, T35 aceite automático, WhatsApp e venda do
delivery, T36 feedback, clientes e relatórios, T37 impressão e o resto.

## Antes de mesclar na main

O dono confirma se as 24 migrations do #32 estão em produção (consulta de leitura entregue na
conversa de 2026-11-26). Sem essa confirmação, nada desta integração vai para a main.

## Estado do banco de produção (medido em 2026-11-27)

Consulta só de leitura pela API do Supabase. O banco não tem a tabela de controle da CLI
(`supabase_migrations.schema_migrations`): as migrations são aplicadas à mão no editor SQL, então a
conferência foi pelo que cada uma cria (tabela, função, coluna, índice, gatilho, política).

- Nenhuma das 24 migrations do #32 está aplicada. Faltam todos os objetos novos (grupos_escolha,
  delivery_entregadores, feedbacks, comandas_arquivadas, gravar_itens_comanda,
  lancamentos.cancelado_por, as colunas novas do delivery e de clientes), e as colunas de dinheiro
  continuam sem precisão fixa. Os poucos acertos parciais são funções que já existiam antes e que a
  migration só substitui (criar_pedido_delivery e parecidas), o que não prova aplicação.
- As 4 migrations mais recentes da main (20261123 a 20261126) estão aplicadas.

Consequência: mesclar a integração na main sobe código que chama objetos que não existem. As
migrations do #32 precisam ser aplicadas antes, em ordem, com aprovação do dono. Como nenhuma foi
aplicada, renomeá-las para datas novas (depois de 20261126) é seguro e evita a colisão de prefixo;
fica como proposta para a hora de mesclar.

## Progresso (2026-11-27)

Branch local `integra-32`, 11 commits sobre o merge. Suíte 310 arquivos e 5212 testes verdes, lint
0 erros, build limpo. Portado: vitrine, delivery (regras, pedido, endereços, admin, operação),
clientes (origem, aniversário, filtros), PDV (gravação atômica da comanda, cancelamento rastreável,
produto desabilitado, seletor de escolhas, venda concluída, valores em reais), caixa (cancelamento
que marca o lançamento, comprovante de fechamento e de sangria/suprimento), cardápio (grupos de
escolha no produto e no combo, desabilitar venda, principal opcional, preço fixo), impressão
(composição do combo, largura das colunas, sem emoji). Migration nova: 20261127 (índices de tenant
nos subprodutos).

Falta (suíte verde não cobre porque os testes desses arquivos também estão fora da árvore):
- Telas novas fora da árvore (`/home/user/gm-novos-fora32.txt`): FeedbacksView e rota, AbaFechamento
  e NovoGrupoExtrasInline do delivery, DeliveryReport, BotaoReimprimirPedido/Via/Comprovante,
  ClientesFiltroSelect.
- Mudanças do #32 em telas que a main dividiu: DeliveryView (entregadores, aceite automático,
  WhatsApp), ConfiguracoesView, AdminView, EstoqueView, RelatorioView, CozinhaView, PDV
  (`comandasDoSalao`), Sidebar, rotas, `utils/hooks`, coluna `origem` nas vendas.
