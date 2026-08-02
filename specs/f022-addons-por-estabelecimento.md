# F022-ADDONS — ligar e desligar add-ons por estabelecimento pelo Console

> Rodada 9 do ciclo. Item: **F022** (Console da plataforma) — a parte "definir plano/**add-ons**
> por tenant" da decisão 027, que é o que sobrou do F022 sem depender de provedor pago.

## 1. Escopo

Uma tela no Console da plataforma onde o super-admin liga e desliga cada add-on pago
(`nfe`, `tef` — catálogo `public.addons`) de um estabelecimento, gravando por uma RPC
`SECURITY DEFINER` com guarda de super-admin, já que `tenant_addons` não tem policy de
escrita e hoje o único caminho é `INSERT` no SQL Editor.

## 2. Fora de escopo

- **Cobrar** pelo add-on. Não há campo de preço de add-on em lugar nenhum (`assinaturas` tem
  só `valor_mensal`), e criar um eixo de cobrança novo é outra rodada. Ligar o add-on aqui
  não mexe em dinheiro — quem ajusta o valor continua sendo "Definir mensalidade".
- **Contratar/integrar provedor pago** (SiTef/PayGo para TEF, certificado A1/CSC para NF-e).
  Portão de custo: nada nesta rodada exige investimento. A tela apenas **avisa** o que ainda
  não funciona de ponta a ponta; não conecta nada.
- **Módulos efetivos = plano ∪ add-ons** (decisão 021). Hoje `moduloHabilitado` olha só o
  plano e `addonHabilitado` é uma checagem separada; unificar é mudança no gating do app
  inteiro, não no Console.
- **Configurar fiscal por tenant** (decisão 026 — certificado, CSC, regime, ambiente). É o
  outro item que falta no F022, e é uma tela de segredos com desenho próprio.
- **Histórico de quem ligou/desligou o add-on e quando.** A tabela guarda `ativado_em`, e
  auditoria de verdade é assunto do `activity_log`/Console em outra rodada.
- Alterar o catálogo `public.addons` (criar/editar/remover add-on) pela tela.

## 3. Origem e decisões que este item honra

