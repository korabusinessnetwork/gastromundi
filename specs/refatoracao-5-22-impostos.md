# Refatoração 5.22: Impostos sem estilo inline

> Execução Full Automático do plano de refatoração (2026-11-25), tarefa T01.

## A mudança

- `ImpostosAdmin.jsx` (15), `impostos/ModalFiscal.jsx` (7) e `impostos/FSel.jsx` (1) para 0.
  A área de Impostos fica sem estilo inline.
- A cor das contagens (itens, configurados, pendentes) e da etiqueta de status de cada item
  virou `impostos-admin__tom--<tom>`, que define `--imposto-cor`. O botão Configurar e o
  Editar, a aba ativa da janela, a busca preenchida e o seletor vazio viraram modificadores.
  A linha divisória entre itens é `:not(:last-child)`. O Salvar usa `:disabled`.
- Sem emoji (decisão 037): a prancheta do estado vazio virou `LuClipboardList`. O "📦" que
  aparece quando o produto não tem emoji fica para a rodada própria do campo de emoji do
  produto (T10).
- Os dois avisos de erro ganharam `role="alert"`. `ImpostosAdmin` deixou de receber e repassar
  `sz`, que não usava mais.

Antes da conversão o Supabase falso ganhou um item com configuração fiscal e o roteiro ganhou
nove telas: lista, busca, sem resultado, falha de carga, as quatro abas da janela fiscal e a
edição de um item configurado.

## Diferenças

Contra o código de antes da conversão, 179 telas: 1 com diferença e 1 leve.
- Impostos sem resultado: a prancheta emoji virou ícone. Vista lado a lado.
- A leve é o ruído de fonte de sempre na aba Reservas, fora da área.

Nenhum erro de tela nas duas capturas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os três arquivos sem estilo inline; Impostos só com o emoji do campo do produto | os dois guards |
| 2 | A única mudança de tela é o emoji trocado por ícone | `comparar`: 1 diferença, vista |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor e antigo: a janela fiscal passa `null` como
  valor do campo de observação quando o banco não tem observação, e o React avisa no console
  ("value prop on textarea should not be null"). Não quebra nada; registrado no TD027.
