# Refatoração 5.4: Notas de Entrada sem estilo inline, e o furo do guard do travessão

> Pedido do dono (2026-11-24): *"continue"*.

## A mudança

`notasFiscais/NotaAssistenteXml.jsx` (72 atributos `style`) e `notasFiscais/NotaManual.jsx`
(57) agora têm 0. As regras foram para `NotasFiscaisTab.css`, onde já moram as das outras
peças da pasta (lista, detalhe, linha de vínculo), com prefixo `nf-assist__` e `nf-manual__`.

- Estado da área de soltar o XML (arrastando, erro) virou modificador da `nf-tab__dropzone`.
- Caixas de erro e aviso viraram modificadores (`nf-tab__erro-box--erro` e `--aviso`,
  `nf-tab__aviso--fornecedor` e `--erro`), com `color-mix` na mesma proporção do `alfa()`.
- Cor dos números da prévia: modificador por tom (`--verde`, `--aviso`, `--muted`).
- `:disabled` nos quatro botões cuja condição de aparência era idêntica à do `disabled`. O
  "Continuar" do cabeçalho não: ele fica desabilitado também enquanto confere duplicidade, mas
  só fica cinza quando a nota já foi importada, então usa o modificador `--bloqueado`.
- Hover feito em JavaScript (fornecedor no dropdown, "Cadastrar novo fornecedor", remover
  item) virou `:hover`.

Antes da conversão o roteiro ganhou uma NF-e de exemplo e quatro telas: informações da nota
(com o aviso de fornecedor não cadastrado), vínculo, prévia e nota manual.

## O guard do travessão tinha um furo

A prévia mostrava "Nota nº 1234 — Atacadão Demo Ltda", travessão como separador, e o
`travessaoGuard` não acusava. Causa: em `Nota nº {numero} — {fornecedor}` o pedaço de texto
entre as duas expressões é `" — "`, e o guard aparava os espaços antes de comparar com o
marcador de célula vazia `"—"`. O separador passava como marcador.

Correção, com teste visto falhando antes: o travessão sozinho só é marcador quando não tem
texto nem valor como irmão no mesmo elemento. Um ícone ao lado não conta (`<LuClock /> —` no
cartão de comanda vazia é "sem horário", e continua permitido). Com o guard corrigido
apareceram mais cinco casos, todos trocados por vírgula: o título do detalhe da nota, a dica
de força da senha no Console, e a observação do item no Delivery do computador, no Delivery do
celular e na Cozinha do celular ("Misto quente, sem tomate").

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | As duas telas sem estilo inline | guard: os dois arquivos saem da linha de base |
| 2 | Telas idênticas, fora a troca de travessão por vírgula | `comparar`: 55 telas, 2 diferenças, as duas são a vírgula |
| 3 | O guard pega travessão entre expressões e mantém o marcador | teste novo, vermelho antes e verde depois |
| 4 | Suíte, build limpo, lint 0 erros | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: os campos da nota manual seguem a regra
  global de foco (borda accent), como no carrinho e nas fichas, sem foto do foco. Menor: a
  área de soltar com erro, o aviso de nota duplicada e a tela de sucesso não são fotografados;
  as regras copiam os valores de antes.
