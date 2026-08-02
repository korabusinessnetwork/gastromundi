# Ledger do ciclo

Uma seção por rodada, mais recente no topo. Escrito pelo passo 8 do `/ciclo`.

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
