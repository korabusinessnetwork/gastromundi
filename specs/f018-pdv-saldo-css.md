# F018 — PDV, fatia 2: o modal "Saldo do Dia"

## 1. Escopo

Tirar do JSX do componente `SaldoModal` (`src/components/desktop/views/PDVView/index.jsx`,
linhas 2200–2593) todas as declarações de estilo que são **literais** — cor, borda, raio,
sombra, espaçamento fixo, alinhamento, tipografia — e levá-las para as classes
`.pdv__saldo-*` do `PDVView.css` já existente, que hoje só carrega tamanho de fonte.
Continua inline apenas o que **depende de runtime**: a escala por breakpoint (`sz.pad`,
`sz.padSm`), a alternância por largura (`isNarrow`) e as cores vindas de dado
(`k.color`, `METODOS_COLOR[metodo]`, `subtotal > 0`).

Estado com **gancho nativo em CSS** deixa de ser ternário em JavaScript e passa a ser
seletor: `:disabled`, `:last-child`, `:nth-child(odd)`, `[aria-invalid="true"]` e
modificador de classe (`--autorizado`, `--aberto`).

## 2. Fora de escopo

- Qualquer linha fora do intervalo 2200–2593. As outras 155 ocorrências de `style={{`
  do arquivo ficam para as próximas fatias.
- Unificar os cinco *overlays* de modal do PDV (z-index 9000, 9100, 9200, cada um com
  o seu bloco inline). Esta rodada cria `.pdv__saldo-overlay` só para o seu modal;
  a casca compartilhada é decisão de outra fatia.
- Trocar o sistema de responsividade: `useResponsive` + `getSizes` continua no
  JavaScript, como ficou definido na fatia 1. Nada de *media query* nova.
- Mudar lógica, consulta ao Supabase, cálculo de saldo, texto de tela ou ordem de
  elementos. O único atributo novo no JSX é `className` — e o `aria-invalid` do §6.
- Criar token novo. Os dois literais de cor que sobram (`#fff` sobre a marca e o
  `rgba()` do véu/sombra) ficam com o comentário que já é padrão no arquivo.

## 3. Origem e decisões que este item honra

- **F018** (`docs/09_BACKLOG/features.md`) — revisão da estrutura de CSS, prioridade
  🟠 High, em andamento. Fatia 1 foi a rodada 13 (`specs/f018-pdv-header-css.md`).
- **Decisão 018** — CSS separado do JSX.
- **ADR-007 / decisão 023** — cor sempre por CSS Custom Property `--gm-*`; mistura com
  alfa por `color-mix`, nunca por sufixo hex (é o `BUG001`, fechado na rodada 14).
- **Decisão 017** — white-label: nada de cor de cliente cravada; tudo sai dos tokens.
- **Princípio nº 1 (intuitividade)** — "estados sempre visíveis": é o que motiva o
  único desvio visual desta rodada (§6).

## 4. Arquivos afetados

| Arquivo | O que muda |
|---|---|
| `src/components/desktop/views/PDVView/index.jsx` | Só o `SaldoModal` (2200–2593): `style={{…}}` literal vira `className`; sobra o que é runtime |
| `src/components/desktop/views/PDVView/PDVView.css` | Seção "SaldoModal" deixa de ser só tipografia e passa a ter cor, borda, layout e estado |

Nenhum outro arquivo. Nenhum teste alterado.

## 5. Critérios de aceite

1. No intervalo 2200–2593, **toda** ocorrência de `style={{` que sobrar carrega pelo
   menos um valor de runtime (`sz.*`, `isNarrow`, `k.color`, `METODOS_COLOR[…]`,
   `subtotal`). Nenhuma sobra é 100% literal.
2. Nenhuma declaração muda de valor ao ser movida: mesma cor, mesmo px, mesma
   percentagem. Onde havia `alfa(C.x, "NN")`, o CSS traz o `color-mix(in srgb,
   var(--gm-x) N%, transparent)` com o **mesmo N** que o helper calcula
   (`round(0xNN / 255 × 100)`).
