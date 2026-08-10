# Análise pré-venda — o que falta para vender — 2026-08-10

> Escopo pedido pelo dono: **o que ainda precisa ser implementado para vender o programa,
> excluindo NF-e/NFC-e e TEF**. Fiscal e TEF ficam de fora por decisão do dono nesta análise
> (continuam registrados em F019/S1-4 e decisão 019).
>
> **Método.** Tudo abaixo foi conferido contra o código (`src/`, `supabase/`) e não apenas lido
> do backlog — os documentos se contradizem em vários pontos e três afirmações do backlog se
> mostraram **desatualizadas** (seção 6). O que não deu para verificar está marcado
> `[NÃO VERIFICADO]`: o navegador embutido desta sessão não consegue atravessar o proxy, então
> `gastromundi.kora.codes` responde a `curl` (HTTP 200) mas não foi aberto visualmente.

---

## Veredito em uma frase

O **produto** está pronto para vender: núcleo operacional, multi-tenant por RLS, planos,
assinatura com bloqueio, Console da plataforma, delivery, impressão e landing comercial estão
todos em código e testados. O que falta não é feature — é **operação de venda**: preço da
assinatura ainda zerado, QA humano ponta a ponta nunca feito, jurídico (Termos/Privacidade/LGPD)
inexistente, e a conta de hospedagem provavelmente em plano que proíbe uso comercial.

---

## 1. Bloqueadores — não dá para cobrar de um cliente sem resolver

### 1.1 🔴 A suíte de testes está vermelha hoje (4 testes)

Rodada agora: **3532 de 3536 passam**. As 4 falhas:

| Teste | Causa | Natureza |
|---|---|---|
| `src/lib/tenant/tenant.test.js:170` | Bomba-relógio de data | **Quebrou sozinho em 08/08** |
| `src/lib/console/assinatura.test.js` (2 testes) | Depende do fuso da máquina | Verde só em `TZ=America/Sao_Paulo` |
| `src/lib/console/console.test.js` (1 teste) | Depende do fuso da máquina | Verde só em `TZ=America/Sao_Paulo` |

O de `tenant.test.js` é o grave: a fixture crava `data_vencimento: "2026-08-05"` com
`carencia_dias: 3` e afirma `status: "ativo"`, mas compara contra o **relógio real**. A carência
venceu em 08/08 — de 09/08 em diante o teste passou a receber `bloqueado` e vai falhar para
sempre. Não é bug de produto (a regra está certa: venceu, bloqueia), é teste frágil.

Os outros três passam sob o fuso brasileiro e falham sob UTC. Como Vercel e GitHub Actions rodam
em **UTC**, qualquer CI que se ligue hoje nasce vermelho.

**Ação:** congelar o relógio nesses testes (fake timers) ou derivar a fixture da data corrente, e
fixar `TZ` na configuração do Vitest. Trabalho de menos de uma hora — não fiz porque o pedido
desta rodada era análise, e a escolha entre as duas estratégias é sua.

Complemento: **9 arquivos de teste nem carregam** sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
no ambiente (erro de módulo, não de asserção). Localmente com `.env.local` isso não aparece; num
runner limpo, aparece. Se for ligar CI, as duas variáveis precisam ser secrets do pipeline.

### 1.2 🔴 Preço da assinatura ainda é zero

`plano_tecnico_comercializacao.md` marca o seed `assinaturas.valor_mensal = 0` como
"placeholder — ajustar antes de cobrar qualquer cliente real". A RPC que resolve **já existe**
(`definir_mensalidade_tenant`, migration `20260911`), e a própria migration emite um
`RAISE NOTICE` contando quantos estabelecimentos estão sem mensalidade. Não é código: é entrar no
Console, aba "Planos e assinaturas", e definir o preço de cada tenant.

`[NÃO VERIFICADO]` Quantos estabelecimentos estão hoje com `valor_mensal = 0` em produção —
depende de abrir o Console ou o SQL Editor.

### 1.3 🔴 Cortesia (mensalidade zero) não consegue renovar

`confirmar_renovacao_assinatura` recusa `p_valor <= 0` (migration `20260909`, linha 112 — e há um
guard na própria migration que **exige** que essa recusa continue existindo). Consequência: um
cliente em cortesia, período de teste ou primeiro mês grátis vence, bloqueia, e não há caminho
pela tela para reativar. Pendência aberta desde a rodada 2 do loop.

