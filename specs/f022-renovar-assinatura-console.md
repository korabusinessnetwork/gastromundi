# F022-RENOVAR — registrar o pagamento da mensalidade no Console

## 1. Escopo

Dar porta de tela à RPC `confirmar_renovacao_assinatura`: um botão por estabelecimento no
dashboard de Planos e Assinaturas do Console que abre um modal (competência, valor, forma de
pagamento), confirma a renovação e mostra o vencimento novo.

## 2. Fora de escopo

- **Mexer no SQL.** A RPC `confirmar_renovacao_assinatura` (20260909) está aplicada e correta;
  esta rodada não cria nem altera migration nenhuma.
- **Renovar quem está em cortesia** (`valor_mensal = 0`). A RPC recusa `p_valor <= 0` no banco
  (20260909 §4) — não existe "pagamento de zero reais". Como estender cortesia é decisão de
  produto que não está escrita em lugar nenhum; fica registrada como pendência no ledger, não
  resolvida por conta própria aqui.
- **Reativar quem está `cancelado`.** Renovar recalcularia o status a partir da data nova e
  descancelaria em silêncio. Cancelamento é decisão manual da plataforma; "renovar" não é o botão
  de "voltar atrás".
- **Histórico de pagamentos na tela.** `assinaturas_pagamentos` passa a ser escrita por aqui, mas
  listar o histórico é outra fatia.
- **Gateway de pagamento, cobrança automática, boleto, Pix automático.** Tudo pago — Restrições de
  Custo. O pagamento acontece fora do sistema e aqui só se dá baixa nele.
- Refatorar `PlanosDashboard` além do necessário para encaixar a coluna e a faixa de sucesso.

## 3. Origem e decisões que este item honra

- **F022** (`docs/09_BACKLOG/features.md:82`) e **S1-2** (`docs/09_BACKLOG/sprint_pre_venda.md:26`),
  que listam "**concede/estende tempo de assinatura**" como parte do Console — a única parte do
  item que ainda não tinha tela.
- **ADR-006** (assinatura/mensalidade) e **decisão 024** (enforcement de bloqueio ligado).
- **Decisão 027** (papel `plataforma` cross-tenant): a autorização é do banco —
  `is_super_admin()` dentro da RPC `SECURITY DEFINER`. A tela não decide acesso.
- **Restrições de Custo**: renovação manual, pagamento fora do sistema (Pix/transferência),
  nenhum provedor pago envolvido.

## 4. Arquivos afetados

- `src/components/console/ConfirmarRenovacaoModal.jsx` — **novo**. Segue o desenho do irmão
  `DefinirMensalidadeModal.jsx`: `createPortal`, reuso do CSS genérico
  `NovoEstabelecimentoModal.css` (decisão 018), eco em português do que vai ser gravado.
- `src/components/console/ConfirmarRenovacaoModal.test.jsx` — **novo**.
- `src/components/console/PlanosDashboard.jsx` — coluna nova na tabela, faixa de sucesso e
  fiação do modal.
- `src/components/console/PlanosDashboard.css` — estilo da coluna e da faixa de sucesso.
- `src/components/console/PlanosDashboard.test.jsx` — asserções da coluna e da fiação.
- `src/pages/console/ConsolePage.jsx` — passa `confirmadoPor` (nome do usuário da plataforma).
- `specs/f022-renovar-assinatura-console.md` — este spec.
- `specs/_loop.md` — ledger, passo 8.

Reuso obrigatório (não reescrever): `confirmarRenovacaoAssinatura` de `@/lib/assinatura`,
`valorDigitado` de `@/lib/delivery`, `formatarReais` de `@/lib/deliveryPedidos`, e o CSS de modal
do Console.

## 5. Critérios de aceite

1. A tabela "Assinaturas por estabelecimento" ganha uma coluna com um botão de registrar pagamento
   por linha, e o botão **não existe** para linha com status `sem_assinatura` ou `cancelado` — nos
   dois casos a célula mostra "—", pelo mesmo motivo já usado na coluna Mensalidade (a RPC
   recusaria / a ação não é essa).
2. O modal abre com a **competência** pré-preenchida no mês do `data_vencimento` da linha (é o mês
   que está sendo pago) e com o **valor** pré-preenchido em `valorMensal` quando ele é maior que
   zero.
3. Valor vazio, não numérico ou menor ou igual a zero trava o botão de confirmar e mostra frase em
   português, **antes** de qualquer chamada de rede — espelhando a recusa `p_valor <= 0` da RPC.
4. Competência vazia trava o botão de confirmar.
5. Erro devolvido pela RPC aparece na tela como frase, sem quebrar o modal, e os botões voltam a
   ficar clicáveis. Vale para os três que a RPC produz: `42501` (não é plataforma), `23505`
   (competência já confirmada) e "Assinatura não encontrada".
6. Enquanto envia, os dois botões ficam desabilitados e o primário mostra estado de progresso —
   duplo-clique não gera duas confirmações.