3. As quatro condições com gancho nativo em CSS deixam de ser ternário em JS:
   botão "Acessar" usa `:disabled` (o atributo `disabled` já existe e é exatamente
   `!senha.trim()`); a última linha da lista de cancelados usa `:last-child`; a
   listra zebrada usa `:nth-child(odd)`; a borda de erro do campo de senha usa
   `[aria-invalid="true"]`.
4. Estado sem gancho nativo vira **modificador de classe**, não estilo inline:
   `.pdv__saldo-modal--autorizado` (largura 560 vs 420) e
   `.pdv__saldo-accordion-btn--aberto` (fundo, raio e a rotação do chevron).
5. Nenhuma cor hardcodada nova. Os únicos literais permitidos são os dois que já
   existem no arquivo e ficam comentados: `#fff` para texto sobre a cor da marca
   (não há token — proposta `--gm-sobre-accent` pendente com o dono) e os `rgba(0,0,0,…)`
   do véu do modal e da sombra.
6. Toda classe nova tem o prefixo `pdv__saldo-`, no mesmo padrão BEM do arquivo.
7. Nenhuma mudança de lógica: nenhum `useState`, `useEffect`, consulta, cálculo,
   texto de tela ou ordem de elemento alterado. Diferença no JSX restrita a
   `className`, `style` e ao `aria-invalid` do §6.
8. `npx vitest run` verde (194 arquivos / 3080 testes hoje). Nenhum arquivo de teste
   tocado.
9. Sem `TODO` novo, sem `console.log`, sem arquivo fora do §4.
10. `varColor` e `alfa` continuam importados e usados no arquivo (as outras fatias
    ainda dependem deles) — nenhum import órfão.

## 6. Edge cases conhecidos

**O campo de senha e a borda de foco — o único desvio visual, e ele é de propósito.**
Hoje a borda do input é inline (`border: 1.5px solid ${senhaErro ? red : var(--gm-input-border)}`),
e estilo inline vence qualquer regra. Isso bloqueia a regra global do
`src/styles/inputs.css` que pinta a borda de accent no foco — ou seja, **o campo de
senha do saldo é o único input do sistema que não mostra que está em foco** (o anel de
`box-shadow` já aparece, porque nenhuma regra inline define `box-shadow`). Ao mover a
borda para a classe, o campo passa a ganhar a borda de foco como todos os outros.

Só que aí aparece o efeito colateral: a regra de foco do `inputs.css` tem
especificidade maior que a da classe e pintaria de accent **também o campo com senha
errada** — e como o campo fica em foco enquanto o operador digita, o vermelho do erro
sumiria justo na hora em que ele importa. O `inputs.css` já prevê isso e trata
`aria-invalid="true"` como "erro manda mais que foco". Por isso o input recebe
`aria-invalid={!!senhaErro}`: não é feature nova, é o que mantém o sinal de erro
visível depois da extração — e de quebra é o atributo correto para leitor de tela.

Resultado combinado: em repouso, idêntico ao de hoje; em foco sem erro, ganha a borda
accent do design system; em foco com erro, mantém o vermelho e ganha o anel vermelho.
É o comportamento de todos os outros campos do sistema.

**Rótulos compartilhados com margem diferente por seção.** `.pdv__saldo-kpi-label`
aparece em quatro lugares com `margin-bottom` 4, 6, 8 e 8 e com cor `muted` ou `red`.
A classe fica com o que é constante (peso e caixa alta) e a variação vai para regra de
contexto (`.pdv__saldo-cancelamentos .pdv__saldo-kpi-label { … }`), não para inline.

**`sz.pad` no `padding` do corpo e do cabeçalho.** Segue inline. Trocar por token de
espaçamento é mudança do sistema de escala — fatia futura, não esta.

**`isNarrow` (largura < 540) no grid dos KPIs e no `flex-wrap` de duas linhas.** Segue
inline pelo mesmo motivo: a fatia 1 deixou a responsividade no JavaScript e misturar os
dois mecanismos no mesmo arquivo confundiria mais do que resolveria.

**Zebra da lista de cancelados.** O código usa `idx % 2 === 0`, isto é, o **primeiro**
item pintado. Em CSS isso é `:nth-child(odd)`, não `even` — trocar por engano inverteria
a listra.

