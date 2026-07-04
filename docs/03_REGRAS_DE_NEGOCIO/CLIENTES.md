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
- [ ] Venda pode ser anônima ou vinculada a cliente
- [ ] Fiado exige cliente identificado
- [ ] Histórico e ticket médio atualizados por venda
- [ ] Exclusão preserva integridade via anonimização
- [ ] Isolamento multi-tenant garantido (RLS)
