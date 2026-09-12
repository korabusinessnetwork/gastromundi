# Relatório de varredura, GastroMundi

12/09/2026, commit base `54f76cbe`, branch `claude/dreamy-wright-b35oyo`.

## O que aconteceu

Mapeei 205 fluxos do sistema, montei do zero um ambiente onde o app roda de verdade sem
tocar em produção, executei 33 desses fluxos de ponta a ponta e achei 4 bugs, sendo um S1
e um S2. Deixei 38 asserções automatizadas no repositório, que rodam num comando só, e a
suíte própria do projeto continua verde (238 arquivos, 4191 testes).

O ambiente foi a maior parte do trabalho, e é o que dá valor ao resto: não havia Docker nem
Supabase CLI nesta máquina, então reconstruí o banco real num Postgres nativo a partir do
`supabase/schema.sql` mais as 121 migrations (60 tabelas, 107 funções, 209 policies) e
escrevi uma ponte que fala o protocolo do Supabase em cima dele. Com isso o app abriu num
Chromium de verdade, logou, abriu caixa, lançou pedido e fechou uma venda, e eu conferi cada
passo consultando o banco.

Os dois bugs mais graves são exatamente do tipo que teste com Supabase dublado não pega.

## Os bugs

| Id | Severidade | Fluxo | Uma linha |
|---|---|---|---|
| B01 | **S1** | F059 | fechar a conta direto do carrinho abre o pagamento com R$ 0,00 e diz que os itens foram removidos, enquanto eles estão gravados |
| B02 | **S2** | F183, F186 | venda cancelada continua contando como faturamento nas funções do banco, e o front a exclui, então duas telas mostram números diferentes |
| B03 | S3 | F186 | o resumo do Jarvas agrupa as vendas por dia em UTC e joga a venda da noite para o dia seguinte |
| B04 | S3 | F056 | produto de nome muito longo estoura o card e passa por cima dos vizinhos na grade do PDV |

Reprodução, evidência e impacto de cada um em `BUGS.md`. Os dois primeiros já têm teste
escrito que falha hoje, em `tests/e2e/banco/30-pendentes-bugs-conhecidos.sql` e no caso OP04
de `tests/e2e/navegador/pdv.mjs`.

**B01 é intermitente**, 12 falhas em 15 execuções, e está classificado como FLAKY por isso.
Frequência muda prioridade, não severidade: ele continua S1 porque o desfecho é a tela
afirmar que o consumo sumiu quando ele está gravado, e o caminho natural de quem lê isso é
lançar tudo de novo e cobrar em dobro.

## O que passou, e isso também é resultado

O que mais me interessava conferir era o isolamento entre estabelecimentos, já que o produto
é um SaaS multi-tenant, e ele está sólido:

- Admin do estabelecimento A não lê nem escreve nada do B, e nem consegue mover um produto
  de um para o outro.
- As sete funções da plataforma recusam admin de estabelecimento, cada uma com mensagem
  própria em português.
- Garçom não escala privilégio dentro do próprio estabelecimento.
- Anônimo não lê nenhuma tabela de negócio.
- No pedido público, mandar o preço forjado no payload não muda nada: o servidor recalcula e
  cobra o valor certo.
- A baixa de estoque é idempotente por `op_id`, que é o que segura o reenvio da fila
  offline, e o saldo nunca fica negativo.
- Renovação e estorno de mensalidade acertam o ciclo, recusam competência repetida, valor
  negativo e estorno em duplicidade.
- A venda completa grava venda, itens, pagamento, fecha a comanda, baixa o estoque e cria a
  receita no financeiro, tudo conferido no banco.

## Cobertura

33 dos 205 fluxos foram exercitados, 16 por cento, medido por execução e não estimado. O
detalhe fluxo a fluxo, e o motivo de cada um que ficou de fora, está em `COBERTURA.md`.

O número é baixo de propósito. Preferi executar poucos fluxos inteiros, conferindo no banco,
a marcar muitos por leitura de código. O que ficou de fora não sumiu: está nomeado, com
motivo, e é a fila da próxima onda.

## Os testes que ficaram

```bash
tests/e2e/rodar.sh
```

Sobe o banco local com o schema real, aplica o seed, levanta a ponte, builda o app e roda as
suítes de banco e de navegador. Hoje termina em "bateria verde (fora os pendentes de bug
conhecido)".

- `tests/e2e/banco/10-isolamento-e-permissao.sql`, 17 asserções de isolamento e papel.
- `tests/e2e/banco/20-dinheiro.sql`, 12 asserções de estoque, assinatura e pedido público.
- `tests/e2e/banco/30-pendentes-bugs-conhecidos.sql`, **falha de propósito** até B02 e B03
  serem corrigidos.
- `tests/e2e/navegador/acesso.mjs`, 6 casos de login e guarda de rota.
- `tests/e2e/navegador/pdv.mjs`, 5 casos de operação, incluindo a venda completa.

## Pendências do dono

1. Decidir sobre B01 e B02. Se quiser que eu corrija, é `/varredura corrigir`.
2. As 11 tabelas sem a policy RESTRICTIVE de isolamento (detalhe em `BUGS.md`). Não há
   vazamento hoje, é defesa em profundidade que está faltando.
3. O `package.json` aponta o `xlsx` para `cdn.sheetjs.com`, que é bloqueado por política de
   rede em ambiente de agente e em boa parte das CIs. Aqui o `npm ci` não completa. Vale
   decidir se o pacote passa a vir do registro público.

## O que esta varredura não cobre

Realtime, Edge Functions (NFC-e), storage (fotos do delivery), integrações de terceiro (CEP,
geocodificação, impressora, TEF) e as telas de celular. Tudo por limite do ambiente, tudo
nomeado em `AMBIENTE.md` e em `COBERTURA.md`.
