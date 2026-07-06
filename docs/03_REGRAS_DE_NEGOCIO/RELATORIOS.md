# Regras de Negócio — Relatórios

## Objetivo
Transformar os eventos da operação em visão de negócio: vendas, produtos, margem, caixa e desempenho — para que o dono decida com dado confiável e na hora certa.

## Contexto
Relatórios consolidam os eventos de todos os módulos (decisão 009): vendas, pagamentos, estoque e financeiro. É a camada de leitura/análise — não altera dados, apenas agrega. Alimenta também o Jarvas com séries históricas.

## Regras Gerais
- Relatórios são **somente leitura**; refletem os dados-fonte (não recalculam regra de negócio à parte).
- Conjuntos principais: **Vendas** (por período, forma de pagamento, canal), **Produtos** (mais/menos vendidos, curva ABC), **Margem** (receita − custo), **Caixa** (aberturas/divergências), **Financeiro** (fluxo, contas).
- Toda métrica respeita o **período** selecionado e o **fuso** do estabelecimento.
- Indicadores monetários usam algarismos tabulares (ver `02_DESIGN_SYSTEM/TIPOGRAFIA.md`).
- Multi-tenant: cada estabelecimento vê apenas seus próprios dados (decisão 002).

## Validações
- Totais de relatório reconciliam com os módulos-fonte (ex.: total de vendas = soma das `venda.finalizada` do período).
- Períodos sem dados retornam estado vazio explícito, não zero ambíguo.

## Permissões
| Ação | dono | gerente | caixa | atendente | cozinha |
|------|------|---------|-------|-----------|---------|
| Relatórios operacionais (vendas/produtos) | ✓ | ✓ | (parcial) | — | — |
| Relatórios financeiros/margem | ✓ | (parcial) | — | — | — |
| Exportar relatórios | ✓ | ✓ | — | — | — |

## Exceções
- Dados em processamento podem exibir aviso de "parcial/atualizando" em vez de número incompleto.

## Auditoria
- Registrar exportações (quem, quando, qual relatório/período).

## Eventos Disparados
- `relatorio.exportado`

## Consome
- `venda.finalizada`, `pagamento.aprovado`, `pedido.*`, `estoque.*`, `financeiro.*`, `caixa.*` → agregações.

## Configurações Futuras
- Dashboards personalizáveis, comparativos entre períodos/lojas, metas e acompanhamento, agendamento de envio por e-mail.

## Casos de Uso
- Ver o faturamento e os produtos mais vendidos da semana.
- Conferir a margem por categoria.
- Exportar o relatório de vendas do mês.

## Critérios de Aceite
- [x] Métricas reconciliam com os módulos-fonte (agregação via RPC direto em `vendas`/`venda_itens`/`venda_pagamentos`, sem recálculo em separado)
- [x] Filtros de período aplicados corretamente (dia/7 dias/30 dias/intervalo customizado) — fuso não tratado nesta fase (single-tenant, fuso único do estabelecimento)
- [x] Estados vazios tratados explicitamente (vazio, carregando e erro diferenciados na tela)
- [x] Acesso a relatórios financeiros/margem restrito por papel (aba "Desempenho" só para gerente/admin, mesmo padrão de Logs/Credenciais)

## Estado da Implementação (F011, 2026-07-06)

Implementado:
- RPC `public.relatorio_vendas(p_inicio, p_fim, p_limite_produtos)` (`supabase/migrations/20260714_relatorio_vendas.sql`): agrega faturamento, número de vendas, série diária, total por método de pagamento e top produtos por receita — tudo no Postgres, direto nas tabelas normalizadas (TD009), sem baixar o blob `sales`.
- `src/lib/relatorios.js` (+testes): `calcularPeriodo`/`calcularPeriodoAnterior` (dia/semana/mês + comparação com o período anterior), `calcularVariacaoPercentual`, `calcularMargemProdutos` (cruza o top de produtos com a ficha técnica cadastrada em `public.config`/`fichas_tecnicas`; sem ficha, sinaliza `semCusto: true` em vez de inventar número), `buscarRelatorioVendas`/`buscarFichasTecnicas`.
- Nova aba "Desempenho" em `RelatorioView.jsx` (`src/components/desktop/views/relatorio/DesempenhoReport.jsx` + `.css` co-localizado, decisão 018): KPIs (faturamento, vendas, ticket médio) com variação % vs. período anterior opcional, gráfico de vendas por dia, faturamento por forma de pagamento e tabela de produtos mais vendidos com margem (ou aviso "sem custo cadastrado").
- Gráficos implementados em CSS/SVG simples (barras), sem nova dependência — não havia biblioteca de gráficos no projeto e o bundle já é grande (~1.7 MB); as visualizações pedidas (barras por dia, por método, por produto) não justificam o custo de uma lib nova (regra de Custo do CLAUDE.md).
- Restrição de acesso: aba "Desempenho" (que inclui margem) restrita a gerente/admin, mesmo padrão já usado nas abas Logs/Credenciais.

Não implementado nesta fase:
- Margem por categoria agregada (curva ABC completa); hoje é por produto individual.
- Relatório de Caixa (aberturas/divergências) dedicado — já existe parcialmente na aba "Fechamentos" existente, não recriado aqui.
- Exportação (PDF/Excel) do novo relatório de Desempenho — as abas antigas (Vendas/Cancelamentos/Fechamentos/Logs) já exportam; a nova aba ainda não tem os botões de exportar.
- Evento `relatorio.exportado` e fuso horário configurável por estabelecimento (não existe conceito de fuso configurável no app real hoje).
