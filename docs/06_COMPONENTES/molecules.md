# Moléculas — GastroMundi

## Objetivo
Documentar os componentes moleculares do GastroMundi: composições simples de átomos que formam unidades funcionais com propósito específico.

## Contexto
Moléculas combinam átomos para criar padrões de UI recorrentes. Podem ter lógica de interação local (ex: campo de busca com clear button), mas não devem conhecer o domínio da aplicação.

## Regras Gerais
- Moléculas podem importar apenas átomos e outros utilitários de UI
- Não devem fazer chamadas de API diretamente
- Devem ser compostas e configuráveis via props
- Acessibilidade deve ser mantida na composição

## Validações
- Props de composição devem ser documentadas
- Comportamentos de interação devem ser testados

## Permissões
- Qualquer dev pode usar moléculas existentes
- Promoção de componente local a molécula do design system exige revisão

## Exceções
- Moléculas de formulário podem ter validação local (Zod/react-hook-form)

## Auditoria
- Inventário revisado trimestralmente

## Eventos
- N/A — moléculas emitem callbacks via props, não eventos de domínio

## Configurações Futuras
- Documentar em Storybook com casos de uso reais
- Criar testes de integração de interações

## Casos de Uso
- Construção de formulários, listas, cards e padrões de navegação

## Critérios de Aceite
- [ ] Cada molécula tem props documentadas e uso típico descrito
- [ ] Composição de átomos está clara
- [ ] Acessibilidade da composição está validada

---

## Inventário de Moléculas

### FormField
- **Composição:** Label + Input + mensagem de erro
- **Props:** `label`, `name`, `error`, `required`, ...props do Input
- **Uso:** Campos de formulário com label e feedback de erro integrados
- **Localização:** `src/components/ui/form-field.tsx`

### SearchInput
- **Composição:** Input + ícone de busca + botão de limpar
- **Props:** `value`, `onChange`, `onClear`, `placeholder`
- **Uso:** Campos de busca em listas e tabelas
- **Localização:** `src/components/ui/search-input.tsx`

### UserAvatar
- **Composição:** Avatar + nome + papel/cargo
- **Variantes:** horizontal (avatar + texto), vertical (avatar sobre texto)
- **Props:** `user: { name, avatarUrl, role }`, `variant`, `size`
- **Localização:** `src/components/user-avatar.tsx`

### StatCard
- **Composição:** Label + valor numérico + indicador de tendência
- **Props:** `label`, `value`, `trend`, `trendDirection`
- **Uso:** Dashboards e resumos de métricas
- **Localização:** `src/components/ui/stat-card.tsx`

### AlertBanner
- **Composição:** Ícone + mensagem + ação opcional
- **Variantes:** info, success, warning, danger
- **Props:** `variant`, `title`, `message`, `action`
- **Localização:** `src/components/ui/alert-banner.tsx`

### ConfirmDialog
- **Composição:** Modal + título + descrição + botões Confirmar/Cancelar
- **Props:** `isOpen`, `onClose`, `onConfirm`, `title`, `description`, `confirmLabel`, `variant`
- **Uso:** Confirmar ações destrutivas
- **Localização:** `src/components/ui/confirm-dialog.tsx`

### Pagination
- **Composição:** botões anterior/próximo + indicador de página + select de itens por página
- **Props:** `page`, `totalPages`, `onPageChange`, `pageSize`, `onPageSizeChange`
- **Localização:** `src/components/ui/pagination.tsx`
