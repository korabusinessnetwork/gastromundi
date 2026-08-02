# Aprendizados do Projeto GastroMundi

## Objetivo
Registrar aprendizados obtidos ao longo do projeto — erros cometidos, surpresas, insights e lições que a equipe não quer repetir ou quer replicar. É a memória viva do que funcionou e do que não funcionou.

## Contexto
Aprendizados não documentados se perdem. Este arquivo captura o conhecimento tácito que normalmente fica na cabeça das pessoas e some quando elas saem da equipe.

## Regras Gerais
- Qualquer membro da equipe pode (e deve) registrar aprendizados
- Aprendizados negativos (erros, falhas) devem ser registrados sem julgamento ou culpa
- Aprendizados que geram padrão devem ser movidos para `memory/patterns.md`

## Validações
- Aprendizados técnicos críticos devem ser validados por, no mínimo, um segundo membro
- Aprendizados relacionados a incidentes devem referenciar o post-mortem correspondente

## Permissões
- Todos os membros da equipe têm permissão de leitura e escrita neste arquivo

## Exceções
- Aprendizados que envolvam dados sensíveis de usuários devem ser anonimizados antes do registro

## Auditoria
- Data e autor de cada aprendizado devem ser registrados
- Revisão periódica recomendada: ao final de cada sprint ou ciclo

## Eventos
- `learning.added` — novo aprendizado registrado
- `learning.promoted` — aprendizado elevado a padrão oficial

## Configurações Futuras
- Criar ritual de retrospectiva com base neste arquivo
- Integrar aprendizados ao processo de onboarding

## Casos de Uso
- Retrospectivas de sprint
- Onboarding de novos membros
- Análise pós-incidente
- Planejamento de arquitetura futura

## Critérios de Aceite
- [ ] Cada aprendizado tem data, autor, contexto e lição clara
- [ ] Aprendizados estão categorizados por área
- [ ] Aprendizados promovidos a padrões estão referenciados

---

> Este arquivo é uma memória viva: a maioria dos aprendizados surge ao longo da execução. As entradas abaixo registram aprendizados da fase de fundação (Fase 0) e servem de modelo para os próximos.

## Aprendizados Técnicos

