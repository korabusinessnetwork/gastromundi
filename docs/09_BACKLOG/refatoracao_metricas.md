# Métricas da refatoração

Uma linha por medição. Os números estáticos saem de `npm run metricas`; testes e build
saem de `npm test` e `npm run build`. O plano e as metas estão em
[`plano_refatoracao.md`](./plano_refatoracao.md), seção 4.

## Ponto de partida

- **Commit de partida:** `9ffff74` (main em 2026-11-23, antes de qualquer mudança do plano).
- **Roteiro de telas:** 44 telas (29 no computador, 15 no celular). Para comparar com o
  ponto de partida, a qualquer momento:

  ```
  node scripts/screenshots-refatoracao.mjs capturar /tmp/antes --ref 9ffff74
  node scripts/screenshots-refatoracao.mjs capturar /tmp/depois
  node scripts/screenshots-refatoracao.mjs comparar /tmp/antes /tmp/depois
  ```

  Duas capturas seguidas do mesmo código deram 0 diferença em 44 telas (2026-11-23), então
  qualquer diferença que aparecer veio do código.

## Medições

| Data | Rodada | AppContext | Arquivos > 600 | Maior useState | Supabase fora de dados/ (telas / contexto / lib) | style inline | Hex no JSX | Celular importa desktop | Lint (erros / avisos) | Testes | Maior pacote JS |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-11-23 | partida (`9ffff74`) | 2.194 | 22 | 70 | 226 (64 / 51 / 111) | 1.526 | 23 | 1 | sem lint | 242 arquivos, 4.273 testes, 91 s | 2.387 kB (703 kB gzip) |
| 2026-11-23 | fase 0 | 2.194 | 22 | 70 | 226 (64 / 51 / 111) | 1.526 | 23 | 1 | 0 / 50 | 243 arquivos, 4.280 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 1.1 salvar combo | 2.194 | 22 | 70 | 220 (58 / 51 / 111) | 1.526 | 23 | 1 | 0 / 50 | 246 arquivos, 4.297 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 1.2 importar nota | 2.194 | 22 | 70 | 217 (55 / 51 / 111) | 1.526 | 23 | 1 | 0 / 50 | 248 arquivos, 4.313 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 1.3 excluir unidade | 2.194 | 22 | 70 | 207 (45 / 51 / 111) | 1.526 | 23 | 1 | 0 / 50 | 250 arquivos, 4.317 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 1.4 dados fora das telas | 2.194 | 22 | 70 | 162 (0 / 51 / 111) | 1.526 | 23 | 1 | 0 / 26 | 250 arquivos, 4.323 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 1.6 salvar subproduto | 2.194 | 22 | 70 | 162 (0 / 51 / 111) | 1.526 | 23 | 1 | 0 / 26 | 251 arquivos, 4.331 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 2.1 e 2.2 sessão | 2.219 | 22 | 70 | 154 (0 / 43 / 111) | 1.526 | 23 | 1 | 0 / 26 | 252 arquivos, 4.334 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 2.3 a 2.7 fatias | 2.299 | 22 | 70 | 111 (0 / 0 / 111) | 1.526 | 23 | 1 | 0 / 26 | 252 arquivos, 4.349 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 2.8 telas nos ganchos | 2.312 | 22 | 70 | 111 (0 / 0 / 111) | 1.526 | 23 | 1 | 0 / 26 | 253 arquivos, 4.350 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 2.9 config dona do estado | 2.165 | 22 | 70 | 111 (0 / 0 / 111) | 1.526 | 23 | 1 | 0 / 26 | 254 arquivos, 4.353 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 2.9 catálogo dono do estado | 1.756 | 22 | 70 | 111 (0 / 0 / 111) | 1.526 | 23 | 1 | 0 / 26 | 254 arquivos, 4.353 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 2.9 comandas donas do estado | 1.578 | 22 | 70 | 111 (0 / 0 / 111) | 1.526 | 23 | 1 | 0 / 26 | 254 arquivos, 4.353 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 2.9 caixa dono do estado | 1.320 | 22 | 70 | 111 (0 / 0 / 111) | 1.526 | 23 | 1 | 0 / 26 | 254 arquivos, 4.353 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 2.9 offline e sessão donos do estado | 731 | 22 | 70 | 111 (0 / 0 / 111) | 1.526 | 23 | 1 | 0 / 26 | 254 arquivos, 4.353 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 2.10 coordenação e fim da fachada | 63 | 22 | 70 | 111 (0 / 0 / 111) | 1.526 | 23 | 1 | 0 / 26 | 254 arquivos, 4.354 testes | 2.387 kB (703 kB gzip) |
| 2026-11-23 | 3.1 e 3.3 um componente por arquivo | 66 | 20 | 50 | 111 (0 / 0 / 111) | 1.505 | 16 | 1 | 0 / 26 | 255 arquivos, 4.357 testes | 2.394 kB |
| 2026-11-23 | 3 lote de oito telas | 66 | 15 | 50 | 111 (0 / 0 / 111) | 1.505 | 16 | 1 | 0 / 26 | 255 arquivos, 4.357 testes | 2.394 kB |
| 2026-11-23 | 3 ganchos em notas, produtos e relatórios | 66 | 12 | 50 | 111 (0 / 0 / 111) | 1.505 | 16 | 1 | 0 / 26 | 255 arquivos, 4.358 testes | 2.403 kB |
| 2026-11-24 | 3.5 console | 66 | 11 | 50 | 111 (0 / 0 / 111) | 1.505 | 16 | 1 | 0 / 26 | 255 arquivos, 4.358 testes | 2.408 kB |
| 2026-11-24 | 3.6 checkout | 66 | 10 | 50 | 111 (0 / 0 / 111) | 1.505 | 16 | 1 | 0 / 26 | 255 arquivos, 4.360 testes | 2.412 kB |
| 2026-11-24 | 3 mesas e estoque | 66 | 8 | 50 | 111 (0 / 0 / 111) | 1.505 | 16 | 1 | 0 / 26 | 256 arquivos, 4.364 testes | 2.416 kB |
| 2026-11-24 | 3 sidebar e celular | 66 | 6 | 50 | 111 (0 / 0 / 111) | 1.505 | 16 | 1 | 0 / 26 | 256 arquivos, 4.367 testes | 2.420 kB |
| 2026-11-24 | 3.2 pdv | 66 | 5 | 15 | 111 (0 / 0 / 111) | 1.505 | 16 | 1 | 0 / 26 | 257 arquivos, 4.371 testes | 2.429 kB |
| 2026-11-24 | 3 pdv do celular e coordenação | 66 | 3 | 15 | 111 (0 / 0 / 111) | 1.505 | 16 | 0 (+13 em features/) | 0 / 38 | 258 arquivos, 4.373 testes | 2.429 kB |
| 2026-11-24 | 3 bibliotecas, fim da fase 3 | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.505 | 16 | 0 (+13 em features/) | 0 / 38 | 258 arquivos, 4.373 testes | 2.429 kB |
| 2026-11-24 | 4.1 ganchos do caixa | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.505 | 16 | 0 (+10 em features/) | 0 / 35 | 258 arquivos, 4.376 testes | 2.429 kB |
| 2026-11-24 | 4.2 pdv | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.505 | 16 | 0 (+8 em features/) | 0 / 33 | 260 arquivos, 4.387 testes | 2.429 kB |
| 2026-11-24 | 4.3 delivery | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.505 | 16 | 0 (+8 em features/) | 0 / 33 | 260 arquivos, 4.395 testes | 2.429 kB |
| 2026-11-24 | 4.4 estoque | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.505 | 16 | 0 (+5 em features/) | 0 / 30 | 260 arquivos, 4.400 testes | 2.429 kB |
| 2026-11-24 | 4.5 clientes | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.505 | 16 | 0 (+5 em features/) | 0 / 30 | 260 arquivos, 4.402 testes | 2.429 kB |
| 2026-11-24 | 4.6 financeiro | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.505 | 16 | 0 (+5 em features/) | 0 / 30 | 261 arquivos, 4.407 testes | 2.429 kB |
| 2026-11-24 | 4.7 relatórios | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.505 | 16 | 0 (+5 em features/) | 0 / 30 | 262 arquivos, 4.410 testes | 2.429 kB |
| 2026-11-24 | 4.8 cozinha | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.505 | 16 | 0 (+5 em features/) | 0 / 30 | 262 arquivos, 4.415 testes | 2.429 kB |
| 2026-11-24 | 4.9 cardápio | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.505 | 16 | 0 (+5 em features/) | 0 / 30 | 264 arquivos, 4.423 testes | 2.429 kB |
| 2026-11-24 | 4.10 configurações no celular, fim da fase 4 | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.505 | 16 | 0 (0 em features/) | 0 / 25 | 266 arquivos, 4.428 testes | 2.428 kB |
| 2026-11-24 | 5.1 guard do estilo inline | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.516 | 16 | 0 (0 em features/) | 0 / 25 | 267 arquivos, 4.430 testes | 2.428 kB |
| 2026-11-24 | 5.2 carrinho do PDV | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.440 | 16 | 0 (0 em features/) | 0 / 25 | 267 arquivos, 4.430 testes | 2.424 kB |
| 2026-11-24 | 5.3 fichas técnicas | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.365 | 16 | 0 (0 em features/) | 0 / 25 | 267 arquivos, 4.430 testes | 2.422 kB |
| 2026-11-25 | 5.4 notas de entrada | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.236 | 16 | 0 (0 em features/) | 0 / 25 | 267 arquivos, 4.431 testes | 2.418 kB |
| 2026-11-25 | 5.5 vendas e pagamento | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.129 | 16 | 0 (0 em features/) | 0 / 25 | 267 arquivos, 4.431 testes | 2.412 kB |
| 2026-11-25 | 5.6 desempenho e grade de comandas | 66 | 0 | 15 | 111 (0 / 0 / 111) | 1.036 | 16 | 0 (0 em features/) | 0 / 25 | 267 arquivos, 4.431 testes | 2.408 kB |
| 2026-11-25 | 5.7 fechamento e comandas fechadas | 66 | 0 | 15 | 111 (0 / 0 / 111) | 957 | 16 | 0 (0 em features/) | 0 / 25 | 267 arquivos, 4.431 testes | 2.403 kB |
| 2026-11-25 | 5.8 estoque e desconto | 66 | 0 | 15 | 111 (0 / 0 / 111) | 886 | 16 | 0 (0 em features/) | 0 / 25 | 267 arquivos, 4.431 testes | 2.400 kB |
| 2026-11-25 | 5.9 jarvas e barra lateral | 66 | 0 | 15 | 111 (0 / 0 / 111) | 819 | 16 | 0 (0 em features/) | 0 / 25 | 267 arquivos, 4.431 testes | 2.394 kB |
| 2026-11-25 | 5.10 subprodutos e caixa | 66 | 0 | 15 | 111 (0 / 0 / 111) | 760 | 16 | 0 (0 em features/) | 0 / 25 | 267 arquivos, 4.431 testes | 2.391 kB |
| 2026-11-25 | 5.11 resumo e remoção | 66 | 0 | 15 | 111 (0 / 0 / 111) | 710 | 16 | 0 (0 em features/) | 0 / 25 | 267 arquivos, 4.431 testes | 2.389 kB |
| 2026-11-25 | 5.12 cadastro de produtos | 66 | 0 | 15 | 111 (0 / 0 / 111) | 665 | 16 | 0 (0 em features/) | 0 / 25 | 267 arquivos, 4.431 testes | 2.387 kB |
| 2026-11-25 | 5.13 combos e janelas de produto | 66 | 0 | 15 | 111 (0 / 0 / 111) | 595 | 16 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.385 kB |
| 2026-11-25 | 5.14 usuários, meios e geral (emoji: 118 para 112) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 535 | 16 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.383 kB |
| 2026-11-25 | 5.15 relatórios (emoji: 112 para 102) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 438 | 16 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.379 kB |
| 2026-11-25 | 5.16 mesas do PDV (emoji: 102 para 100) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 400 | 15 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.377 kB |
| 2026-11-25 | 5.17 cadastro de mesas (emoji: 100 para 99) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 351 | 15 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.373 kB |
| 2026-11-25 | 5.18 resto do PDV (emoji: 99 para 98) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 295 | 11 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.370 kB |
| 2026-11-25 | 5.19 área admin | 66 | 0 | 15 | 111 (0 / 0 / 111) | 257 | 9 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.368 kB |
| 2026-11-25 | 5.20 clientes | 66 | 0 | 15 | 111 (0 / 0 / 111) | 221 | 9 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.367 kB |
| 2026-11-25 | 5.21 janelas da barra lateral | 66 | 0 | 15 | 111 (0 / 0 / 111) | 185 | 9 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.364 kB |
| 2026-11-25 | 5.22 impostos (emoji: 98 para 97) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 162 | 9 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.364 kB |
| 2026-11-25 | 5.23 abertura e login (emoji: 97 para 96) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 134 | 9 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.362 kB |
| 2026-11-25 | 5.24 casca e telas de acesso | 66 | 0 | 15 | 111 (0 / 0 / 111) | 98 | 9 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.362 kB |
| 2026-11-26 | 5.25 configurações restantes (emoji: 96 para 94) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 50 | 9 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.358 kB |
| 2026-11-26 | 5.26 cozinha (emoji: 94 para 93) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 37 | 9 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.358 kB |
| 2026-11-26 | 5.27 financeiro | 66 | 0 | 15 | 111 (0 / 0 / 111) | 15 | 9 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.435 testes | 2.358 kB |
| 2026-11-26 | 5.28 estilo inline zerado (emoji: 93 para 91) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 0 | 8 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.434 testes | 2.357 kB |
| 2026-11-26 | 5.29 avisos, ícones e cupom (emoji: 91 para 64) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 0 | 8 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.438 testes | 2.358 kB |
| 2026-11-26 | 5.30 estados vazios sem emoji (emoji: 64 para 40) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 0 | 8 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.438 testes | 2.358 kB |
| 2026-11-26 | 5.31 cores fixas (5.x) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 0 | 0 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.439 testes | 2.358 kB |
| 2026-11-26 | 5.32 emoji do produto, computador (emoji: 40 para 17) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 0 | 0 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.444 testes | 2.358 kB |
| 2026-11-26 | 5.33 emoji zerado (emoji: 17 para 0) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 0 | 0 | 0 (0 em features/) | 0 / 25 | 268 arquivos, 4.444 testes | 2.358 kB |
| 2026-11-26 | 5.34 prova do white-label (0 tela com cor do padrão no tema de outro) | 66 | 0 | 15 | 111 (0 / 0 / 111) | 0 | 0 | 0 (0 em features/) | 0 / 25 | 269 arquivos, 4.446 testes | 2.357 kB |
| 2026-11-26 | 6.1 fiscal em features/ | 66 | 0 | 15 | 106 (0 / 0 / 106) | 0 | 0 | 0 (0 em features/) | 0 / 25 | 269 arquivos, 4.446 testes | 2.357 kB |
| 2026-11-26 | 6.2 delivery em features/ | 66 | 0 | 15 | 77 (0 / 0 / 77) | 0 | 0 | 0 (0 em features/) | 0 / 25 | 269 arquivos, 4.446 testes | 2.357 kB |

