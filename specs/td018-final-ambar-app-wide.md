# TD018 (fatia final) — âmbar cru `#f59e0b` → `--gm-warn` em todo o resto do aplicativo

## 1. Escopo

Fechar o TD018: trocar o âmbar literal (`#f59e0b`, `rgba(245, 158, 11, …)`) pelo
token `--gm-warn` em todos os arquivos que sobraram depois da fatia fiscal
(rodada 58), e corrigir os comentários que ainda negam a existência do token.

JSX (via `varColor(C.warn)` para cor sólida, `alfa(C.warn, "<sufixo>")` para blend):

- `src/components/desktop/views/PDVView/ComandaGrid.jsx` — a constante `AMBER` e a
  cor do tempo estourado em `getElapsed`;
- `src/components/desktop/views/PDVView/MesaMapView.jsx` — status `reservada`;
- `src/components/desktop/views/CozinhaView.jsx` — a constante `AMBER`;
- `src/components/desktop/views/EstoqueView.jsx` — `estoqueColor` (estoque baixo)
  e o KPI "Estoque baixo";
- `src/components/desktop/views/AdminView.jsx` — status de compra `pendente` e o
  ternário de cor de estoque;
- `src/components/desktop/views/ConfiguracoesView.jsx` — papel "garçom" e unidade
  de "consumo";
- `src/components/shared/JarvasPanel.jsx` — severidade `warning`;
- `src/components/modals/FechamentoModal.jsx` — o banner de divergência;
- `src/components/desktop/AssinaturaBanner.jsx` — o banner de carência;
- `src/constants/roles.js` — cor do papel "gerente".

CSS (via `var(--gm-warn)` / `color-mix`):

- `src/components/desktop/views/ImportarExportarTab.css`;
- `src/pages/apex/demo/DemoClientes.css`;
- `src/lib/impressao/comprovante.css`.

Comentários a corrigir:

- `src/constants/colorAlfa.js` — descrevia `#f59e0b` como exemplo de "cor
  semântica fixa, não customizável", o que contradiz o token (pendência anotada
  na rodada 58);
- `src/components/desktop/views/ConfiguracoesView.css` e o bloco de nota do
  `ComandaGrid.jsx`, pelo mesmo motivo.

## 2. Regra adotada (o que este spec fixa para as próximas telas)

`#f59e0b` vira `--gm-warn` quando:

- **(a)** significa **atenção/alerta** — banner de atraso, estoque baixo, comanda
  esquecida por tempo, status pendente, divergência de caixa; **ou**
- **(b)** era o **único hex cru numa paleta que já estava tokenizada** (o resto dos
  irmãos já usava `varColor(C.x)`), caso em que deixá-lo literal é só inconsistência.

Não vira token a **paleta categórica inteiramente literal**: tokenizar 1 de 5
amostras quebra a coerência do conjunto, e mapear "gerente" ou "COFINS" num token
de *aviso* é errado semanticamente — o token passaria a significar duas coisas.

## 3. Fora de escopo (resíduos declarados, não esquecimento)

- `src/components/desktop/views/AdminView.jsx` `COR_TIPO` (tipos de imposto) e
  `src/components/desktop/views/PDVView/index.jsx` `METODOS_COLOR` (métodos de
  pagamento): paletas categóricas 100% literais — regra (b) não se aplica.
- `src/utils/crypto.js`: rampa de força de senha (fraco → forte). É escala
  contínua, não estado de aviso.
- `MesaMapView.jsx` status `aberta` (`#eab308`): precisa ser distinguível de
  `reservada` (`--gm-warn`) lado a lado no mapa, e o design system não tem um
  segundo tom de atenção. Criar esse token é decisão de design system.
- Qualquer refactor de vizinhança: nada de layout, lógica ou outras cores.

## 4. Critérios de aceite

1. Nenhum dos arquivos do §1 contém `#f59e0b` ou `rgba(245, 158, 11, …)`.
2. Cada sufixo de opacidade é preservado — nenhum pixel muda de opacidade.
3. Onde o irmão do ternário já usa `varColor(C.x)`, o lado âmbar usa a mesma
   forma (`varColor(C.warn)`), mantendo o ternário simétrico.
4. `comprovante.css` usa `var(--gm-warn, #f59e0b)` (com fallback), no mesmo
   formato que o arquivo já usa para `--gm-accent`: a folha vai para a janela de
   impressão, que pode não herdar os tokens.
5. Nenhum comentário no código continua afirmando que o âmbar é fixo ou que não
   existe token para ele.
6. Suíte inteira verde ao final.
7. Os resíduos do §3 estão registrados no `tech-debt.md`, com o motivo.

## 5. Edge case importante

`alfa(cor, sufixo)` só troca por `var(cor)` quando `cor` começa com `--gm-`; em
qualquer outro caso usa a string como veio. Isso significa que passar uma string
`"var(--gm-warn)"` já montada por `varColor()` **também funciona**: o `color-mix`
é aplicado por cima do `var()` e o blend segue o tema do tenant do mesmo jeito.
É o que sustenta os ~15 pontos de `ComandaGrid.jsx` que chamam `alfa(AMBER, "NN")`
— basta a constante `AMBER` virar `varColor(C.warn)` e todos os pontos de uso
seguem o tema sem serem tocados um a um.