| Data | Aprendizado | Lição / Ação |
|------|-------------|--------------|
| 2026-06 | Isolar acesso ao Supabase em uma camada de serviços desde o início evita refatoração dolorosa depois. | Manter chamadas ao backend fora dos componentes (ver `memory/patterns.md` e decisão 007). |
| 2026-06 | RLS é poderoso, mas só protege se estiver ativo em **todas** as tabelas — uma tabela esquecida vira brecha. | Tratar RLS como requisito de definição de pronto para qualquer tabela nova. |
| 2026-08-01 | `src/lib/deliveryHorarioSqlGuard.test.js` proibia o token `lpad(` e **exigia** `'FM000'` no número do pedido do delivery. Como `to_char(n,'FM000')` não expande o gabarito (o que não cabe vira `###`), o guard obrigava a reintroduzir o bug D14 que ele existia para impedir: corrigir a migration deixou a suíte vermelha. | Guard de SQL proíbe a **forma** defeituosa (`lpad(x, 3, '0')`), nunca a palavra — e prova a regex nos dois lados, com um caso que ela deve pegar e um que ela não pode pegar. Ver `memory/patterns.md` → "Conferência textual de SQL". |
| 2026-08-01 | `ConfirmarRenovacaoModal.test.jsx` e `PlanosDashboard.test.jsx` diziam reproduzir "as recusas reais" da RPC `confirmar_renovacao_assinatura`, mas as frases eram inventadas e o código era `P0002`. Como o modal só repassa `error.message` sem interpretar, a suíte ficou verde documentando uma tela que ninguém nunca veria. | Teste que dubla erro de RPC copia a frase **e** o SQLSTATE verbatim da migration — mock inventado passa sempre e não prova nada. E `RAISE EXCEPTION` sem `USING ERRCODE` chega como **`P0001`** (`raise_exception`): só quem declara `ERRCODE` devolve `42501`/`23505`. |
| 2026-08-01 | O TD012 estava marcado como "engole a exceção" e já tinha sido metade consertado meses antes: a falha era desfeita na tela, mandada ao Sentry, ao `jarvas_eventos` e ao `activity_log`. Três destinos, e nenhum deles é uma tela que o dono de restaurante abre — o furo de inventário continuava invisível para a única pessoa que podia agir. | Reportar não é alertar. Antes de fechar qualquer item de "falha silenciosa", perguntar **em qual tela do usuário isso aparece** — se a resposta é Sentry, tabela de evento ou log, o item não está feito. No GastroMundi a superfície do gestor é o painel do Jarvas (`jarvas_insights`). |
| 2026-08-01 | O teste em `estoque.test.js` afirmava `expect(quantidade).toBe(3)` com o comentário `// fallback calculado localmente` — ou seja, prendia por escrito o saldo inventado que era o próprio TD012. Verde há meses. | Item de débito velho: ler o teste do trecho antes de concluir que o defeito sumiu. Um teste pode estar guardando o bug em vez do comportamento, e a suíte verde não distingue os dois. |
| 2026-08-01 | A âncora `/'FM000'/` continuou passando na migration `20260907` depois do conserto — casava o comentário em português que explica a fórmula removida, não o código. Mesmo falso positivo que já tinha aparecido em `20260909` sobre `pg_get_functiondef()`. | Toda conferência textual de SQL corta comentário antes: `linha.replace(/--.*$/, "")` em JS, `regexp_replace(v_def, '--.*', '', 'gn')` em PL/pgSQL. Aconteceu duas vezes — virou padrão, não é coincidência. |
| 2026-08-01 | `salvarBrandingCache` carimba o cache com `resolverSlugTenant()` (`brandingCache.js:91`) — o slug da **origem**, não o da tela. Enquanto não há subdomínio por estabelecimento, isso é sempre `gastromundi`. Uma prévia da Casa Coffee que gravasse o cache faria a marca dela ser pintada na tela de login de todo mundo que abre a mesma origem. | Cache carimbado por origem só pode ser escrito por tela que **é** daquela origem. Toda tela que renderiza a marca de outro estabelecimento (prévia, console, demonstração) não lê nem grava o cache — ler pinta a marca errada no primeiro quadro, gravar vaza a marca para o vizinho. Ver `memory/patterns.md` → "Superfície pública endereçada por slug". |

| 2026-08-01 | A linha do F022 em `docs/09_BACKLOG/features.md` dizia, em nota, que "RLS por tenant precisa de override `OR auth.is_super_admin()`". A ADR-008 (§5 e decisão v2 nº 2) diz o contrário para tabela operacional: o ramo só existe em `tenants` e `assinaturas`. Quem fosse construir o analytics lendo o backlog iria direto alterar a policy de `vendas` e abrir a base inteira de todos os clientes a qualquer token de plataforma. | Nota de backlog envelhece e não é revisada quando a ADR muda. Antes de implementar um item, a fonte é a ADR — o backlog diz **o que** falta, nunca **como** se faz. A nota do F022 foi corrigida nesta rodada; a regra virou padrão em `memory/patterns.md` → "O Console lê a operação por agregado, nunca por policy". |
| 2026-08-01 | O bloco `DO $conf$` das migrations foi tratado até aqui como a proteção da RPC. Ele só vale no banco onde a migration já rodou — e desaparece junto com a função no primeiro `CREATE OR REPLACE`. Para a `analytics_plataforma`, o que precisa sobreviver é textual: a assinatura de retorno não pode ganhar coluna que identifique venda. | RPC cuja **forma** é a garantia de segurança (assinatura de retorno, ordem da guarda, `REVOKE` antes do `GRANT`) nasce com os dois: o autoteste em SQL, que falha alto no banco, e o `*SqlGuard.test.js`, que falha na suíte de quem editar o arquivo. Já são 9 guards; o padrão é esse. |
| 2026-08-01 | `estornoPagamentoSqlGuard.test.js` procurava `p_tenant_id`, `DELETE FROM public.assinaturas_pagamentos` e `TRUNCATE` no texto **inteiro** da `20260913` — e achou os três dentro do próprio `DO $conf$`, que cita essas palavras nos `LIKE` da conferência. O guarda acusou o vigia como se fosse o infrator: 3 falhas em código correto. | Guard textual proíbe só no que **é** a migration: `const migracao = sql.slice(0, sql.indexOf("DO $conf$"))`. O bloco de conferência necessariamente cita o que proíbe — varrer o arquivo todo garante falso positivo. Ver `memory/patterns.md` → "Conferência textual de SQL". |
| 2026-08-01 | No mesmo guard, `/FOR (INSERT\|UPDATE\|DELETE)/i` (para provar que nenhuma policy de escrita nasceu) casou o `... FOR UPDATE` dos locks de linha da própria RPC — a regex do jargão de policy é subconjunto do jargão de lock. E `recorte(cliente, ..., "}\n")` devolveu −1: os fontes deste repositório são gravados com **CRLF**, então âncora com `"\n"` nunca casa. | Para provar ausência de policy, ancore no que só a policy tem (`GRANT ... ON TABLE`, `CREATE POLICY`), nunca em `FOR <verbo>`. E todo `readFileSync` de guard normaliza antes de ancorar: `.replace(/\r/g, "")`. |

