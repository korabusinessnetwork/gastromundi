# Refatoração 5.20: Clientes sem estilo inline

> Pedido do dono (2026-11-25): *"Continue"*.

## A mudança

- `ClientesView.jsx` (14), `clientes/ClienteDetalhe.jsx` (18) e `clientes/ClienteEdicao.jsx`
  (4) para 0. A área de Clientes do computador fica sem estilo inline.
- O espaço do `sz` chega por `--clientes-pad`, `--clientes-pad-sm` e `--clientes-gap` na
  raiz; o detalhe não recebe mais `sz`.
- O saldo de fiado virou `cliente-detalhe__saldo--devendo` (vermelho) e `--quitado` (verde),
  que definem `--saldo-cor` para a caixa, o valor e o ícone.
- Os botões Cadastrar, Salvar, Confirmar pagamento e Sim, excluir usam `:disabled` para o
  visual de travado (a condição era a mesma do `disabled`).
- Os avisos de erro da lista e do detalhe ganharam `role="alert"`.

Antes da conversão o Supabase falso ganhou dois clientes fictícios (um com duas contas de
fiado em aberto, uma vencida, e uma venda; outro sem pendência) e o roteiro ganhou sete
telas: cadastro com telefone incompleto, detalhe com fiado, confirmação de pagamento, detalhe
quitado, exclusão bloqueada pelo fiado, exclusão liberada e edição.

## Diferenças

Contra o código de antes da conversão, 165 telas: 0 com diferença e 1 leve, de novo os 16
pixels de suavização de fonte na barra lateral da aba Reservas, fora da área. Nenhum erro de
tela nas duas capturas.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Os três arquivos sem estilo inline | guard de estilo: saem da linha de base |
| 2 | Clientes igual na tela | `comparar`: 0 diferença nas telas da área |
| 3 | Testes passam | suíte |
| 4 | Build limpo, lint 0 erros, sem travessão em texto novo | comandos |

## Revisão

- Spec: 4 de 4 em sim.
- Qualidade: nenhum crítico ou importante. Dois defeitos antigos que as fotos novas mostram,
  fora do escopo:
  - O vencimento do fiado aparece um dia antes (conta de 20/12 sai como 19/12): mesmo caso
    da data da compra da 5.19, `new Date("AAAA-MM-DD")` lido como UTC.
  - As janelas de detalhe e edição do cliente saem com fonte serifada, como as janelas de
    pagamento do TD026: abrem num portal no `body`, fora da fonte do aplicativo.
