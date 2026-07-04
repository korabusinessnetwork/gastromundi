# Regras de Negócio — Jarvas (IA transversal)

## Objetivo
Observar tudo o que acontece na operação, identificar padrões, gerar **insights, alertas e sugestões de ação** — sempre acionáveis e sem atrapalhar a operação.

## Contexto
Jarvas é uma **camada transversal de IA** (decisão 010), não um módulo isolado nem um chatbot genérico. Ele consome os eventos de todos os módulos via Event Bus (decisão 004) e devolve inteligência. Princípio de identidade: "a IA trabalha nos bastidores" e "insight só vale se vier com uma sugestão de ação".

## Regras Gerais
- Jarvas **observa** eventos (vendas, caixa, estoque, financeiro, pedidos) e produz três tipos de saída:
  - **Insight** — leitura do negócio (ex.: "produto X cresceu 30% nesta semana").
  - **Alerta** — algo que exige atenção (ex.: ruptura iminente, divergência de caixa recorrente).
  - **Sugestão** — próxima ação recomendada (ex.: "repor insumo Y", "rever preço de Z").
- Toda saída é **acionável**: traz contexto, severidade e, quando possível, uma ação de um toque.
- Jarvas **não executa ações sozinho** por padrão — ele sugere; a execução exige confirmação humana (autonomia é roadmap e configurável).
- Severidade segue a semântica de cores (`info`/`warning`/`danger`) do Design System.
- Respeita multi-tenant: só analisa dados do próprio estabelecimento (decisão 002).

## Validações
- Insight/alerta sempre referencia os dados/eventos que o originaram (rastreabilidade).
- Sugestão sem ação clara não é exibida (evita "encher de gráfico").
- Não inventar números: toda métrica vem dos módulos-fonte/Relatórios.

## Permissões
| Ação | dono | gerente | caixa | atendente | cozinha |
|------|------|---------|-------|-----------|---------|
| Ver insights/alertas | ✓ | ✓ | (operacionais) | (operacionais) | (operacionais) |
| Ver sugestões estratégicas/financeiras | ✓ | (parcial) | — | — | — |
| Configurar/ativar automações | ✓ | (parcial) | — | — | — |

## Exceções
- Em automações habilitadas (roadmap), ações sensíveis (preço, financeiro) sempre exigem confirmação humana.
- Falha do Jarvas **nunca** pode bloquear a operação — degradação graciosa (sem insight é melhor que travar).

## Auditoria
- Registrar cada insight/alerta/sugestão gerado (origem, severidade, data) e ações tomadas a partir deles.

## Eventos Disparados
- `jarvas.insight.gerado` · `jarvas.alerta.gerado` · `jarvas.sugestao.gerada`
- `jarvas.acao.executada` (quando automação confirmada)

## Consome
- Praticamente todos: `venda.*`, `pagamento.*`, `pedido.*`, `caixa.*`, `estoque.*`, `financeiro.*`, `cliente.*`.

## Configurações Futuras
- Automações com confirmação, previsões (demanda, ruptura, faturamento), assistente conversacional sobre os dados, recomendações de precificação e compras.

## Casos de Uso
- Alertar o dono sobre ruptura iminente de um insumo e sugerir reposição.
- Identificar queda de vendas em um horário e sugerir ação.
- Apontar divergências de caixa recorrentes de um operador.

## Critérios de Aceite
- [ ] Toda saída é acionável e rastreável aos dados-fonte
- [ ] Severidade segue a semântica de cores do Design System
- [ ] Jarvas não executa ações sensíveis sem confirmação
- [ ] Falha do Jarvas não bloqueia a operação
- [ ] Isolamento multi-tenant respeitado (roadmap — app atual é single-tenant por instância, ver ADR-004)

## Estado da Implementação

| Fase | Descrição | Status |
|------|-----------|--------|
| 1 | Infraestrutura: tabelas `jarvas_eventos` + `jarvas_insights` (`supabase/migrations/20260703_jarvas.sql`) e serviço `src/lib/jarvas.js` (emitirEvento fire-and-forget, registrarInsight, buscarInsights, atualizarStatusInsight). RLS: eventos por qualquer logado; insights estratégicos só gerente/admin | ✅ 2026-07-03 |
| 2 | Instrumentar módulos com `emitirEvento`: `pedido.aberto` e `pedido.cancelado` (pedidos), `venda.finalizada` (pdv), `caixa.aberto` e `caixa.fechado` (caixa), `estoque.ajustado` e `estoque.ajuste_em_lote` (estoque) — centralizado no `AppContext.jsx` + cancelamentos no `PDVView` | ✅ 2026-07-03 |
| 3 | Motor de regras (`src/lib/jarvasEngine.js`): ruptura/estoque baixo, divergência de caixa, produto em alta/queda (7d vs 7d), cancelamentos recorrentes por operador. Dedupe por `origem.chave`, throttle 6h, roda pós-login de gerente/admin (fire-and-forget no `AppContext`) | ✅ 2026-07-03 |
| 4 | UI: `src/components/shared/JarvasPanel.jsx` — sino flutuante com badge de não lidos + painel lateral no `DesktopLayout`; severidade por cor do Design System, ação de um toque (navega e marca `executado`), marcar lido/descartar com auditoria | ✅ 2026-07-03 |
| 5 | Previsões e assistente conversacional | Roadmap |
