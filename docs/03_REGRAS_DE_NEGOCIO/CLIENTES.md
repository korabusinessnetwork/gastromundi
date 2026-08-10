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
| Revelar o CPF completo do cliente | ✓ | ✓ | — | — | — |

## Exceções
- Exclusão de cliente com histórico é **anonimização** (preserva integridade de vendas/lançamentos), não remoção física.
- Cliente pode solicitar remoção de dados pessoais (LGPD) — tratado por anonimização.

## Documento do cliente (CPF/CNPJ) — LGPD
- O **CPF nunca é exibido por extenso por padrão**, nem na lista nem no cadastro: aparece como `***.982.247-**`, mantendo só o miolo para conferência de identidade. CPF com quantidade de dígitos inesperada é ocultado por inteiro.
- **CNPJ é mostrado completo** e sem botão de revelar: documento de empresa é público, ocultá-lo custaria usabilidade sem proteger ninguém.
- Só **gerente e admin** podem revelar o CPF completo — mesma régua de quem pode excluir/anonimizar, porque é quem responde pelo cadastro.
- Garçom e caixa **continuam com acesso ao cliente** (precisam para delivery e fiado), mas veem o documento sempre oculto. Por isso a permissão `clientes` em `roles.js` não foi restringida: o corte é no dado sensível, não no módulo.
- Na **lista** não existe botão de revelar — quem precisa do número completo abre o cadastro e clica em "Ver", e aí o acesso fica registrado.
- O **campo de edição** do documento continua legível (é o próprio operador digitando/corrigindo o dado).

## Auditoria
- Registrar criação/edição/mesclagem/anonimização com autor e data.
- Registrar também **leitura** de dado sensível: cada vez que alguém revela o CPF de um cliente, o acesso vira evento com autor e `cliente_id`. O documento em si **nunca** entra no log — só a informação de quem abriu o quê. Esconder de volta não gera registro (não é novo acesso).

## Eventos Disparados
- `cliente.criado` · `cliente.atualizado` · `cliente.mesclado` · `cliente.anonimizado` · `cliente.documento_visualizado`

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
- [x] Exclusão preserva integridade via anonimização
- [ ] Isolamento multi-tenant garantido (RLS) (não implementado — app real é single-tenant hoje, ver ADR-004)

## Estado da Implementação (F010, 2026-07-06)

Implementado:
- Tabela `public.clientes` (`supabase/migrations/20260713_clientes.sql`): nome, telefone, endereço, observações, `anonimizado`. RLS: leitura para qualquer autenticado; inserção/edição para garçom/caixa/gerente/admin; exclusão restrita a gerente/admin.
- Vínculo opcional `cliente_id` em `public.vendas` e `public.lancamentos` (mesma migração) — reaproveita o fiado já existente como conta a receber no Financeiro (decisão 016); **não** foi criado um segundo sistema de fiado.
- `src/lib/clientes.js`: `cadastrarCliente`, `atualizarCliente`, `listarClientes` (busca por nome/telefone), `buscarHistoricoCliente` (vendas + lançamentos de fiado do cliente), `registrarPagamentoFiado` (delega para `baixarConta` do Financeiro), `calcularSaldoDevedor` (função pura, testada), `anonimizarCliente` (exclusão por anonimização — apaga os dados pessoais, marca `anonimizado` e emite `cliente.anonimizado`).
- Telefone tem regra única em `src/lib/telefone.js` (máscara + validação DDD e 8/9 dígitos), aplicada no cadastro, na edição e no cadastro rápido do fiado; é gravado só em dígitos e formatado na exibição.
- Cadastro rápido de cliente embutido no checkout do PDV (`ClienteFiadoSelector.jsx`): aparece quando o pagamento usa "fiado", busca por nome/telefone com um clique para cadastrar se não encontrar, e bloqueia a confirmação da venda até um cliente ser selecionado/cadastrado.
- `ClientesView.jsx`: lista com busca, cadastro rápido (modal), e detalhe do cliente com saldo de fiado em destaque ("quem deve, quanto"), lista de contas em aberto com ação "Registrar pagamento" (com confirmação inline) e histórico de vendas.
- Exclusão de cliente no detalhe (`ClientesView.jsx`): botão "Excluir" em vermelho ao lado de "Editar", visível só para gerente/admin, atrás de uma confirmação que explica o que é apagado (telefone, documento, endereço, observações) e o que permanece (vendas e lançamentos). Cliente com fiado em aberto não pode ser excluído — a confirmação vira aviso e manda registrar o pagamento antes.
- Rota `/app/clientes`, permissão `clientes` (todos os papéis operacionais podem ver/criar/editar; exclusão/anonimização restritas a gerente/admin), entrada no Sidebar.
- Proteção do documento (LGPD): `ocultarDocumento` em `src/lib/documento.js` (função pura, testada) monta a máscara `***.982.247-**`; o componente compartilhado `src/components/shared/DocumentoProtegido.jsx` exibe o documento oculto e, só para gerente/admin no detalhe do cliente, oferece o botão "Ver"/"Ocultar"; `registrarAcessoDocumento` em `src/lib/clientes.js` emite `cliente.documento_visualizado` (fire-and-forget, só `cliente_id` + autor) a cada abertura.

Não implementado nesta fase (ficam para uma iteração futura, se necessário):
- E-mail do cliente e mesclagem de cadastros duplicados (evento `cliente.mesclado`).
- Ticket médio, frequência e itens preferidos agregados no histórico.
- Isolamento multi-tenant (não existe em nenhuma tabela do app real hoje — ver ADR-004).
- Eventos `cliente.criado`, `cliente.atualizado` e `cliente.anonimizado` já são emitidos via Jarvas; falta só `cliente.mesclado`.
