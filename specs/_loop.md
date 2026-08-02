# Ledger do ciclo

Uma seção por rodada, mais recente no topo. Escrito pelo passo 8 do `/ciclo`.

## Rodada 7 — S1-3-ASSINATURA — 2026-08-01

- **Spec:** `specs/s1-3-minha-assinatura-no-estabelecimento.md`
- **Resultado da review:** aprovado sem ressalvas na segunda auditoria — 18 de 18 critérios em sim,
  `npm test` em 187 de 187 arquivos e 2936 de 2936 testes, uma rodada de correção sem escalada.
  Nenhum arquivo tocado fora do §4 do spec; **nenhuma migration** criada ou alterada.
- **O que o levantamento mudou no escopo:** nada precisava de SQL. As três policies de leitura já
  estão em produção — `assinaturas_select_auth` e `assinaturas_pagamentos_select_gerencia`
  (`20260726`) e `planos_select_auth` (`20260728`) —, então a aba nasceu só de front. E como toda
  escrita em assinatura passa por RPC guardada por `is_super_admin()` (decisão 027), a tela é
  declaradamente **somente leitura**: botão de registrar/cancelar aqui só levaria a um 42501.
- **Construído:** aba **"Minha assinatura"** em Configurações
  (`src/components/desktop/views/MinhaAssinaturaTab.jsx` + `.css` + `.test.jsx`), visível só para
  gerente/admin — o mesmo recorte da policy. Responde em uma frase "estou em dia?", com a data do
  próximo vencimento; mostra o plano pelo **nome** (`buscarPlanoDoTenant` em `src/lib/tenant.js`) e o
  que ele inclui por `ROTULOS_MODULO`; e lista o histórico de pagamentos do próprio tenant com o
  total do que vale, deixando o cancelado visível, riscado e com o motivo, fora da soma. Duas funções
  puras mudaram de casa para `src/lib/assinatura.js` — `rotuloCompetencia` (vinha do modal do
  Console) e `DIAS_AVISO_PRE_VENCIMENTO` (vinha do `AssinaturaBanner`) — para que banner e aba
  avisem na mesma janela e nenhuma tela de tenant importe nada do Console.
- **Corrigido pela review:** três desvios do próprio spec. (1) sem resposta de `public.planos` a aba
  mostrava o código cru `medio` — e o teste que eu tinha escrito ratificava o jargão; virou "Plano
  contratado", com teste provando que o código não aparece. (2) com `tenant` nulo no bootstrap a aba
  afirmava "ainda não há uma assinatura cadastrada"; agora mostra "Carregando sua assinatura…".
  (3) com todos os pagamentos cancelados o total dizia "R$ 0,00 pagos em 0 mensalidades"; agora
  escreve "Nenhum pagamento em vigor: N lançamento(s) cancelado(s)".
- **Aprendido:** `memory/learnings.md` (duas linhas em Técnicos — constante de regra e função pura
  que duas superfícies leem moram em `src/lib` desde o começo, e o sintoma de estar no lugar errado é
  precisar importar um componente para reaproveitar uma linha; e a tela que afirma o que ainda não
  sabe, com o agravante do teste que congela o comportamento errado); `memory/patterns.md` (dois
  padrões novos em UI/UX — "'Ainda não sei' nunca é dito como 'não existe'" e "Fallback de nome nunca
  é o código técnico"); `docs/09_BACKLOG/sprint_pre_venda.md` (S1-3 marcado como parcial, com o que
  entrou e o que falta); e o resultado da review anexado ao spec (§8).
- **Commit:** `dfd7d4c` na branch `ciclo/s1-3-minha-assinatura` (criada a partir da branch da
  Rodada 6, então carrega os commits dela; push feito, sem pull request).
- **Ação manual pendente:** continuam sem rodar em produção a `20260912_analytics_plataforma.sql` e a
  `20260913_estorno_pagamento_assinatura.sql`. Esta rodada não acrescenta nenhuma.
- **Pendente de decisão:** (a) a mesma das Rodadas 2 a 6 — estabelecimento de **cortesia**
  (`valor_mensal = 0`) não consegue renovar, porque a RPC recusa `p_valor <= 0`; (b) **como o
  estabelecimento paga** (chave Pix, canal de contato) não está escrito em `docs/` nem em `memory/`,
  então a aba de propósito não diz — é decisão de produto e conteúdo por estabelecimento.
