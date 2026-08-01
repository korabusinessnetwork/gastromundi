# Ledger do ciclo

Uma seção por rodada, mais recente no topo. Escrito pelo passo 8 do `/ciclo`.

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
