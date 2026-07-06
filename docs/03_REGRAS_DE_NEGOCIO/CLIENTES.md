# Regras de Negócio — Clientes

## Objetivo
Manter o cadastro de clientes e seu histórico de compras, viabilizando vínculo de vendas, vendas fiado, atendimento de delivery e ações de relacionamento/fidelidade.

## Contexto
O cliente é opcionalmente vinculado a uma venda no PDV. Seu histórico é construído a partir das vendas (decisão 009) e serve de base para o Jarvas sugerir ações de relacionamento.

## Regras Gerais
- Cadastro contém: nome, contato (telefone/e-mail), documento (opcional) e endereço(s) para delivery.
- Vínculo de venda é **opcional**: a maioria das vendas de balcão é anônima.
- Vendas **fiado** exigem cliente identificado (vira conta a receber no Financeiro).
- O **histórico** agrega compras, ticket médio, frequência e itens preferidos.
- **Privacidade:** dados do cliente pertencem ao estabelecimento; isolamento multi-tenant absoluto (decisão 002) — um estabelecimento nunca vê clientes de outro.

## Validações
- Contato mínimo (telefone ou e-mail) para clientes de delivery/fiado.
- Documento, quando informado, deve ser válido e único por estabelecimento.
- Não permitir duplicidade óbvia (mesmo telefone/documento) — sugerir mesclagem.

## Permissões
| Ação | dono | gerente | caixa | atendente | cozinha |
|------|------|---------|-------|-----------|---------|
| Ver clientes | ✓ | ✓ | ✓ | ✓ | — |
| Criar/editar cliente | ✓ | ✓ | ✓ | ✓ | — |
| Excluir/mesclar cliente | ✓ | ✓ | — | — | — |
| Ver histórico financeiro do cliente | ✓ | ✓ | (parcial) | — | — |

## Exceções
- Exclusão de cliente com histórico é **anonimização** (preserva integridade de vendas/lançamentos), não remoção física.
- Cliente pode solicitar remoção de dados pessoais (LGPD) — tratado por anonimização.

## Auditoria
- Registrar criação/edição/mesclagem/anonimização com autor e data.

## Eventos Disparados
- `cliente.criado` · `cliente.atualizado` · `cliente.mesclado` · `cliente.anonimizado`

## Consome
- `venda.finalizada` (com cliente) → atualiza histórico/ticket médio.

## Configurações Futuras
- Programa de fidelidade/pontos, segmentação para campanhas, aniversários, consentimento e preferências de contato (LGPD).

## Casos de Uso
- Vincular um cliente recorrente à venda para construir histórico.
- Cadastrar cliente de delivery com endereço.
- Controlar venda fiado de um cliente identificado.

## Critérios de Aceite
- [x] Venda pode ser anônima ou vinculada a cliente
- [x] Fiado exige cliente identificado
- [ ] Histórico e ticket médio atualizados por venda (histórico de compras implementado; ticket médio/frequência agregados ainda não)
- [ ] Exclusão preserva integridade via anonimização (não implementado nesta fase — ver Estado da Implementação)
- [ ] Isolamento multi-tenant garantido (RLS) (não implementado — app real é single-tenant hoje, ver ADR-004)

## Estado da Implementação (F010, 2026-07-06)

Implementado:
- Tabela `public.clientes` (`supabase/migrations/20260713_clientes.sql`): nome, telefone, endereço, observações, `anonimizado`. RLS: leitura para qualquer autenticado; inserção/edição para garçom/caixa/gerente/admin; exclusão restrita a gerente/admin.
- Vínculo opcional `cliente_id` em `public.vendas` e `public.lancamentos` (mesma migração) — reaproveita o fiado já existente como conta a receber no Financeiro (decisão 016); **não** foi criado um segundo sistema de fiado.
- `src/lib/clientes.js`: `cadastrarCliente`, `atualizarCliente`, `listarClientes` (busca por nome/telefone), `buscarHistoricoCliente` (vendas + lançamentos de fiado do cliente), `registrarPagamentoFiado` (delega para `baixarConta` do Financeiro), `calcularSaldoDevedor` (função pura, testada).
- Cadastro rápido de cliente embutido no checkout do PDV (`ClienteFiadoSelector.jsx`): aparece quando o pagamento usa "fiado", busca por nome/telefone com um clique para cadastrar se não encontrar, e bloqueia a confirmação da venda até um cliente ser selecionado/cadastrado.
- `ClientesView.jsx`: lista com busca, cadastro rápido (modal), e detalhe do cliente com saldo de fiado em destaque ("quem deve, quanto"), lista de contas em aberto com ação "Registrar pagamento" (com confirmação inline) e histórico de vendas.
- Rota `/app/clientes`, permissão `clientes` (todos os papéis operacionais podem ver/criar/editar; exclusão/anonimização ficariam restritas a gerente/admin quando implementadas), entrada no Sidebar.

Não implementado nesta fase (ficam para uma iteração futura, se necessário):
- Documento do cliente, e-mail, mesclagem de cadastros duplicados.
- Exclusão/anonimização (LGPD) e os eventos `cliente.mesclado`/`cliente.anonimizado`.
- Ticket médio, frequência e itens preferidos agregados no histórico.
- Isolamento multi-tenant (não existe em nenhuma tabela do app real hoje — ver ADR-004).
- Evento `cliente.criado`/`cliente.atualizado` já são emitidos via Jarvas; os demais eventos do módulo ainda não.
