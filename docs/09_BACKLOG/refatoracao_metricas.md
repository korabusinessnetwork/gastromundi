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

A partir da linha 3.1 e 3.3, estilo inline e cor hexadecimal foram remedidos: até a 2.10 a
tabela repetia os valores da partida. O estilo inline real era 1.505 já no fim da fase 2;
a cor hexadecimal caiu de 17 para 16 porque a cor da Delivery saiu do `.jsx` para um `.js`,
que a métrica não lê, e não porque alguma cor foi trocada por variável.

Os 50 avisos de lint da fase 0: 25 são as fronteiras de camada (zeradas nas fases 1 e 4),
15 são comentários `eslint-disable` que não suprimem nada, e 10 são dependências de hook
(`react-hooks/exhaustive-deps`), cada uma a examinar quando o arquivo dela for refatorado.
