# F018 — PDV, fatia 3: os cinco modais

## 1. Escopo

Tirar do JSX do `PDVView` (`src/components/desktop/views/PDVView/index.jsx`, linhas
1364–2161) **todos** os 111 estilos inline dos cinco modais — Nova Comanda, Cancelar
Comanda, Transferir Itens, Confirmar cancelamento e Mesa — e levá-los para o
`PDVView.css`. Diferente das fatias 1 e 2, aqui **nenhuma** das 111 declarações depende
de valor de runtime: todas são literais ou condições booleanas. A meta é o trecho ficar
com **zero** `style={{`.

Condição booleana vira gancho nativo de CSS onde a expressão é exatamente equivalente
(`:disabled`, `[aria-invalid]`) e **modificador de classe** onde não é (§6).

## 2. Fora de escopo

- As 44 ocorrências restantes das linhas 794–1363 (alerta de estoque, alerta de
  validade, abas mapa/lista, busca de comandas, body). São a fatia 4, que fecha o
  arquivo.
- **Unificar os seis overlays de modal do PDV.** Esta fatia dá a cada um a sua classe,
  preservando os valores de hoje, e registra no §6 a tabela da divergência — que é o
  insumo da decisão, não a decisão.
- `ModalCupomNfce` e `ClienteComandaModal`: são componentes próprios, em arquivos
  próprios, e saem em fatias próprias.
- Trocar o sistema de responsividade. Nada de *media query* nova.
- Mudar lógica, consulta, cálculo, texto de tela ou ordem de elementos. Os únicos
  atributos novos no JSX são `className` e o `aria-invalid` do §6.
- Criar token novo. Os literais que sobram (`#fff` sobre a marca, `rgba()` de véu e
  sombra) ficam com o comentário que já é padrão no arquivo.

## 3. Origem e decisões que este item honra

- **F018** (`docs/09_BACKLOG/features.md`) — 🟠 High, em andamento. Fatia 1 foi a rodada
  13 (`specs/f018-pdv-header-css.md`), fatia 2 a rodada 15 (`specs/f018-pdv-saldo-css.md`).
- **Decisão 018** — CSS separado do JSX.
- **ADR-007 / decisão 023** — cor por CSS Custom Property; alfa por `color-mix`.
- **Decisão 017** — white-label: nada de cor de cliente cravada.
- **Princípio nº 1 (intuitividade)**, "estados sempre visíveis" — motiva o desvio visual
  declarado no §6, que é a continuação direta do que a rodada 15 decidiu para o campo de
  senha do Saldo do Dia.

## 4. Arquivos afetados

| Arquivo | O que muda |
|---|---|
| `src/components/desktop/views/PDVView/index.jsx` | Só as linhas 1364–2161: os 111 `style={{` viram `className`; seis `aria-invalid`; os dois pares de `onFocus`/`onBlur` que pintam borda à mão saem |
| `src/components/desktop/views/PDVView/PDVView.css` | Seção nova por modal + as classes `pdv__modal-*` compartilhadas deixam de ser só tipografia |

Nenhum outro arquivo. Nenhum teste alterado.

## 5. Critérios de aceite

1. **Zero** ocorrências de `style={{` entre as linhas 1364 e 2161 depois da mudança.
   Eram 111.
2. Nenhuma declaração muda de valor ao ser movida. Onde havia `alfa(C.x, "NN")`, o CSS
   traz `color-mix(in srgb, var(--gm-x) N%, transparent)` com o mesmo N que o helper
   calcula (`round(0xNN / 255 × 100)`) — tabela no §6.
3. `:disabled` só é usado nos botões em que a expressão do `disabled` é **idêntica** à
   condição que pintava o fundo. Nos três em que não é (tabela do §6), o estado vira
   modificador de classe com a mesma expressão de hoje, e o fundo **não** passa a
   depender de `disabled`.
4. Os seis inputs dos modais recebem `aria-invalid` quando têm estado de erro, na mesma
   edição em que a borda sai do inline. Os dois `onFocus`/`onBlur` que escrevem
   `style.borderColor` à mão (campo de mesa e campo de apelido) são removidos — o foco
   passa a ser do `src/styles/inputs.css`.