- **Prazo do dono:** a assinatura do próprio GastroMundi vence em **2026-08-05** e bloqueia em
  **2026-08-09** — renovar pelo Console, em Planos e assinaturas → "Registrar pagamento".
- **Fica registrado (não construído):** a outra metade do S1-3 — identidade/tema do estabelecimento
  (logo, cores, nome), usuários e config de impressão pelo próprio tenant; recibo em PDF; e troca de
  plano/add-on self-service.
- **Backlog desatualizado que este levantamento encontrou (não corrigido):** `sprint_pre_venda.md`
  ainda lista **S1-1 (isolamento multi-tenant)** como bloqueador aberto, mas as migrations
  `20260723`–`20260726` e `20260738`–`20260743` já puseram `tenant_id` + policy RESTRICTIVE nas 24
  tabelas operacionais; e `features.md` diz que o **F016** está "planejado, código não iniciado",
  embora `20260720_assinatura_enforcement.sql`, `AssinaturaBanner.jsx` e `AssinaturaBloqueada.jsx`
  existam. Vale uma rodada de acerto de status antes que alguém construa de novo o que está pronto.
- **Próximo item recomendado:** **S1-3-USUARIOS** — o dono do restaurante criando e desativando os
  próprios usuários pela tela: é o pedaço do S1-3 que hoje só existe por SQL (o motivo escrito de o
  S1-3 travar a venda), o banco já está pronto para ele (`20260739_users_rls_tenant_scope.sql` e
  `20260740_tenant_slug_e_username_por_tenant.sql`) e, ao contrário de identidade/tema, não depende
  da pendência de Storage × RLS.

## Rodada 6 — F022-HISTORICO — 2026-08-01

- **Spec:** `specs/f022-historico-de-pagamentos-da-assinatura.md`
- **Resultado da review:** aprovado sem ressalvas — 17 de 17 critérios em sim, `npm test` em
  186 de 186 arquivos e 2908 de 2908 testes, **sem nenhuma rodada de correção** (as quatro correções
  da rodada aconteceram dentro do `/build`, todas no guard, não no código entregue). Nenhum arquivo
  tocado fora do §4 do spec; nenhuma policy criada ou alterada.
- **O que o levantamento mudou no escopo:** a decisão 027 diz que as duas tabelas de assinatura não
  têm policy de INSERT/UPDATE/DELETE de propósito — toda escrita passa por RPC `SECURITY DEFINER`.
  Mas a `assinaturas_pagamentos` **já tem** o ramo `OR is_super_admin()` na policy de SELECT (desde a
  `20260726`), então o Console lê o histórico direto, sem RPC de leitura e sem tocar em policy. O
  escopo ficou: uma leitura direta e **uma** RPC nova, só para o desfazer.
- **Construído:** modal "Pagamentos registrados" no `/console`
  (`src/components/console/HistoricoPagamentosModal.jsx` + `.css`, aberto pelo botão "Ver pagamentos"
  de cada linha do dashboard de planos), com `listarPagamentosAssinatura`, `estornarPagamentoAssinatura`
  e a função pura `resumirPagamentos` em `src/lib/assinatura.js`. Mostra mês, valor, quem registrou e
  quando, com o total do que vale; pagamento cancelado aparece riscado com o motivo e sem botão. O
  desfazer é a RPC `estornar_pagamento_assinatura` (migration `20260913`): exige motivo de 3
  caracteres, marca `estornado_em/estornado_por/estorno_motivo`, devolve o vencimento **um ciclo**
  para trás, recalcula o status por `calcular_status_assinatura` e reconstrói `ultima_renovacao` pelo
  maior pagamento que sobrou. O índice único de competência virou parcial
  (`WHERE estornado_em IS NULL`), então o mês fica livre para ser lançado de novo com o valor certo.
  Nada é apagado — o estorno é uma marca, não um DELETE.
- **Corrigido pela review:** nada. Os 17 critérios já estavam em sim na primeira auditoria.
- **Aprendido:** `memory/learnings.md` (duas linhas em Técnicos — o guard textual que varre o arquivo
  inteiro encontra as próprias palavras proibidas dentro do `DO $conf$` e acusa o vigia como
  infrator; e `/FOR (INSERT|UPDATE|DELETE)/` casa o `FOR UPDATE` dos locks da própria RPC, além do
  CRLF que faz toda âncora com `"\n"` falhar); `memory/patterns.md` (três marcadores em "Conferência
  textual de SQL" — proibir só antes do `DO $conf$`, ancorar no que é exclusivo do que se proíbe,
  normalizar a quebra de linha antes de ancorar); `docs/09_BACKLOG/features.md` (o histórico no
  status do F022, e a nota de RLS agora diz que toda escrita em assinatura passa por RPC); e o
  resultado da review anexado ao spec (§9).