| 2026-08-01 | `AssinaturaBanner.jsx` declarava `const DIAS_AVISO_PRE_VENCIMENTO = 5` no próprio componente, e `rotuloCompetencia` morava dentro de `ConfirmarRenovacaoModal.jsx` (Console). A aba nova do estabelecimento precisava dos dois: copiar o `5` deixaria banner e aba discordando na primeira vez que alguém mudasse a janela ("está em dia" com o banner avisando que vence), e importar do Console amarraria a tela do tenant à superfície da plataforma que a decisão 027 mantém separada. | Constante de regra e função pura que **duas superfícies** leem moram em `src/lib` desde o começo — componente é dono de marcação, não de regra. O sintoma de que está no lugar errado é precisar importar um componente para reaproveitar uma linha. |
| 2026-08-01 | Na review da mesma aba, dois textos afirmavam o que a tela não sabia: com `tenant` ainda nulo no bootstrap ela escrevia "ainda não há uma assinatura cadastrada" (a frase que assusta justamente quem paga em dia), e sem resposta de `public.planos` caía no código cru `medio`. Pior: o teste que eu mesmo tinha escrito **ratificava** o jargão — `it("cai no código do plano…")` esperava `medio` na tela. | Antes de escrever frase categórica, perguntar "o dado que sustenta isso já chegou?". E teste de fallback descreve o que o usuário **deve** ler, não o que o código faz hoje — teste que congela o comportamento errado passa para sempre. Ver `memory/patterns.md` → "'Ainda não sei' nunca é dito como 'não existe'". |

## Aprendizados de Produto

| Data | Aprendizado | Lição / Ação |
|------|-------------|--------------|
| 2026-06 | A "página em branco" é o maior inimigo da documentação: estrutura vazia desmotiva preenchimento. | Entregar esqueletos opinativos (princípio de produto nº 1). |

## Aprendizados de Processo

| Data | Aprendizado | Lição / Ação |
|------|-------------|--------------|
| 2026-06 | Documentar a arquitetura **antes** de codar reduz retrabalho e alinha o time. | Manter abordagem document-first nas sprints de fundação. |
| 2026-06 | Conflitos entre instruções e a estrutura real do repositório devem ser resolvidos explicitamente, não assumidos. | Quando houver divergência entre o pedido e o que existe, registrar a decisão de mapeamento. |
| 2026-08-01 | A fila do dono dizia "preview clicável do cardápio — ✅ ENTREGUE (commit f9fc34f)" e o ledger da Rodada 3 recomendou o item dizendo que "não existe jeito de ver o cardápio como o cliente vê". As duas frases estavam erradas do mesmo jeito: o botão existia **e** abria o estabelecimento errado (a loja do fallback, para o dono de qualquer outro tenant). Marcar como entregue escondeu um furo de white-label por seis dias. | Antes de construir um item da fila, abrir o que já existe e ver **o que ele faz**, não se ele existe. "Entregue" e "não existe" são as duas respostas que dispensam o levantamento — e é exatamente aí que o defeito se esconde. Registro de entrega descreve o comportamento, não só o commit. |

## Aprendizados de Negócio

| Data | Aprendizado | Lição / Ação |
|------|-------------|--------------|
| 2026-06 | O valor central do GastroMundi (integração a partir da venda) precisa ser sentido cedo: o usuário tem que ver uma venda no PDV se propagar para caixa, estoque e relatórios. | Priorizar o "aha moment" da venda-fonte no MVP (PDV → Caixa → Pedidos). |