5. As classes compartilhadas (`pdv__modal-titulo`, `-subtitulo`, `-desc`, `-label`,
   `-input`, `-erro`, `-aviso`, `-btn`, `-close-btn`, `-emoji-circulo`) só recebem
   declaração cujo valor é **igual em todos** os seus usuários atuais. O que varia entre
   modais fica em classe por modal. Cada declaração adicionada a uma classe
   compartilhada tem que poder ser conferida assim.
6. Nenhuma cor hardcodada nova. Os únicos literais permitidos são os já existentes e
   comentados: `#fff` sobre a cor da marca e os `rgba(0,0,0,…)` de véu e sombra.
7. Toda classe nova segue o padrão BEM do arquivo, com prefixo do modal a que pertence
   (`pdv__nova-`, `pdv__cancelar-`, `pdv__transfer-`, `pdv__confirm-`, `pdv__mesa-`) ou
   `pdv__modal-` quando é de fato compartilhada.
8. Nenhuma mudança de lógica: nenhum `useState`, `useEffect`, consulta, cálculo, texto
   de tela ou ordem de elemento alterado. A diferença no JSX fica restrita a `className`,
   `style`, `aria-invalid` e à remoção dos quatro handlers de estilo do critério 4.
9. `npx vitest run` verde (194 arquivos / 3080 testes hoje). Nenhum arquivo de teste
   tocado.
10. Sem `TODO` novo, sem `console.log`, sem arquivo fora do §4. `varColor` e `alfa`
    continuam importados e usados (as fatias seguintes dependem deles).

## 6. Edge cases conhecidos

**`:disabled` não é sinônimo do que pintava o fundo — em três dos seis botões.** Este é o
principal risco da fatia: usar `:disabled` onde a expressão difere muda a aparência sem
que nada acuse.

| Botão | `disabled` | condição do fundo | `:disabled` serve? |
|---|---|---|---|
| Nova Comanda → "Abrir" | `!nome.trim() \|\| criando` | `nome.trim()` | **não** — cinzaria durante o "Abrindo..." |
| Cancelar Comanda → "Verificar Senha" | `!cancelarSenha` | `cancelarSenha` | sim |
| Cancelar Comanda → "Confirmar Cancelamento" | `cancelando \|\| !motivo.trim()` | mesma expressão | sim (o `box-shadow` não — vê abaixo) |
| Transferir Itens → "Transferir" | `!pode \|\| transferindo` | `pode` | **não** |
| Confirmar cancelamento → "Sim, cancelar" | `!motivo.trim()` | `motivo.trim()` | sim |
| Mesa → "Entrar na comanda" | `salvandoMesa \|\| !mesaInput.trim()` | `mesaInput.trim()` | **não** |

Nos três "não", o fundo vira modificador de classe com a **mesma** expressão de hoje.
O `box-shadow` dos dois botões primários também não acompanha o `disabled`: ele depende
só de `motivo.trim()` / `pode`, então acompanha o modificador, nunca o `:disabled`.

**Os seis inputs, o foco e o `aria-invalid` — o desvio visual declarado.** É a mesma
situação da rodada 15, agora em seis campos de uma vez: a borda inline vence a regra de
`:focus` do `src/styles/inputs.css`, então **nenhum** desses campos mostra foco como o
resto do sistema. Dois deles (mesa e apelido) chegam a reimplementar o foco à mão, em
JavaScript, escrevendo `style.borderColor` no `onFocus`/`onBlur` — exatamente a forma que
o `BUG001` mostrou ser frágil.

Ao mover a borda para a classe, os seis passam a ganhar a borda de foco do design system.
Consequências, todas intencionais:

- O foco pintado à mão era `alfa(C.accent, "88")` (53% do accent). O design system pinta
  `var(--gm-accent)` cheio, mais o anel. Os campos de mesa e apelido ficam com foco mais
  forte do que hoje — e igual ao de todos os outros campos do sistema.