- **Backlog:** `docs/09_BACKLOG/features.md` → **F022** ("**Falta:** configurar fiscal por
  tenant (decisão 026) e **add-ons por tenant**"); `docs/09_BACKLOG/sprint_pre_venda.md` →
  **S1-2** ("define plano/add-ons por tenant").
- **Decisão 019** — NF-e e TEF são add-ons pagos **transversais**, disponíveis em todos os
  planos, contratados à parte. Ligar não pode depender do tier.
- **Decisão 021** — add-on é eixo **ortogonal** ao plano: escrita em `tenant_addons`, nunca
  em `planos_modulos`.
- **Decisão 027 / ADR-008** — quem liga add-on é a **plataforma** (super-admin cross-tenant),
  nunca o admin do estabelecimento. Escrita por RPC `SECURITY DEFINER` com
  `is_super_admin()`, nunca por policy (mesmo desenho de `alterar_plano_tenant` 20260729,
  `alterar_layout_tenant` 20260801, `definir_mensalidade_tenant` 20260911).
- **ADR-006** — inadimplência de add-on nunca bloqueia o sistema, só o próprio add-on. Nada
  aqui toca enforcement de assinatura.
- **CLAUDE.md / custo** — a rodada inteira é gratuita; o que custa dinheiro está no §2.

Nota de reconhecimento: a `20260718_addons.sql` deixou duas coisas que **já foram
corrigidas** pela `20260726_multitenant_fase4_billing_isolamento.sql` — a policy de SELECT
aberta a qualquer autenticado (hoje é `tenant_id = tenant_atual_id() OR is_super_admin()`) e
o `tenant_atual_tem_addon` que resolvia "o tenant mais antigo" (hoje resolve pelo JWT). Não
há nada a consertar nesse eixo nesta rodada.

## 4. Arquivos afetados

**Criados**
- `supabase/migrations/20260915_alternar_addon_tenant.sql` — RPC `alternar_addon_tenant`.
- `src/components/console/AddonsModal.jsx` — a tela.
- `src/components/console/AddonsModal.css` — estilo (decisão 018, CSS fora do JSX).
- `src/components/console/AddonsModal.test.jsx` — teste de componente.

**Modificados**
- `src/lib/console.js` — `listarAddons()`, `listarAddonsPorTenant()`, `alternarAddon()` e a
  função pura `resumirAddonsDoTenant()`.
- `src/lib/console.test.js` — teste da função pura nova.
- `src/constants/addons.js` — `AVISOS_ADDON`: o que, hoje, ainda não funciona de ponta a
  ponta em cada add-on (conhecimento da **plataforma** sobre a própria implementação, não
  regra de cliente — white-label preservado).
- `src/pages/console/ConsolePage.jsx` — botão de add-ons no card, carga da lista, banner.
- `src/pages/console/ConsolePage.css` — estilo do botão novo.

## 5. Critérios de aceite

1. Existe `supabase/migrations/20260915_alternar_addon_tenant.sql` criando
   `public.alternar_addon_tenant(p_tenant_id uuid, p_addon_codigo text, p_ativo boolean)`
   como `SECURITY DEFINER` com `SET search_path = public`.
2. A RPC começa com a guarda `IF public.is_super_admin() IS NOT TRUE THEN RAISE EXCEPTION …
   USING ERRCODE = 'insufficient_privilege'` — `IS NOT TRUE` (NULL barra igual, 20260730), e
   a mensagem diz em português que só a plataforma liga add-on.
3. A RPC recusa, com mensagem própria: `p_tenant_id` nulo, `p_addon_codigo` nulo/vazio,
   `p_ativo` nulo, tenant inexistente e add-on fora do catálogo `public.addons` — nenhum
   desses casos grava linha.
4. Ligar cria a linha se não existir e reativa se existir (`INSERT … ON CONFLICT
   (tenant_id, addon_codigo) DO UPDATE`); desligar mantém a linha com `ativo = false` (não
   apaga — apagar perderia o registro de que já foi contratado). `ativado_em` só é
   atualizado quando o add-on é **ligado**.
5. A migration termina com `REVOKE EXECUTE … FROM PUBLIC, anon;` **antes** do
   `GRANT EXECUTE … TO authenticated;` (nessa ordem) e traz o bloco de autoteste do padrão
   do Console: função existe, é `SECURITY DEFINER`, tem `search_path`, cita `is_super_admin`,
   `anon` não executa e `authenticated` executa.
6. O cabeçalho da migration diz que a execução é **manual** no SQL Editor e que **nenhuma
   configuração de RLS no painel** é necessária (a escrita continua só por RPC; a policy de
   SELECT já existe desde a 20260726).
7. `src/lib/console.js` ganha `alternarAddon(tenantId, addonCodigo, ativo)` que chama
   `supabase.rpc("alternar_addon_tenant", …)`, **nunca lança**, e devolve
   `{ data, error }` — mesmo contrato de `alterarPlano`/`definirMensalidade`.
8. `listarAddons()` lê `public.addons` e `listarAddonsPorTenant()` lê `public.tenant_addons`
   **com os campos nomeados** (nada de `select *`), e as duas devolvem `{ data, error }` sem
   lançar, com lista vazia no erro.
9. `resumirAddonsDoTenant(addons, tenantAddons, tenantId)` é **pura** (sem rede, sem data
   implícita), devolve um item por add-on do catálogo com `{ codigo, nome, descricao, ativo }`
   na ordem do catálogo, marca `ativo: false` para add-on sem linha e para linha com
   `ativo = false`, e tolera lista nula. Nasce com teste em `src/lib/console.test.js`.
10. O Console mostra, em cada card de estabelecimento, um botão que abre os add-ons e diz o
    estado atual em português (quantos estão ligados, ou "Sem add-ons") — o super-admin sabe
    o que aquele cliente tem sem abrir a tela.
11. No modal, cada add-on aparece com nome e descrição vindos do **catálogo do banco** (não
    hardcodados no JSX), o estado atual em palavra ("Ligado"/"Desligado") e um único botão de
    ação por linha.
12. **Desligar pede confirmação explícita** nomeando a consequência imediata para aquele
    estabelecimento (o PDV para de emitir nota / para de usar a maquininha na hora); ligar
    aplica direto. Nenhuma confirmação genérica do tipo "tem certeza?".
13. O modal avisa, **antes do clique**, o que o add-on ainda não faz de ponta a ponta:
    `tef` não tem provedor integrado (o PDV simula a aprovação e, sem internet, passa a
    barrar cartão) e `nfe` só emite de fato depois que o certificado A1 e o CSC daquele
    estabelecimento estiverem no servidor — até lá toda venda volta `sem_chave`. Add-on sem
    aviso cadastrado simplesmente não mostra aviso (nunca quebra a tela).
14. Cada linha tem estado visível de carregando/erro **próprio**: a linha que está salvando
    mostra que está salvando, as outras não travam sem motivo, e falha da RPC vira mensagem
    com `role="alert"` sem fechar o modal nem perder o estado das outras linhas.
15. Sucesso atualiza a tela a partir do que o **servidor devolveu** (a linha retornada pela
    RPC), não de um palpite otimista do cliente.
16. `AddonsModal.css` existe, nenhum estilo novo mora no JSX (decisão 018) e **nenhuma cor é
    hardcodada** — só tokens `--gm-*`. Alvos de toque com no mínimo 44px de altura.
17. Nada de marca, nome de cliente ou regra de um estabelecimento específico no código novo
    (decisão 017): a tela é dirigida pelo catálogo e pelo tenant recebido por prop.
18. Nenhum segredo, URL de API ou chave hardcodada; nenhum `console.log`, `TODO` ou `FIXME`
    nos arquivos da rodada.
19. `npx vitest run` verde, sem regressão — inclusive `ConsolePage.test.jsx`,
    `AlterarPlanoModal.test.jsx` e os testes do PDV que leem `addonHabilitado`.
20. O front **não decide autorização**: a tela pode ser aberta, mas quem barra é o banco
    (`is_super_admin()` na RPC) — e isso está escrito no comentário do componente, como nos
    outros modais do Console.

## 6. Edge cases conhecidos

- **Catálogo vazio ou ilegível** (`addons` não carregou): o modal diz que não conseguiu ler
  a lista e oferece tentar de novo, em vez de mostrar uma tela vazia que parece "este cliente
  não tem add-on disponível".
- **Add-on no `tenant_addons` que não existe mais no catálogo**: `resumirAddonsDoTenant` roda
  pelo catálogo, então a linha órfã não aparece — e não quebra nada. (Ligar um código fora do
  catálogo é impossível: a FK e a validação da RPC recusam.)
- **Dois cliques no mesmo botão**: a linha trava enquanto salva; a RPC é idempotente por
  `ON CONFLICT`, então mesmo uma corrida grava o mesmo estado final.
- **Estabelecimento sem assinatura ou com assinatura vencida**: ligar add-on continua
  permitido (ADR-006 — add-on e mensalidade são ciclos independentes); a tela não inventa
  bloqueio.
- **Desligar um add-on que já está desligado / ligar o que já está ligado**: o botão de cada
  linha reflete o estado atual, então a ação oferecida é sempre a que muda algo.
- **RPC ausente em produção** (migration ainda não rodada): o erro do PostgREST
  (`function … does not exist`) aparece como mensagem na linha, sem quebrar o Console.
- **Tenant recém-criado**: nunca tem linha em `tenant_addons` (nenhum add-on nasce ativo,
  20260718) — o modal mostra todos desligados, que é o estado correto, não um erro.

## 7. Definição de "aprovado sem ressalvas"

Todos os 20 critérios de aceite em **sim**, com evidência de arquivo e linha; `npx vitest run`
verde; nenhum `TODO`/`console.log` esquecido; nenhum arquivo tocado fora do §4; e nenhuma
regressão nos fluxos que já leem add-on (PDV/checkout) nem no Console existente.

## 8. Por que a tela é intuitiva (Princípio nº 1)

Uma linha por add-on, com o nome que o dono usa para vender ("Emissão de Nota Fiscal",
"Pagamento por TEF"), o estado escrito por extenso e **um** botão que faz a única coisa que
falta fazer naquela linha. Não há formulário para preencher, não há "salvar" no rodapé que
deixa dúvida se pegou: a ação é a linha. Desligar — que tira um recurso do cliente na hora —
pede um "sim" que **nomeia o que vai parar de funcionar**, em vez de um "tem certeza?" que não
informa nada. E o aviso do que ainda não está conectado de ponta a ponta aparece **antes** do
clique, para o dono não vender ao cliente algo que ainda não funciona.

---

## 9. Resultado da review (2026-08-02)

**Aprovada** — 20 de 20 critérios em "sim". Suíte: `npx vitest run` — 190 arquivos / 3014 testes,
verde (linha de base 189/2983).

Corrigido durante a review, sem escalar:

1. `resumirAddonsDoTenant` casava `tenant_id` nulo com tenant nulo (`null === null`) e mostraria
   um add-on pago "Ligado" para ninguém — curto-circuito `tenantId ? … : []`, com teste.
2. `AddonsModal.jsx` usava quatro classes (`.adm-erro`, `.adm-erro__titulo`, `.adm-erro__texto`,
   `.adm-relere`) que não existiam no CSS — o estado de erro mais importante da tela sairia sem
   estilo, e nada acusaria (jsdom não carrega CSS).
3. Os dois botões da confirmação de desligar saíam com alturas diferentes (`align-self:
   flex-start` do `.adm-botao`).

**Ressalva de escopo:** `src/pages/console/ConsolePage.test.jsx` foi tocado sem estar no §4. O
critério 10 (o card dizer quantos add-ons estão ligados) não tinha nenhum teste — só a contagem
pura estava coberta, a fiação do card não.

## 10. O que ficou para uma próxima rodada

- **Cobrar pelo add-on.** Hoje ligar não mexe em `assinaturas.valor_mensal` nem gera lançamento;
  o valor é combinado fora do sistema (fora de escopo §2).
- **Histórico de quem ligou/desligou e quando.** A RPC grava `ativado_em`, mas não quem agiu.
- **Unificar "módulos = plano ∪ add-ons"** para as telas do estabelecimento (decisão 021).
- **Credenciais fiscais por tenant** (decisão 026) — é o que falta para NF-e valer de verdade
  depois de ligada.