Três saídas já mapeadas, **decisão sua** (é regra de negócio):
- (a) a RPC passa a aceitar zero **com motivo obrigatório**;
- (b) cortesia vira campo próprio na assinatura (`isento_ate`), sem passar por pagamento;
- (c) fica como está — e aí nunca se vende com teste grátis.

Recomendo **(b)**: separa "isenção" de "pagamento de R$ 0", mantém o histórico financeiro limpo
e não afrouxa a validação que protege o fluxo de cobrança real.

### 1.4 🔴 QA humano ponta a ponta nunca foi feito (S2-2)

Este é o item que o próprio ledger do loop chama de "o de maior valor para a venda" há várias
rodadas. Ninguém percorreu, com o dedo na tela, o caminho: **criar estabelecimento pelo Console →
entrar como admin dele → cadastrar produto → abrir comanda → lançar item → fechar venda → caixa →
imprimir**. Tudo isso tem teste automatizado, mas teste de componente não pega tela quebrada,
permissão errada em produção nem RLS que barra o que devia deixar passar.

Junto vem o **teste físico de impressora térmica** (F020, marcado "pendente de teste físico" desde
06/07): corte de guilhotina real e densidade ESC/POS variam por modelo e só se validam no papel.

`[NÃO VERIFICADO]` Nesta sessão o navegador não abriu; isso é ação do dono ou de uma sessão com
navegador funcionando.

### 1.5 🔴 Jurídico: não existe Termos de Uso nem Política de Privacidade

Procurei em `src/` e `docs/` — não há página, rota, nem documento. Vender SaaS no Brasil sem
contrato de uso e sem política de privacidade expõe você em duas frentes: contratual (o que o
cliente pode cobrar de você em disponibilidade e perda de dados) e LGPD (você é **operador** dos
dados dos clientes finais do restaurante — CPF em nota, telefone e endereço de delivery, ficha de
fiado).

Some-se a isso o que está em `memory/restrictions.md`: o direito do titular de **exportar e
excluir** seus dados está registrado como "recurso previsto no roadmap" — ou seja, **não existe**.
Há `importar-dados` como Edge Function, mas não o inverso.

**Mínimo para vender:** Termos de Uso + Política de Privacidade publicados na landing e aceitos no
provisionamento, mais um caminho (mesmo manual, via Console) para exportar e apagar os dados de um
estabelecimento a pedido. O texto jurídico em si é serviço externo — modelo gratuito adaptado
resolve o começo, advogado quando houver receita.

### 1.6 🔴 Plano de hospedagem — uso comercial

`[NÃO VERIFICADO — precisa de confirmação sua]` Dois pontos que valem dinheiro e risco:

- **Vercel Hobby proíbe uso comercial** nos termos de serviço. Se `gastromundi.kora.codes` está em
  Hobby e você começa a cobrar, está em violação e sujeito a derrubada da conta. Pro custa
  ~US$ 20/mês por membro.
- **Supabase Free** pausa o projeto após ~7 dias sem atividade, limita o banco a 500 MB e **não
  oferece backup diário nem point-in-time recovery**. Um restaurante pagante que perca o histórico
  de vendas é o fim da relação. Pro custa ~US$ 25/mês e inclui backup diário; PITR é add-on.

Custo somado: **~US$ 45/mês (~R$ 250/mês)** para sair da faixa gratuita nas duas.
**Alternativa gratuita:** não existe equivalente — self-host em VPS troca a mensalidade por
trabalho de operação e ainda custa host.
**Impacto:** alto. É o único item desta lista que, se ignorado, pode derrubar o serviço de um
cliente pagante ou perder dados dele.
**Recomendação: investir agora, no primeiro cliente pagante — não antes.** Um cliente a
R$ 200–300/mês já cobre os dois planos. Enquanto não houver cliente, continue no grátis.

### 1.7 🟠 Não existe backup nem recuperação

Consequência direta do item anterior, mas vale separado porque tem solução gratuita parcial:
`supabase db dump` agendado (GitHub Actions, gratuito no repositório privado dentro da cota)
guardando o dump como artefato. Não substitui PITR, mas transforma "perdi tudo" em "perdi o dia".

### 1.8 🟠 Console não consegue editar um estabelecimento já criado

