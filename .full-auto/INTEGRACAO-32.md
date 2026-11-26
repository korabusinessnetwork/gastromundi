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
