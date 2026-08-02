# S1-3-ASSINATURA — aba "Minha assinatura" nas Configurações do estabelecimento

Rodada 7 do ciclo. Data: 2026-08-01.

## 1. Escopo

Uma aba nova em **Configurações → Minha assinatura**, visível para gerente e admin do próprio
estabelecimento, que mostra o plano contratado (nome e mensalidade), o que esse plano inclui, a
situação da assinatura em português (em dia / vence em N dias / atrasada / bloqueada) com a data de
vencimento, e o **histórico dos pagamentos do próprio estabelecimento** — somente leitura.

## 2. Fora de escopo

- **Registrar pagamento pelo estabelecimento.** A RPC `confirmar_renovacao_assinatura` recusa quem
  não é super-admin desde a `20260909` (decisão 027: quem paga a mensalidade não dá baixa nela).
  A aba não terá botão de registrar — colocar um seria construir um caminho que o banco recusa.
- **Cancelar/estornar pagamento.** Idem: `estornar_pagamento_assinatura` (`20260913`) é da
  plataforma. O estabelecimento vê que um lançamento foi cancelado e por quê, e não age sobre ele.
- **Dizer como pagar** (chave Pix, canal de contato, boleto). Não existe nada escrito sobre isso em
  `docs/` nem em `memory/`, e inventar um canal na tela seria decisão de produto tomada por conta
  própria — além de ser conteúdo por estabelecimento (white-label). Fica como pergunta ao dono.
- **Trocar de plano / upgrade self-service** e **contratar add-on**. Envolve cobrança e decisão
  comercial; o Console já faz isso do lado da plataforma.
- **Listar add-ons contratados.** Os dois add-ons do catálogo (`nfe`, `tef`) são pagos e ainda não
  implementados (F017/F019). Hoje a lista seria vazia em todo tenant — bloco que nunca mostra nada.
- **Gateway de pagamento / cobrança automática.** Custo recorrente; adiado por regra de custo.
- **Recibo/comprovante em PDF** do pagamento.
- Qualquer mudança de policy, migration ou RPC. Esta rodada **não cria nem altera SQL**.

## 3. Origem e decisões que este item honra

- **`docs/09_BACKLOG/sprint_pre_venda.md` → S1-3** — "Configurações do estabelecimento (admin do
  TENANT): … e **visualização do próprio plano/assinatura**". Esta rodada entrega essa metade; a
  outra (identidade/tema — logo, cores, nome) fica de fora porque o upload de logo esbarra na
  pendência conhecida de Storage × RLS (`tenant_atual_id()` é NULL dentro do bucket).
- **Registrado como não construído na Rodada 6** (`specs/_loop.md`): "o histórico visto pelo
  **estabelecimento** — a policy já deixa gerente/admin lerem o do próprio tenant, mas não existe
  tela".
- **Decisão 027 / ADR-008** — o Console é a superfície da plataforma; a tela do estabelecimento lê o
  que é dele, pela policy do próprio tenant, e não chama RPC de plataforma.
- **Decisão 017 (white-label)** — nada de marca, valor ou regra de um cliente específico no código:
  plano, valor e vencimento vêm do tenant logado.
- **Decisão 018** — CSS fora do JSX, em arquivo co-localizado, com tokens do tema.
- **F013 / F016** — o registro central de planos e a vigência por ciclo pago já existem; esta tela
  só os exibe para quem paga.

### Por que não precisa de migration

A leitura já é permitida hoje, em produção:

- `assinaturas_select_auth` (`20260726`): `USING (tenant_id = tenant_atual_id() OR is_super_admin())`.
- `assinaturas_pagamentos_select_gerencia` (`20260726`): `USING (is_super_admin() OR
  (app_metadata.gastro_role IN ('gerente','admin') AND tenant_id = tenant_atual_id()))`.
- `planos_select_auth` (`20260728`): `USING (auth.role() = 'authenticated')`.

A visibilidade da aba (gerente/admin) é a mesma da policy — ninguém abre uma tela que a RLS vai
devolver vazia.

## 4. Arquivos afetados

**Criados**
- `src/components/desktop/views/MinhaAssinaturaTab.jsx` — a aba (segue o padrão de
  `ImportarExportarTab.jsx`, que já mora nessa pasta).
- `src/components/desktop/views/MinhaAssinaturaTab.css`
- `src/components/desktop/views/MinhaAssinaturaTab.test.jsx`