Verificado no código: existe `atualizar_identidade_tenant` (`20260914`), mas ela é para o **admin
do próprio estabelecimento** mexer em nome de exibição e logo. **Não existe** RPC que permita ao
Console corrigir nome, slug ou endereço de um tenant já provisionado — `tenants` só tem policy de
`SELECT` na RLS. Pendência da rodada 45.

Por que bloqueia: no dia 1 de venda alguém erra o nome ou o endereço na hora de criar. Hoje o
conserto é SQL na mão. O slug é o caso espinhoso — trocá-lo quebra os links de cardápio já
entregues ao cliente, então a decisão é sua: (a) permitir trocar nome/endereço e **travar** o
slug; (b) permitir trocar o slug mantendo o antigo como redirecionamento. Recomendo **(a)** agora
e (b) só se um cliente pedir.

### 1.9 🟠 Trava de login existe só no navegador (TD008)

O bloqueio de "muitas tentativas" vive em `src/context/AppContext.jsx:845` com o contador em
`localStorage` (`src/pages/login/LoginPage.jsx`). Quem limpar o storage, abrir aba anônima ou
chamar a API direto passa por cima. Para um sistema que guarda o caixa do restaurante, isso é
frágil demais para vender.

O precedente já está no projeto: `senha_admin_tentativas` (`20260802_leva16_hardening_rpcs.sql`)
faz contagem **no servidor**. Replicar o mesmo padrão no login resolve.

---

## 2. Importante — não impede a primeira venda, morde na segunda

- **Nenhuma ajuda dentro do app.** Não há tour, tela de primeiros passos nem central de ajuda —
  procurei, não existe. O Princípio nº 1 (intuitividade) sustenta bem a operação diária, mas o
  **primeiro dia** de um cliente novo hoje depende de você por telefone. Isso não escala.
- **`FinanceiroView` carrega TODOS os lançamentos** e filtra o mês no cliente. Cresce sem limite;
  um cliente com um ano de operação vai sentir. Passar `de`/`ate` para o banco.
- **TD009 etapa 3 aberta:** `AppContext.jsx` ainda grava a venda em `sales` **e** em
  `persistirVendaNormalizada` (o mesmo par em `reenviarVendaOffline`). Duas fontes de verdade para
  a transação mais importante do sistema.
- **Offline (F021) parcial.** Funciona: fila, indicador de rede, PWA, reenvio de comanda/venda/
  estoque/financeiro, idempotência da baixa de estoque. **Falta:** trocar `localStorage` por
  IndexedDB (hoje o limite é ~5–10 MB e a API é síncrona — trava a tela em fila grande), conflito
  multi-dispositivo, realtime, e o ADR que o próprio item exigia.
- **Corrida residual na comanda (TD013).** Menos grave do que o backlog diz: já existe mescla de
  três vias (`base` × `propostos` × `banco`) em `updatePending`, então item lançado no Palm não
  some mais quando o PDV grava. Sobra a janela entre a leitura e a gravação, que só um RPC de
  append em JSONB fecha.
- **TD012 sobras:** falha sistêmica de baixa de estoque gera um alerta por produto (a deduplicação
  evita repetir o mesmo item, não a multiplicação entre itens); não há aviso na própria tela do
  PDV; `entradaEstoque` ainda só reporta ao Sentry.
- **`handleTransferir` sem teste (TD011)** — transferir itens entre comandas é justamente o fluxo
  que mais gera reclamação de conta errada.
- **Runbook desatualizado.** `runbook_supabase_pendencias.md` é de 06/07 e lista migrations que o
  TD016 depois verificou como já aplicadas. Sobram dois itens que valem conferir no painel:
  Realtime ligado em `jarvas_insights` e `mesas`.
- **`VITE_PONTE_LOCAL_ATIVA`** é lida no código mas não aparece no `.env.example`.

---

## 3. Acabamento — não bloqueia nada

Números recontados hoje (os do backlog estão defasados para mais):

| Item | Backlog diz | Realidade hoje |
|---|---|---|
| `style={{` inline (F018) | 1627 em 46 arquivos | **1584 em 46 arquivos** |
| Âmbar cru `#f59e0b` (TD018) | 30 arquivos / 60 ocorrências | **25 arquivos** |
| `key={i}` (TD015) | 40 ocorrências | **27 ocorrências** |

