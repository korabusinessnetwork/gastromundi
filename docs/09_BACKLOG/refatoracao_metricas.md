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

Os 50 avisos de lint da fase 0: 25 são as fronteiras de camada (zeradas nas fases 1 e 4),
15 são comentários `eslint-disable` que não suprimem nada, e 10 são dependências de hook
(`react-hooks/exhaustive-deps`), cada uma a examinar quando o arquivo dela for refatorado.