**Modificados**
- `src/components/desktop/views/ConfiguracoesView.jsx` — uma entrada em `ABAS_CONFIG`
  (`{ id: "assinatura", label: "Minha assinatura", gerenteOnly: true }`), o import e a linha de
  render. Nada mais nesse arquivo.
- `src/lib/assinatura.js` — recebe `rotuloCompetencia` (função pura hoje exportada de
  `src/components/console/ConfirmarRenovacaoModal.jsx`) e ganha `resumirPlanoDoTenant`, a função
  pura que monta o texto de situação, mais a constante `DIAS_AVISO_PRE_VENCIMENTO` (hoje declarada
  dentro de `AssinaturaBanner.jsx`). Motivo da mudança de casa: a tela do estabelecimento precisa
  do mesmo rótulo de mês e da mesma janela de aviso, e importar um componente do **Console** numa
  tela de tenant amarraria as duas superfícies. Nenhuma alteração de comportamento — a
  implementação é a mesma.
- `src/lib/tenant.js` — ganha `buscarPlanoDoTenant(planoCodigo)`, que lê `codigo, nome` de
  `public.planos` para a aba poder escrever "Plano Médio" em vez de `medio`. Fica aqui, e não em
  `@/lib/console`, pelo mesmo motivo acima: nada de tela de tenant importando a camada da
  plataforma.
- `src/components/desktop/AssinaturaBanner.jsx` — passa a importar `DIAS_AVISO_PRE_VENCIMENTO` de
  `@/lib/assinatura` em vez de declarar a constante localmente, para que banner e aba avisem na
  mesma janela de dias. Nenhuma outra mudança.
- `src/components/console/ConfirmarRenovacaoModal.jsx` e
  `src/components/console/HistoricoPagamentosModal.jsx` — passam a importar `rotuloCompetencia` de
  `@/lib/assinatura`.
- `src/components/console/ConfirmarRenovacaoModal.test.jsx` — mesma troca de import.
- `src/lib/assinatura.test.js` — testes de `resumirPlanoDoTenant` e de `rotuloCompetencia` na casa
  nova.
- `docs/09_BACKLOG/sprint_pre_venda.md` — marca a metade do S1-3 entregue.

## 5. Critérios de aceite

1. Existe a aba **"Minha assinatura"** em Configurações, e ela só aparece para `role` `admin` ou
   `gerente` — exatamente a mesma condição da policy `assinaturas_pagamentos_select_gerencia`.
2. A aba mostra o **nome** do plano (de `public.planos`, pelo `tenant.planoCodigo`), nunca o código
   cru (`basico`, `medio`) — código na tela é jargão técnico.
3. A aba mostra o que o plano inclui usando `ROTULOS_MODULO` (`src/constants/modulos.js`) —
   "Frente de caixa", "Tela da cozinha" —, nunca `modulo_codigo`.
4. A situação da assinatura é dita em português do dia a dia, com a data de vencimento em formato
   brasileiro: em dia, vence em N dias, vence hoje, atrasada com o prazo restante, ou bloqueada.
   O status vem de `calcularStatusAssinatura` (cálculo local), nunca da coluna `status` do banco,
   que é cache e pode estar defasado.
5. O histórico lista os pagamentos do **próprio** estabelecimento via
   `listarPagamentosAssinatura(tenantId)`, com o `tenantId` vindo do tenant logado
   (`useApp().tenant.id`) — nunca de parâmetro de tela, URL ou input.
6. Pagamento cancelado aparece marcado como cancelado, com a data e o motivo, e **não** entra na
   soma do total pago.
7. A aba **não** tem botão de registrar pagamento nem de cancelar pagamento, e não chama
   `confirmarRenovacaoAssinatura` nem `estornarPagamentoAssinatura`.
8. Dinheiro é comparado e somado em **centavos inteiros** (`valorCentavos`/`totalCentavos` de
   `resumirPagamentos`); float só existe na formatação final.
9. Nenhum `select *`: a leitura de `planos` e de `assinaturas_pagamentos` especifica os campos.
10. Toda chamada ao Supabase é tratada: falha vira mensagem em português na tela com **"Tentar de
    novo"**, e não deixa a aba em branco nem quebra as outras abas de Configurações.
11. Estados visíveis: carregando, erro, vazio ("nenhum pagamento registrado ainda") e conteúdo.
12. `resumirPlanoDoTenant` e `rotuloCompetencia` são funções puras e nascem (ou continuam) com
    teste em `src/lib/assinatura.test.js`.