Maiores blocos de inline restantes: `relatorio/RelatorioView.jsx`, `NotasFiscaisTab.jsx`,
`PDVView/CheckoutView.jsx`, `AdminView.jsx`, `Sidebar.jsx`, `ConfiguracoesView.jsx`.
`vitrine.css` ainda usa `font-size` em px fixo em vez dos tokens `--fs-*`/`--lh-*`.

Também sobrando: `CredenciaisReport.jsx` é um stub morto (`return null` + TODO — a aba funciona por
render inline no `RelatorioView`); o token `--gm-sobre-accent` continua esperando seu aval (4
`color: #fff` no Console); `select("*")` sobrevive em `products`, `unidades_medida` e `subprodutos`
(tabelas não sensíveis — os casos de `pending` e `lancamentos` apontados na auditoria de julho **já
foram corrigidos**).

E as cinco pendências de decisão herdadas do loop, todas suas: usuário do responsável na mensagem
de acesso (r41), endereço do cardápio na mensagem copiada (r44), RPC de edição de endereço (r45 —
mesmo assunto do item 1.8), mínimo de senha 6 → 8 (r46), token `--gm-sobre-accent` (r53).

---

## 4. Custos — decisão sua (regra de bootstrap do CLAUDE.md)

| O que | Custo | Alternativa grátis | Impacto | Recomendação |
|---|---|---|---|---|
| Vercel Pro | ~US$ 20/mês | Nenhuma (Hobby proíbe comercial) | Alto — risco de derrubada | **Investir no 1º cliente pagante** |
| Supabase Pro | ~US$ 25/mês | Free, sem backup e com pausa | Alto — risco de perda de dados | **Investir no 1º cliente pagante** |
| `ANTHROPIC_API_KEY` (Jarvas) | Por uso; Haiku é barato | Nenhuma — sem a chave a Edge Function devolve 500 | Médio | **Só quando vender o plano Avançado** |
| Dump agendado via GitHub Actions | R$ 0 | — | Médio | **Fazer agora** |
| Certificado QZ Tray | Pago | `browser-raster` (default) | Baixo | Continuar adiado |

Atenção ao Jarvas: ele é o diferencial do plano **Avançado** e, sem a chave configurada nos
secrets da Edge Function, a tela quebra com erro 500. Ou você configura a chave antes de vender
esse plano, ou vende Jarvas como "em breve".

---

## 5. Ordem sugerida

1. Consertar os 4 testes e fixar `TZ` (uma hora).
2. Termos de Uso + Política de Privacidade na landing, aceite no provisionamento (jurídico).
3. QA humano ponta a ponta em tenant de teste + impressora térmica física.
4. Decidir cortesia (recomendo `isento_ate`) e definir a mensalidade de cada tenant no Console.
5. RPC de edição de estabelecimento no Console (nome/endereço, slug travado).
6. Trava de login no servidor (TD008), copiando `senha_admin_tentativas`.
7. Dump agendado gratuito; assinar Vercel Pro + Supabase Pro no primeiro cliente pagante.
8. Exportar/apagar dados de um estabelecimento (LGPD), mesmo que via Console.

Os itens 2, 3 e 4 dependem de você (jurídico, tela, decisão de negócio). Os demais são código.

---

## 6. Correções ao backlog (verificado no código hoje)

Três afirmações do backlog estão **erradas** e devem ser corrigidas nos respectivos arquivos:

1. **F015** diz que o roteamento por categoria/local "segue como config, ainda não consumido pela
   impressão em si". **Falso hoje:** `src/lib/impressao/despacho.js` importa `pontos.js`
   (`agruparItensPorPonto`, `pontoDoItem`) e fatia a via por ponto; `CozinhaView.jsx` e
   `PDVView.jsx` chamam esse despacho. O roteamento está ligado.
2. **Auditoria de julho** lista `select("*")` em `pending` e `lancamentos` como pendente. **Já
   corrigido** — nenhuma das duas aparece mais.
3. **TD013** descreve `updatePending` como "read-modify-write do array inteiro". **Desatualizado:**
   a mescla de três vias já existe e preserva o que outro dispositivo lançou; sobra só a janela
   não-atômica.

O `handoff_2026-07-10.md` está inteiro superado (lista multi-tenant, Console e onboarding como
"não existe em código" — os três existem). Vale marcá-lo como histórico no topo do arquivo.