- **Commit:** `98361a0` na branch `ciclo/f022-historico-pagamentos` (criada a partir da branch da
  Rodada 5, então carrega os commits dela; push feito, sem pull request).
- **Ação manual pendente:** rodar `supabase/migrations/20260913_estorno_pagamento_assinatura.sql` no
  SQL Editor do Supabase —
  https://github.com/korabusinessnetwork/gastromundi/blob/ciclo/f022-historico-pagamentos/supabase/migrations/20260913_estorno_pagamento_assinatura.sql
  Enquanto não rodar, o modal **lista** os pagamentos normalmente (a leitura já existe em produção);
  só o botão de cancelar falha, com a mensagem de erro na tela. Continua pendente também a
  `20260912` da Rodada 5.
- **Pendente de decisão:** a mesma das Rodadas 2 a 5, ainda sem resposta — estabelecimento de
  **cortesia** (`valor_mensal = 0`) não consegue renovar, porque a RPC recusa `p_valor <= 0`.
- **Prazo do dono:** a assinatura do próprio GastroMundi vence em **2026-08-05** e bloqueia em
  **2026-08-09** — renovar pelo Console, em Planos e assinaturas → "Registrar pagamento".
- **Fica registrado (não construído):** o histórico visto pelo **estabelecimento** (a policy já
  deixa gerente/admin lerem o do próprio tenant, mas não existe tela), recibo/comprovante anexado ao
  pagamento, e desfazer o estorno.
- **Próximo item recomendado:** **S1-3-ASSINATURA** — aba "Minha assinatura" nas Configurações do
  estabelecimento: hoje o dono do restaurante só vê o banner de vencimento, e o que ele pagou existe
  apenas na tela do dono do SaaS.

## Rodada 5 — F022-ANALYTICS — 2026-08-01

- **Spec:** `specs/f022-analytics-de-plataforma-no-console.md`
- **Resultado da review:** aprovado sem ressalvas — 16 de 16 critérios em sim, `npm test` em
  184 de 184 arquivos e 2863 de 2863 testes, uma rodada de correção sem escalada. Nenhum arquivo
  tocado fora do §4 do spec; nenhuma policy de tabela operacional alterada.
- **O que o levantamento mudou no escopo:** a nota do F022 no backlog dizia que "RLS por tenant
  precisa de override `OR auth.is_super_admin()`". A ADR-008 (§5 e decisão fechada v2 nº 2) diz o
  contrário para tabela operacional: esse ramo existe **só** em `tenants` e `assinaturas`. Quem
  fosse construir o analytics lendo o backlog alteraria a policy de `vendas` e abriria a base
  inteira de todos os clientes a qualquer token de plataforma. O escopo passou a ser o outro braço
  da mesma decisão — agregado por RPC, não leitura por policy.
- **Construído:** aba "Uso e faturamento" no `/console` (`src/components/console/AnalyticsDashboard
  .jsx` + `.css`; `listarAnalitico` e a função pura `resumirUso` em `src/lib/console.js`) —
  faturamento, pedidos, ticket médio e há quanto tempo cada estabelecimento vendeu pela última vez,
  em 7/30/90 dias. A leitura é a RPC `analytics_plataforma` (migration `20260912`), `SECURITY
  DEFINER` com `SET search_path = public`, que revalida `is_super_admin()` na primeira instrução e
  devolve **contagem e soma** — nenhuma linha de venda sai do banco. `p_dias` é lista fechada
  validada dentro do banco, porque o PostgREST expõe a função a qualquer token `authenticated`.
  Dinheiro atravessa em centavos inteiros e vira real só na formatação. Quem paga e não está
  vendendo aparece em bloco de atenção antes dos números — é a única coisa da aba que pede ação.
- **Corrigido pela review:** o estado de vazio só disparava com zero estabelecimentos. Base com
  clientes e nenhuma venda no período renderizava R$ 0,00 nos cartões e uma tabela de zeros, que se
  lê como "não carregou" — exatamente o erro que a aba existe para evitar. Entrou a frase que afirma
  o zero ("Nenhuma venda no período..."), com dois testes.
