# TD018 (fatia módulo fiscal) — âmbar cru `#f59e0b` → token `--gm-warn`

## 1. Escopo

Trocar todas as ocorrências do âmbar literal `#f59e0b` no **módulo fiscal** pelo
token de tema `--gm-warn` (via `varColor(C.warn)` para cor sólida e
`alfa(C.warn, "<sufixo>")` para blend com transparência), e corrigir os dois
comentários que afirmam falsamente que esse âmbar "segue literal":

- `src/components/desktop/views/NotasFiscaisTab.jsx` — 8 usos inline no JSX;
- `src/components/desktop/views/ImpostosAdmin.jsx` — 4 usos inline no JSX;
- `src/components/desktop/views/NotasFiscaisTab.css` — comentário (sem regra CSS
  usando âmbar) que diz "segue literal";
- `src/components/desktop/views/ImpostosAdmin.css` — comentário idem.

## 2. Fora de escopo

- As demais ~10 fontes do TD018 fora do módulo fiscal (`PDVView/*`,
  `CozinhaView`, `EstoqueView`, `ConfiguracoesView`, `JarvasPanel`,
  `FechamentoModal`, `AssinaturaBanner`, `AdminView`, `ImportarExportarTab.css`,
  `DemoClientes.css`, `comprovante.css`, `roles.js`, `crypto.js`) — cada uma em
  rodada própria.
- `src/constants/colorAlfa.js` — o comentário dele (linhas 12-13) usa `#f59e0b`
  como exemplo de "cor semântica fixa não customizável", o que contradiz o
  `--gm-warn`; é um lib compartilhado por todo o app, então fica para a rodada
  final do TD018 (quando a migração for app-wide), **anotado aqui como
  contradição conhecida** a resolver.
- `src/constants/colorAlfa.test.js` — testa o fallback do `alfa()` com um hex
  literal; permanece válido e não é tocado.
- Nada de refactor de vizinhança: não mexer em outras cores, layout, lógica de
  vínculo/parse de NFe, nem na inconsistência pré-existente de passar
  `varColor(C.green)` (em vez de `C.green`) dentro de `alfa()` na `ImpostosAdmin`
  — só espelhar o mesmo formato no lado âmbar do ternário.

## 3. Origem e decisões que este item honra

- Backlog `docs/09_BACKLOG/tech-debt.md`, item **TD018** (âmbar `#f59e0b` fora do
  Console → token; cita `NotasFiscaisTab` e `ImpostosAdmin` como alvos).
- Precedente **TD017 / rodada 56 (CONSOLE-UX 30)**: mesmo problema no Console foi
  resolvido trocando o âmbar cru por `--gm-*` e **corrigindo os comentários que
  negavam o token** — este item aplica o mesmo roteiro fora do Console.
- Decisão 017 (white-label): cor de marca não pode ficar cravada; o tenant tem
  de conseguir trocá-la pelo tema. `--gm-warn` já existe em
  `src/styles/tema.css:50` como token de marca customizável.
- ADR-007 (`color-mix` para blend com alfa) e decisão 018 (CSS separado do JSX).

## 4. Arquivos afetados

- `src/components/desktop/views/NotasFiscaisTab.jsx` (modificado)
- `src/components/desktop/views/ImpostosAdmin.jsx` (modificado)
- `src/components/desktop/views/NotasFiscaisTab.css` (comentário)
- `src/components/desktop/views/ImpostosAdmin.css` (comentário)

`C` (`@/constants/colors`, com `C.warn = "--gm-warn"`), `varColor` (`@/lib/tema`)
e `alfa` (`@/constants/colorAlfa`) já estão importados nos dois JSX — nenhum
import novo.

## 5. Critérios de aceite

1. `NotasFiscaisTab.jsx` não contém nenhuma ocorrência da string `#f59e0b`.
2. `ImpostosAdmin.jsx` não contém nenhuma ocorrência da string `#f59e0b`.
3. Cada âmbar sólido inline virou `varColor(C.warn)` (props de cor, `color:`,
   `background:` de botão/badge/texto).
4. Cada âmbar dentro de `alfa(...)` virou `alfa(C.warn, "<mesmo sufixo>")`,
   preservando o sufixo de opacidade original (nenhuma mudança de opacidade
   renderizada).
5. Nos ternários âmbar/outra-cor (ex. `conf ? verde : âmbar`), o lado âmbar usa
   a mesma forma do lado oposto (se o verde é `varColor(C.green)`, o âmbar é
   `varColor(C.warn)`), mantendo o ternário simétrico.
6. O comentário de `NotasFiscaisTab.css` e o de `ImpostosAdmin.css` deixam de
   afirmar que o âmbar "segue literal" e passam a registrar que a cor de aviso
   usa o token `--gm-warn` (mesma correção feita no TD017).
7. Suíte inteira (`npx vitest run`) verde ao final, sem `console.log` esquecido
   nem `TODO` novo nos arquivos tocados.
8. Nenhum arquivo fora dos quatro listados é modificado.

## 6. Edge cases conhecidos

- `alfa(cor, sufixo)` só troca por `var(cor)` se `cor` começa com `--gm-`; ao
  passar `C.warn` (que é `"--gm-warn"`) o blend passa a seguir o tema. Passar o
  hex literal continuaria funcionando, mas mantém o débito — por isso a troca.
- Onde o ternário já passa `varColor(C.green)` (string `"var(--gm-green)"`) para
  dentro de `alfa()`, o `alfa()` cai no ramo literal e emite
  `color-mix(... var(--gm-green) ...)` — que é válido; o lado âmbar deve espelhar
  esse formato (`varColor(C.warn)`), não `C.warn`, para o ternário ficar
  homogêneo.
- Opacidade: converter sufixo hex → % é responsabilidade do `alfa()`; ao manter
  o mesmo sufixo, o pixel renderizado não muda.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, `npx vitest run` verde, sem TODO pendente,
sem `console.log` esquecido, sem `#f59e0b` restante nos dois JSX e sem regressão
visual/funcional nos fluxos da aba de Notas Fiscais e de Impostos.