13. Testes de componente novos em `MinhaAssinaturaTab.test.jsx` cobrindo: aba escondida para caixa/
    garçom, lista com pagamento válido e cancelado, total que ignora o cancelado, estado de erro com
    "Tentar de novo" e estado vazio.
14. CSS em `MinhaAssinaturaTab.css`, só com tokens `--gm-*` do tema — nenhuma cor hardcodada, nenhum
    estilo de marca de cliente.
15. Nenhuma marca, nome de estabelecimento, valor ou regra de cliente específico no código: tudo vem
    do tenant logado.
16. Nenhum `console.log`, nenhum `TODO` sem justificativa, nenhum dado sensível em log.
17. `npm test` verde, sem regressão nos testes do Console que hoje importam `rotuloCompetencia`.
18. Nenhuma migration criada ou alterada nesta rodada.

## 6. Edge cases conhecidos

- **Tenant sem assinatura** (`tenant.assinatura === null`): a aba diz que ainda não há assinatura
  registrada, sem números inventados e sem erro.
- **Plano não encontrado** em `public.planos` (código órfão): mostra o que tem, sem quebrar — o
  bloco do plano cai para uma frase neutra em vez de renderizar `undefined`.
- **Histórico vazio** (estabelecimento novo, nenhum pagamento): estado de vazio explícito, não uma
  lista em branco nem R$ 0,00 solto — zero precisa ser afirmado, não deduzido (aprendizado da
  Rodada 5).
- **Todos os pagamentos cancelados**: total zero, com a contagem de cancelados visível, para o
  número zero não parecer falha de carregamento.
- **Sem internet / RLS negando**: cai no estado de erro com "Tentar de novo"; o restante da tela de
  Configurações segue funcionando.
- **`valor_mensal = 0`** (estabelecimento de cortesia): a mensalidade aparece como isenta/zero sem
  parecer erro. É a pendência aberta desde a Rodada 2 — a tela só exibe, não decide nada sobre isso.
- **Competência fora do formato** (`null`, data legada): `rotuloCompetencia` já devolve `""`; a
  linha mostra "—" em vez de texto quebrado.
- **Carga em voo**: enquanto `tenant` é `null` no bootstrap, a aba mostra carregando, não "sem
  assinatura".

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, `npm test` verde, sem `TODO` pendente, sem `console.log`
esquecido, sem migration nova, e sem regressão nos fluxos existentes de Configurações e do Console.

## 8. Resultado da review (2026-08-01)

**Aprovado sem ressalvas** na segunda auditoria. `npm test` — 187 arquivos, 2936 testes, verde.
Nenhuma migration criada ou alterada.

Corrigido pela própria review (três desvios entre o construído e o que este spec já mandava):

1. **Critério 2 e edge case "plano não encontrado"** — sem resposta de `public.planos` a aba
   mostrava o código cru (`medio`) em vez de frase neutra. Agora cai em "Plano contratado", e o
   teste que ratificava o jargão foi reescrito para provar que o código **não** aparece.
2. **Edge case "carga em voo"** — com `tenant` nulo no bootstrap a aba afirmava "ainda não há uma
   assinatura cadastrada". Agora retorna cedo com "Carregando sua assinatura…".
3. **Edge case "todos os pagamentos cancelados"** — o total dizia "R$ 0,00 pagos em 0
   mensalidades", sem a contagem de cancelados. Agora escreve "Nenhum pagamento em vigor: N
   lançamento(s) cancelado(s)".

Ficou para uma próxima rodada (fora do escopo desta, por escrito na §2): como pagar (Pix/canal de
contato — precisa de decisão de produto do dono), troca de plano e add-ons self-service, recibo em
PDF, e a outra metade do S1-3 (identidade/tema, usuários e impressão do próprio tenant).

## 9. Por que a tela é intuitiva

A pergunta que o dono de restaurante faz é "até quando estou pago?" — e hoje a única resposta que o
sistema dá é um banner de alerta que só aparece quando já está quase tarde. A aba responde na
primeira linha, em uma frase, e só depois mostra o detalhe: o que o plano inclui e o que já foi
pago. Não há botão que o banco vá recusar, então não existe caminho que leve a erro; e como o
estabelecimento não pode registrar nem cancelar pagamento, a tela é declaradamente de leitura — o
que ela mostra é tudo o que ela faz.