- O campo de mesa é obrigatório e recebe `aria-invalid={!mesaInput.trim()}`. Hoje, focar
  o campo vazio pinta a borda de accent e **apaga o vermelho de "Campo obrigatório."**
  justamente quando o operador foi consertar. Com `aria-invalid`, o vermelho fica até ele
  digitar. É a mesma escolha da rodada 15: erro manda mais que foco.
- Campos com erro de servidor/validação (`cancelarSenhaErro`, `transNumeroErro`) seguem a
  mesma regra: `aria-invalid={!!erro}` e a cor de erro em `[aria-invalid="true"]`.

**Borda de "campo preenchido" não vira `:placeholder-shown`.** Os dois campos de motivo
pintam a borda de accent quando `motivo.trim()` é verdade. `:placeholder-shown` parece
equivalente e não é: um campo com só espaços já não mostra placeholder, mas `trim()`
continua vazio — a borda acenderia sem o botão liberar. Fica modificador de classe com a
expressão de hoje.

**Divergência dos overlays — registrada, não corrigida nesta fatia.** Os seis véus do PDV
têm valores diferentes sem que nenhuma decisão os justifique:

| Modal | z-index | véu | padding | font-family |
|---|---|---|---|---|
| Nova Comanda | 200 | `rgba(0,0,0,0.65)` | — | — |
| Cancelar Comanda | 9100 | `rgba(0,0,0,0.75)` | 24 | — |
| Transferir Itens | 9000 | `rgba(0,0,0,0.7)` | 24 | Inter |
| Confirmar cancelamento | 9000 | `rgba(0,0,0,0.7)` | 24 | Inter |
| Mesa | 9100 | `rgba(0,0,0,0.7)` | 24 | Inter |
| Saldo do Dia (rodada 15) | 9200 | `rgba(0,0,0,0.75)` | 24 | Inter |

Unificar mudaria a aparência de cinco telas, o que contraria o contrato desta fatia.
Cada modal fica com a sua classe e o seu valor; a tabela acima é o que a rodada de
unificação vai usar. O `z-index: 200` da Nova Comanda merece atenção nessa rodada: é o
único fora da faixa 9000+, e ela é o único modal do grupo que **não** usa `createPortal`.

**Por que as classes compartilhadas podem ser enriquecidas agora.** `pdv__modal-*` é
usada por 43 pontos, e todos os 43 estão nesta fatia — o `grep` confirma que nenhum outro
arquivo do `src/` as usa. Enriquecer uma classe compartilhada enquanto parte dos usuários
ainda carrega inline é o defeito da rodada 13 (a classe existe e o inline a mantém como
letra morta); aqui isso não acontece porque a fatia é o conjunto inteiro de usuários.

**Percentagens de alfa desta fatia** (`round(0xNN/255×100)`): `08`→3, `0a`→4, `0d`→5,
`0f`→6, `12`→7, `14`→8, `18`→9, `22`→13, `33`→20, `44`→27, `55`→33, `66`→40, `88`→53.

**Listas vazias.** "Nenhuma outra comanda aberta" e "Nenhuma comanda aberta com esse
número" são ramos que já existem e continuam iguais — só trocam de inline para classe.

## 7. Definição de "aprovado sem ressalvas"

Zero `style={{` entre 1364 e 2161, os dez critérios em sim, `npx vitest run` verde, sem
`TODO` pendente, sem `console.log` esquecido, e as únicas diferenças de aparência são as
de foco/erro descritas no §6 — que estão aqui porque foram decididas, não porque
escaparam.

## 8. Resultado da review (2026-08-02, rodada 16)

**Aprovado sem ressalvas. Zero rodadas de correção.** `npx vitest run`: 194 arquivos /
3080 testes verdes em 76,00s, nenhum arquivo de teste tocado. `npx vite build`:
`✓ built in 11.53s` — rodado porque o vitest não parseia CSS e é a única prova de que as
~870 linhas novas de folha de estilo são sintaticamente válidas. `git diff --stat` traz
exatamente os dois arquivos do §4 (`PDVView.css` +871, `index.jsx` 449 linhas alteradas;
944 inserções, 376 remoções).

