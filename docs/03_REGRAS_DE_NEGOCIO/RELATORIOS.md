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
- [ ] Métricas reconciliam com os módulos-fonte
- [ ] Filtros de período/fuso aplicados corretamente
- [ ] Estados vazios tratados explicitamente
- [ ] Acesso a relatórios financeiros restrito por papel
