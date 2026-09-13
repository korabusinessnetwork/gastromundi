# Suítes de banco

Três suítes rodando direto no Postgres local com o schema real, assumindo os papéis como
o PostgREST faz (`SET ROLE` mais `request.jwt.claims`).

## banco-isolamento e banco-permissao (17 asserções, todas passaram)

- Admin do estabelecimento A não lê produto, usuário, venda nem configuração fiscal do B.
- Insert carimbado com o tenant do vizinho é recusado.
- Mover um produto de um estabelecimento para outro é recusado pela policy RESTRICTIVE.
- Garçom não cria usuário, não altera permissão de cargo, não vê configuração fiscal e não
  dá entrada em estoque.
- As sete funções de plataforma (`alterar_plano_tenant`, `alterar_layout_tenant`,
  `definir_mensalidade_tenant`, `sincronizar_status_assinatura`, `analytics_plataforma`,
  `saude_plataforma`, `proximo_numero_nfce`) recusam admin de estabelecimento, cada uma com
  mensagem própria em português.
- Anônimo não lê nenhuma das dez tabelas de negócio testadas.

## banco-dinheiro (12 asserções, todas passaram)

- Baixa de estoque desconta, o reenvio com o mesmo `op_id` não desconta de novo, e o saldo
  nunca fica negativo.
- Renovação de assinatura avança o vencimento um ciclo; a mesma competência duas vezes é
  recusada; valor negativo é recusado.
- Estorno devolve exatamente um ciclo e o segundo estorno do mesmo pagamento é recusado.
- Pedido público: o total é recalculado no servidor. Mandar `preco: 0.01` no payload não
  muda nada, continua R$ 20,00. Produto de outro estabelecimento e produto inativo são
  recusados.

## Achados

**B02** (S2), venda cancelada continua contando como faturamento em `relatorio_vendas`,
`jarvas_resumo_vendas` e `analytics_plataforma`. **B03** (S3), o resumo do Jarvas agrupa por
dia em UTC. Os dois têm teste escrito que falha hoje em
`tests/e2e/banco/30-pendentes-bugs-conhecidos.sql`.

**Não é bug, mas precisa de decisão:** 11 tabelas com `tenant_id` não têm a policy
RESTRICTIVE de isolamento que a convenção do `schema.sql` descreve. Testei em execução e não
há vazamento, todas isolam por dentro das policies permissivas. Está em `BUGS.md`, seção "o
que não é bug", e em `PENDENCIAS-DO-MATHEUS.md`.

## Falso positivo que eu derrubei antes de reportar

Chamar `verificar_senha_admin` como anônimo não lança erro, o que à primeira vista parecia
um oráculo de força bruta. Lendo a função, ela devolve `false` de cara quando não há sessão.
Não é bug, e não entrou no relatório.