| # | Critério | Evidência |
|---|---|---|
| 1 | Zero `style={{` em 1364–2161 | `grep -n 'style={{' index.jsx` na faixa devolve só a linha 1309, que é da fatia 4. Eram 111 |
| 2 | Nenhuma declaração muda de valor | Conferido token a token no diff: green removeu `0a,0f,22,44,55,66,88` e o CSS trouxe `4%,6%,13%,27%,33%,40%,53%` — 1:1. Accent e red idem, com três exceções que são exatamente as remoções declaradas no §6 (dois `onFocus` `alfa(C.accent,"88")` e um `onBlur` `alfa(C.red,"88")`). Zero `alfa()` acrescentado ao JSX |
| 3 | `:disabled` só onde a expressão é idêntica | Usado em quatro pontos: `pdv__cancelar-btn-verificar`, `pdv__cancelar-btn-confirmar`, `pdv__confirm-btn-sim` e o `cursor` do `pdv__mesa-btn-entrar`. "Abrir" e "Transferir" ficaram com `--ativo` / `--pode`, como a tabela do §6 mandava |
| 4 | `aria-invalid` nos inputs com erro, handlers removidos | Quatro `aria-invalid` na faixa (1457 `!!cancelarSenhaErro`, 1675 e 1721 `!!transNumeroErro`, 1894 `!mesaInput.trim()`) — um por input que tem estado de erro; os outros quatro dos oito não têm. `grep -c 'style.borderColor'` = 0 |
| 5 | Classe compartilhada só com valor igual em todos | Auditado usuário a usuário contra o `HEAD`. O achado: `-erro` tinha **cinco** usuários e o quinto era a dica em `muted` do modal de Mesa — foi para `.pdv__mesa-hint` com a mesma tipografia. `marginBottom: 10` que só um `-label` usava desceu para `.pdv__transfer-label` |
| 6 | Nenhuma cor hardcodada nova | Só os literais previstos: `#fff`×1 (comentado, no `--primario`) e os `rgba(0,0,0,…)` dos cinco véus da tabela do §6 |
| 7 | BEM com prefixo do modal | Nenhuma classe fora de `pdv__(modal\|nova\|cancelar\|transfer\|confirm\|mesa\|saldo)-` |
| 8 | Nenhuma mudança de lógica | Provado mecanicamente: script que remove `style`, `className` e `aria-invalid` dos dois lados e normaliza espaço; a única diferença que sobra são os quatro handlers imperativos do critério 4 |
| 9 | Suíte verde, nenhum teste tocado | Acima |
| 10 | Sem `TODO`, sem `console.log`, helpers ainda em uso | Zero de cada; `varColor(` 35× e `alfa(` 10× no arquivo — os imports seguem vivos para a fatia 4 |

**Integridade do conjunto de classes, nos dois sentidos, vazia:** classes do JSX na faixa
menos seletores do CSS = ∅; seletores `pdv__*-` do CSS menos classes do JSX = ∅. Duas
regras (`.pdv__transfer-close-btn`, `.pdv__transfer-sem-resultado`) só existiam no JSX e
foram escritas na review — é o mesmo defeito silencioso já registrado em
`memory/learnings.md`, e foi essa conferência que o pegou.

## 9. O que fica para a fatia 4

- As 44 ocorrências restantes das linhas 794–1363 do mesmo arquivo (alerta de estoque,
  alerta de validade, abas mapa/lista, busca de comandas, body). Depois desta rodada o
  `PDVView/index.jsx` está com **53** `style={{` — os 44 da fatia 4 mais os do corpo
  acima da linha 794.
- Unificar os seis overlays. A tabela do §6 é o insumo; o `z-index: 200` da Nova Comanda
  é o ponto de atenção (único fora da faixa 9000+, e único modal sem `createPortal`).
- `ModalCupomNfce` e `ClienteComandaModal`, em arquivos próprios.
- Pendente do dono, sem bloquear: alinhar o `line-height: 1.6` do `.pdv__lock-desc` com a
  escala (`--lh-base: 1.5`), e as quatro cores de marca cravadas em `METODOS_COLOR` /
  `ACTION_TYPE_META.caixa` (`index.jsx:2034`), que contrariam a decisão 017.