**Lista vazia / sem autorização.** As duas listas (cancelados e comandas em aberto) já
são renderizadas sob `length > 0`; as regras `:last-child`/`:nth-child` não têm efeito
quando não há filho. O ramo não autorizado (senha) e o autorizado (dados) continuam
mutuamente exclusivos.

**Percentagens de alfa desta fatia** (`round(0xNN/255×100)`): `04`→2, `07`→3, `0c`→5,
`0e`→5, `10`→6, `12`→7, `14`→8, `18`→9, `22`→13, `33`→20, `44`→27. `0c` e `0e` caem
ambos em 5% — é o que o `alfa()` já produz hoje, e são elementos diferentes.

## 7. Definição de "aprovado sem ressalvas"

Todos os dez critérios em sim, `npx vitest run` verde, sem `TODO` pendente, sem
`console.log` esquecido, e a única diferença de aparência é a borda de foco do campo
de senha descrita no §6 — que está aqui porque foi decidida, não porque escapou.

## 8. Resultado da review (2026-08-02, rodada 15)

**Aprovado sem ressalvas. Zero rodadas de correção.** `npx vitest run`: 194 arquivos /
3080 testes verdes em 75,85s, nenhum arquivo de teste tocado. `git diff --stat` traz
exatamente os dois arquivos do §4 (`PDVView.css` +495, `index.jsx` 217 linhas
alteradas).

Os dez critérios em "sim", com a evidência de cada um:

1. As 9 ocorrências de `style={{` que sobraram no trecho carregam valor de runtime
   (`sz.pad`/`sz.padSm`, `isNarrow`, `k.color`, `METODOS_COLOR[metodo]`, `subtotal`).
   Nenhuma é 100% literal. Eram 73.
2. Nenhum valor mudou: contei os dois lados por token — `alfa()` removido contra
   `color-mix` adicionado — e bate declaração por declaração (accent 4, green 2,
   red 14 = 20 de cada lado), com `0c` e `0e` caindo nos mesmos 5% que o helper produz.
3. Os quatro ganchos nativos entraram: `:disabled`, `:last-child`, `:nth-child(odd)`
   (a listra do JSX pintava `idx % 2 === 0`, o **primeiro** item) e `[aria-invalid="true"]`.
4. Os dois modificadores existem: `.pdv__saldo-modal--autorizado` e
   `.pdv__saldo-accordion-btn--aberto` (que também gira o chevron por seletor
   descendente, sem `style` no filho).
5. Nenhuma cor nova. Sobraram os dois literais previstos, ambos comentados no CSS.
6. Toda classe nova tem o prefixo `pdv__saldo-`; a diferença entre o conjunto de
   classes do JSX e o de seletores do CSS é vazia nos dois sentidos (as três que
   pareciam órfãs são de fora do trecho ou de comentário).
7. Provado mecanicamente, não por memória: removi `style={{…}}` e `className=…` de
   `HEAD` e da cópia de trabalho e comparei. Só sobraram três reflows de formatação
   (multi-linha virando uma linha) e o `aria-invalid` do §6.
8. Suíte verde, como acima.
9. Sem `TODO`, sem `console.log`, sem arquivo fora do §4.
10. `varColor` e `alfa` continuam importados e em uso.

**Risco conferido antes de aprovar, não presumido:** li o `src/styles/inputs.css`
inteiro para saber o que a borda na classe entrega para o global. Em repouso a classe
continua vencendo (a borda de repouso global está em `:where()`, especificidade 0); no
foco sem erro o campo ganha a borda accent que nunca teve; no foco com erro o
`aria-invalid` mantém o vermelho e acrescenta o anel vermelho. O `background` é a
única declaração de alta especificidade do global, e o valor é o mesmo
`var(--gm-input-bg)` da classe. O botão "Acessar" desabilitado é `<button>`, que a
regra `input:disabled` não alcança — aparência inalterada.

**Fica para a próxima fatia:** as outras 155 ocorrências de `style={{` do arquivo, e a
casca compartilhada dos cinco overlays de modal do PDV (cada um ainda com o seu bloco
inline de véu e z-index), que continua sendo decisão de outra rodada.
