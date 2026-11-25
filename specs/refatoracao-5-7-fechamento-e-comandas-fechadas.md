# Refatoração 5.7: fechamento de caixa e comandas fechadas sem estilo inline

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `modals/FechamentoModal.jsx`: 41 atributos `style` para 0. Regras acrescentadas a
  `FechamentoModal.css`, cujo cabeçalho dizia que cor e layout "seguem inline no JSX". A
  diferença por método virou `--sobra`/`--falta` (campo e linha), o total virou `--ok`/`--falta`,
  observação preenchida virou `--preenchida`, e o botão de confirmar usa `:disabled`, que é
  a mesma condição de antes (`salvando`).
- `sidebar/ModalComandasFechadas.jsx`: 38 para 0, com `ModalComandasFechadas.css`
  co-localizado. As classes `sidebar__modal-*` são de outras três janelas e só dão o
  tamanho de fonte, então as regras novas têm prefixo próprio (`fechadas-modal__`). Divisória
  entre itens com `:last-child`; hover da lista em CSS; largura do detalhe por modificador.

Antes da conversão o roteiro ganhou quatro telas: a lista de comandas fechadas com hover, o
detalhe de uma venda paga em dois métodos, o fechamento de caixa, e o fechamento com falta no
dinheiro, sobra no Pix, observação e o aviso de método não configurado. O botão de fechar
caixa só libera sem comanda aberta, então o roteiro ganhou o gancho `preparar(contexto)`, que
registra rotas só daquela tela (comandas abertas vazias e, numa delas, um pagamento em
`vale_refeicao`).

## Uma diferença, e por quê

A tela do fechamento com observação mostra a caixa de texto focada. Antes, a borda dela era
pintada inline (destaque a 40%), e o inline vencia a regra global de foco. Agora a borda está
na classe, e a regra global de `src/styles/inputs.css` pinta o foco com o destaque cheio,
igual a todo outro campo do sistema. Só essa região da foto mudou.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os dois arquivos sem estilo inline | guard: os dois saem da linha de base |
| 2 | Telas idênticas, fora o foco da observação | `comparar` contra `--ref HEAD`: 75 telas, 1 diferença, só a caixa focada |
| 3 | Testes existentes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Menor: a linha de falta do dinheiro fica acima da
  área fotografada (o modal rola por dentro); a falta aparece no total e a regra da linha é a
  mesma da sobra do Pix, com a outra cor. Menor: o campo conferido com diferença não ganhou
  `aria-invalid`, porque falta e sobra não são erro de preenchimento, são o resultado da
  conferência.