- **Aprendido:** `memory/patterns.md` (padrão novo "O Console lê a operação por agregado, nunca por
  policy" — assinatura de retorno como tranca, período validado no banco, os dois guards);
  `memory/learnings.md` (duas linhas em Técnicos — nota de backlog envelhece e não é revisada quando
  a ADR muda, o backlog diz **o que** falta e nunca **como** se faz; e o bloco `DO $conf$` só protege
  o banco onde já rodou, some no primeiro `CREATE OR REPLACE`, então RPC cuja forma é a garantia
  nasce com o autoteste em SQL **e** o `*SqlGuard.test.js` — já são 9);
  `docs/09_BACKLOG/features.md` (a nota errada do F022 corrigida, e a aba nova no status);
  e o resultado da review anexado ao spec (§8 e §9).
- **Commit:** `334deaa` na branch `ciclo/f022-analytics-console` (criada a partir da branch da
  Rodada 4, então carrega os commits dela; push feito, sem pull request).
- **Ação manual pendente:** rodar `supabase/migrations/20260912_analytics_plataforma.sql` no SQL
  Editor do Supabase. Enquanto não rodar, a aba mostra o erro com "Tentar de novo" e as outras duas
  abas do Console seguem intactas — a leitura só acontece quando alguém abre a aba.
- **Pendente de decisão:** a mesma das Rodadas 2, 3 e 4, ainda sem resposta — estabelecimento de
  **cortesia** (`valor_mensal = 0`) não consegue renovar, porque a RPC recusa `p_valor <= 0`.
- **Fica registrado (não construído):** impersonação/escopo explícito por estabelecimento (o outro
  braço da ADR-008), detalhe e gráfico por estabelecimento, exportar CSV/PDF, separar delivery de
  salão, e transformar "paga e não está vendendo" em alerta ativo do Jarvas.
- **Próximo item recomendado:** **F022-HISTORICO** — histórico de pagamentos da assinatura e
  correção de pagamento lançado por engano: a Rodada 2 pôs no Console um botão que empurra a data de
  vencimento e grava em `assinaturas_pagamentos`, e hoje ninguém vê o que foi lançado nem desfaz um
  lançamento errado sem SQL em produção.

## Rodada 4 — prévia do cardápio abre o estabelecimento logado — 2026-08-01

- **Spec:** `specs/previa-do-cardapio-abre-o-estabelecimento-logado.md`
- **Resultado da review:** aprovado sem ressalvas — 14 de 14 critérios em sim, `npm test` em
  182 de 182 arquivos e 2817 de 2817 testes, **sem nenhuma rodada de correção**. Nenhum arquivo
  tocado fora do §4 do spec; nenhuma migration criada ou alterada.
- **O que o levantamento mudou no escopo:** a recomendação da Rodada 3 dizia que "não existe jeito de
  ver o cardápio como o cliente vê", e a fila do dono dizia o oposto — "✅ ENTREGUE (f9fc34f)". As
  duas estavam erradas do mesmo jeito. O botão existia **e abria o estabelecimento errado**: sem
  subdomínio por tenant em produção, `CardapioPage` resolvia o slug pelo fallback, então o dono de
  qualquer estabelecimento via a vitrine, a marca, as categorias e os preços da GastroMundi. O escopo
  virou fechar esse furo de white-label (decisão 017), não construir a tela.
- **Construído:** o botão leva `?loja=<slug do tenant logado>` — o `slug` entrou no `select` de
  `buscarTenantAtual`, que não o trazia, embora a coluna exista desde a `20260740`. A vitrine passou
  a resolver por `slugDaVitrine`: **subdomínio > query > fallback**, então endereço publicado nunca é
  sequestrado por URL e ligar o subdomínio (item 2 da fila) depois não muda nada aqui. O que vem da
  query é validado por `slugValido` antes de virar parâmetro de RPC; o que sai do banco passa por
  `encodeURIComponent`. Tenant sem slug abre `/cardapio` como antes — degrada, não some.
- **Achado no caminho (não chegou a produção):** `salvarBrandingCache` carimba o cache com o slug da
  **origem**, que numa origem compartilhada é sempre `gastromundi`. A prévia da Casa Coffee gravaria
  a marca dela sob o carimbo do vizinho e a tela de login da origem passaria a pintar "Casa Coffee"
  para todo mundo. Prévia agora não lê nem grava o cache; um teste de controle prova que o caminho
  normal continua lendo e gravando.
- **Aprendido:** `memory/learnings.md` (Técnicos — cache carimbado pela origem não pode ser escrito
  por tela que mostra outro estabelecimento; Processo — item marcado "entregue" escondeu o furo:
  o levantamento pergunta o que a coisa **faz**, não se existe); `memory/patterns.md` → Padrões de
  Código (padrão novo "Superfície pública endereçada por slug: precedência e cache por origem");
  `memory/bugs.md` (seção "Ciclo do loop — 2026-08-01", com os dois defeitos);
  `memory/fila-proximas-features.md` (o item 1 passou a descrever o comportamento, não só o commit);
  e o resultado da review anexado ao spec (§8 e §9).
- **Commit:** `5753de0` na branch `ciclo/previa-cardapio-estabelecimento-certo` (criada a partir da
  branch da Rodada 3, então carrega os commits dela; push feito, sem pull request). Inclui o ledger
  da Rodada 3, que ficou de fora do commit daquela rodada.
- **Pendente de decisão:** a mesma das Rodadas 2 e 3, ainda sem resposta — estabelecimento de
  **cortesia** (`valor_mensal = 0`) não consegue renovar, porque a RPC recusa `p_valor <= 0`.
- **Não verificado em produção:** se a migration `20260740` (que criou `tenants.slug`) está aplicada.
  O código degrada em silêncio se não estiver (`slug ?? null` → `/cardapio` seco), mas a prévia só
  acerta o estabelecimento com a coluna no ar.
- **Próximo item recomendado:** **F022-ANALYTICS** — analytics de plataforma no Console (faturamento,
  pedidos e ticket médio por estabelecimento): é a fatia que falta do item nº 3 da fila do dono, é
  gratuita, e hoje o Console mostra quem paga mas não mostra quem usa.

## Rodada 3 — TD012 — 2026-08-01

- **Spec:** `specs/td012-baixa-de-estoque-que-falha-em-silencio.md`
- **Resultado da review:** aprovado sem ressalvas — 11 de 11 critérios em sim, `npm test` em
  181 de 181 arquivos e 2801 de 2801 testes, **sem nenhuma rodada de correção**. Nenhum arquivo
  tocado fora do §4 do spec; nenhuma migration criada ou alterada.
- **O que o levantamento mudou no escopo:** o título do TD012 estava desatualizado. A parte "engole
  a exceção e mostra estimativa local" já tinha sido consertada no `AppContext` meses antes. O que
  continuava aberto era a outra metade: a falha ia para o Sentry, para `jarvas_eventos` e para o
  `activity_log` — três destinos que só o desenvolvedor abre. O gestor não via nada. O spec foi
  escrito para essa metade, mais dois defeitos achados no caminho na própria `processarBaixaEstoque`.
- **Construído:** `gerarAlertaBaixaFalhou` leva a baixa recusada ao painel do Jarvas, com o dedupe
  por `origem.chave` dos irmãos e o erro cru do Postgres guardado em `origem.dados.erro`, fora do
  texto que o dono de restaurante lê. Offline **não** alerta — a baixa entra na fila e é reaplicada.
  `processarBaixaEstoque` parou de devolver saldo estimado no erro e passou a embrulhar a RPC em
  `try/catch`, como as duas irmãs já faziam.
- **Aprendido:** `memory/learnings.md` (duas linhas — "reportar não é alertar: Sentry, evento e log
  não fecham um item de falha silenciosa"; "um teste pode estar guardando o bug", que era o caso:
  `estoque.test.js` afirmava o saldo inventado com comentário justificando);
  `docs/09_BACKLOG/tech-debt.md` (TD012 resolvido, com seção própria); `sprint_pre_venda.md` (S2-1
  feito); `memory/bugs.md`; e o resultado da review anexado ao spec (§8 e §9).
- **ID duplicado corrigido:** existiam dois `TD012` no `tech-debt.md`. A seção `key={i}` em listas
  React virou **TD015** e ganhou a linha na tabela ativa que nunca teve.
- **Commit:** `150be86` na branch `ciclo/td012-baixa-estoque-silenciosa` (criada a partir da branch
  da Rodada 2, então carrega os commits dela; push feito, sem pull request).
- **Pendente de decisão:** a mesma da Rodada 2, ainda sem resposta — estabelecimento de **cortesia**
  (`valor_mensal = 0`) não consegue renovar, porque a RPC recusa `p_valor <= 0`. Não bloqueia nada
  desta rodada.
- **Fica registrado (não construído):** falha sistêmica gera um alerta por produto distinto; somar
  num alerta só é regra nova de agregação. Avisar o operador na tela do PDV continua sendo decisão
  de produto não escrita. `entradaEstoque` também só reporta ao Sentry.
- **Próximo item recomendado:** **preview clicável do cardápio do cliente** — é o item nº 1 da fila
  do dono, e hoje não existe jeito de ver o cardápio como o cliente vê antes de publicar.

## Rodada 2 — F022-RENOVAR — 2026-08-01

- **Spec:** `specs/f022-renovar-assinatura-console.md`
- **Resultado da review:** aprovado sem ressalvas — 15 de 15 critérios em sim, `npm test` em
  181 de 181 arquivos e 2790 de 2790 testes, uma rodada de correção sem escalada. Nenhum arquivo
  tocado fora do §4 do spec; nenhuma migration criada ou alterada.
- **Corrigido pela review:** os dois arquivos de teste diziam citar "as recusas reais da RPC" mas
  usavam frases inventadas e um código errado (`P0002`, sendo que a exceção de assinatura
  inexistente não declara `ERRCODE` e chega como `P0001`). Trocado pelo texto literal da
  `20260909` (linhas 102, 139 e 129).
- **Aprendido:** `memory/learnings.md` (Aprendizados Técnicos — teste que dubla erro de RPC copia
  frase e SQLSTATE verbatim; `RAISE EXCEPTION` sem `USING ERRCODE` chega como `P0001`);
  `docs/09_BACKLOG/features.md` (F022 sai de "Backlog" para "Em andamento", com o que falta);
  `docs/09_BACKLOG/plano_tecnico_comercializacao.md` (a nota que dizia "sem tela de renovação"
  estava factualmente errada a partir de hoje); `specs/f022-…md` §8 e §9.
- **Commit:** `6eedbd6` na branch `ciclo/f022-renovar-assinatura-console` (criada a partir da
  branch da Rodada 1, então carrega o commit dela; push feito, sem pull request).
- **Pendente de decisão:** estabelecimento de **cortesia** (`valor_mensal = 0`) não consegue
  renovar — a RPC recusa `p_valor <= 0` dentro do banco. Hoje cortesia só se sustenta empurrando
  `data_vencimento` na mão. Três saídas: (a) a RPC passa a aceitar zero com motivo obrigatório;
  (b) cortesia vira campo próprio na assinatura (`isento_ate`), sem passar por pagamento;
  (c) fica como está. Precisa da decisão do dono — é regra de negócio, não bug.
- **Também sem tela:** histórico de `assinaturas_pagamentos` (o dado é gravado, ninguém vê) e
  estorno de pagamento registrado por engano (só por SQL).
- **Ação do dono, com prazo:** a assinatura da própria GastroMundi vence em **2026-08-05** e
  bloqueia em **2026-08-09**. A tela desta rodada é o caminho para renovar — Console → Planos e
  assinaturas → "Registrar pagamento".
- **Próximo item recomendado:** **TD012** — `estoque.js` engole a exceção da baixa e mostra
  estimativa local como se fosse sucesso; com estoque real de cliente, uma baixa que falha em
  silêncio corrompe o inventário sem ninguém notar.

## Rodada 1 — D14-GUARD — 2026-08-01

- **Spec:** `specs/d14-guard-lpad-que-trunca.md`
- **Resultado da review:** aprovado sem ressalvas — 8 de 8 critérios em sim, `npm test` em
  180 de 180 arquivos e 2761 de 2761 testes, uma rodada de correção sem escalada.
- **Aprendido:** `memory/patterns.md` (padrão novo "Conferência textual de SQL: tirar comentário
  antes, e proibir a forma, não a palavra"), `memory/learnings.md` (duas linhas em Aprendizados
  Técnicos), `docs/09_BACKLOG/tech-debt.md` (TD014, resolvido), e o resultado da review anexado
  ao próprio spec.
- **Commit:** `5b08cf6` na branch `ciclo/d14-guard-lpad-que-trunca` (push feito, sem pull request).
- **Pendente de decisão:** nenhuma. Fica um registro: este ledger nasce depois do commit da
  rodada, então a Rodada 1 aparece nele como arquivo não versionado — entra no commit da Rodada 2.
- **Próximo item recomendado:** **F022-RENOVAR** — a assinatura da própria GastroMundi vence em
  2026-08-05 e bloqueia em 2026-08-09, e depois da `20260909` nenhuma tela do sistema consegue
  renovar assinatura nenhuma.