7. Em caso de sucesso o modal fecha, `onAtualizado` é chamado (a tela recarrega do banco) e uma
   faixa de status informa o estabelecimento, a competência registrada e o **vencimento novo**;
   quando o status devolvido pela RPC ainda é `carencia` ou `bloqueado`, a faixa diz explicitamente
   que continua em atraso e que falta registrar a competência seguinte.
8. `confirmado_por` é enviado com o nome do usuário logado da plataforma, vindo de `ConsolePage`.
9. `npm test` fecha verde, com os testes novos do modal e da coluna.

Obrigatórios do `CLAUDE.md` aplicáveis:

10. **Tela nova é intuitiva** (Princípio nº1) e o spec diz por quê — ver §5 abaixo do quadro.
11. **Sem segredo hardcodado**, sem `console.log`, sem `TODO` sem justificativa.
12. **CSS separado do JSX** (decisão 018): nada de estilo inline novo; classes em arquivo `.css`.
13. **White-label** (decisão 017): nenhum nome, cor ou regra de estabelecimento específico no
    código — a tela é da plataforma e usa a marca KORA que já está no Console.
14. **Dinheiro**: o valor é lido com `valorDigitado` e transportado como veio; nenhuma aritmética
    de dinheiro nova é introduzida (a soma do MRR já existe e não é tocada).
15. **Sem `select *`**: a rodada não acrescenta nenhuma leitura — só chama a RPC existente.

**Por que é intuitiva:** o botão fica na mesma linha em que já se lê o vencimento e a mensalidade,
então a pessoa vê o que vai mudar antes de clicar; o modal repete em português o que vai ser
gravado ("Pagamento de agosto/2026, R$ 300,00") antes de confirmar; e a faixa de sucesso responde a
única pergunta que importa depois — para quando foi o vencimento — inclusive quando a resposta é
"ainda está atrasado".

## 6. Edge cases conhecidos

- **Cortesia (`valorMensal = 0`).** O modal abre com o campo de valor vazio e texto de ajuda; o
  botão fica travado até um valor maior que zero ser digitado. Não inventar "R$ 0,01" nem burlar a
  regra do banco. Vai para o ledger como pendência de decisão.
- **Atraso de vários meses.** A RPC avança **um** ciclo por chamada e aceita **uma** competência
  por mês. O default da competência é o mês do vencimento atual, então confirmações sucessivas
  caminham sozinhas mês a mês — e a faixa de sucesso precisa dizer que ainda falta.
- **Duplo-clique / competência repetida.** Trava o botão enquanto envia, e o `23505` do índice
  único aparece com a frase que a própria RPC já devolve em português.
- **`data_vencimento` ausente.** A linha só tem botão se tiver assinatura, mas o pré-preenchimento
  da competência cai no mês corrente se a data vier vazia, em vez de gerar campo inválido.
- **Fuso.** `data_vencimento` é `date` puro; ler o mês com `new Date()` jogaria o dia para trás no
  Brasil. O mês da competência é extraído da string `YYYY-MM-DD`, como `formatarData` já faz nesta
  mesma tela.
- **Sem rede.** `confirmarRenovacaoAssinatura` nunca lança: devolve `{ data: null, error }`; o
  modal mostra a mensagem e mantém o que foi digitado.

## 7. Definição de "aprovado sem ressalvas"

Todos os quinze critérios em sim, `npm test` verde sem teste quebrado de tabela, sem `TODO`
pendente, sem `console.log` esquecido, nenhuma migration criada ou alterada, e nenhuma regressão
nos testes que já existiam de `PlanosDashboard`, `DefinirMensalidadeModal` e `console.js`.

## 8. Resultado da review — 2026-08-01

**Aprovado sem ressalvas.** Quinze de quinze critérios em sim, `npm test` verde em 181 de 181
arquivos e 2790 de 2790 testes, uma rodada de correção, nenhuma escalada. Nenhum arquivo tocado
fora do §4; nenhuma migration criada ou alterada.

**Corrigido pela própria review:** `ConfirmarRenovacaoModal.test.jsx` e `PlanosDashboard.test.jsx`
diziam reproduzir as recusas reais da RPC, mas usavam frases inventadas e o código `P0002`.
Trocado pelo texto verbatim da `20260909` (linhas 102, 139 e 129) e por `P0001` — que é o que uma
`RAISE EXCEPTION` sem `USING ERRCODE` devolve. O código de produção estava certo; só os testes
mentiam. Registrado em `memory/learnings.md`.

## 9. O que ficou para uma próxima rodada

- **Cortesia não renova.** `valor_mensal = 0` esbarra no `p_valor <= 0` da RPC, que é regra do
  banco. Hoje cortesia só se sustenta empurrando `data_vencimento` na mão. Precisa de decisão do
  dono: ou a RPC passa a aceitar zero com um motivo obrigatório, ou cortesia vira um campo
  próprio na assinatura (`isento_ate`), ou fica como está.
- **Histórico de pagamentos.** `assinaturas_pagamentos` já guarda tudo (competência, valor, método,
  quem confirmou), mas nenhuma tela mostra. A faixa de sucesso é o único retorno visível.
- **Estorno.** Não existe desfazer. Pagamento registrado por engano só sai por SQL.