A partir da linha 3.1 e 3.3, estilo inline e cor hexadecimal foram remedidos: até a 2.10 a
tabela repetia os valores da partida. O estilo inline real era 1.505 já no fim da fase 2;
a cor hexadecimal caiu de 17 para 16 porque a cor da Delivery saiu do `.jsx` para um `.js`,
que a métrica não lê, e não porque alguma cor foi trocada por variável.

A coluna "Celular importa desktop" passa a mostrar também os imports de `src/features/` para
`components/desktop/` (13 em 11 arquivos na rodada do PDV do celular): o celular usa esses
ganchos, então a dependência chega a ele por ali. Os avisos de lint sobem 12: são 13 desta regra, menos o da fronteira do celular, que mudou de
lugar e passou a ser contado aqui.

A partir da 5.1 a coluna de estilo inline vem do guard (`scripts/contarEstiloInline.mjs`), que
lê a árvore de sintaxe e conta também `style={variavel}`: 1.516, contra 1.505 da contagem por texto.

Os 50 avisos de lint da fase 0: 25 são as fronteiras de camada (zeradas nas fases 1 e 4),
15 são comentários `eslint-disable` que não suprimem nada, e 10 são dependências de hook
(`react-hooks/exhaustive-deps`), cada uma a examinar quando o arquivo dela for refatorado.
