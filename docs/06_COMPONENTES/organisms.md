# Organismos — GastroMundi

## Objetivo
Documentar os componentes orgânicos do GastroMundi: seções complexas da interface que combinam moléculas e átomos, podendo ter conhecimento de domínio.

## Contexto
Organismos são componentes de nível mais alto que formam seções reconhecíveis da UI. Podem receber dados de domínio via props ou hooks, mas não devem fazer chamadas de API diretamente — isso é responsabilidade dos containers/páginas.

## Regras Gerais
- Organismos recebem dados via props (dados já resolvidos, não promessas)
- Podem usar hooks de UI local (ex: estado de modal aberto)
- Não fazem fetch diretamente — recebem callbacks de ação via props
- Organismos reutilizáveis ficam em `src/components/`

## Validações
- Props de dados devem ter tipos TypeScript precisos
- Estados de loading e erro devem ser tratados

## Permissões
- Qualquer dev pode usar organismos
- Organismos compartilhados passam por revisão antes de merge

## Exceções
- Organismos de página única (one-off) podem ficar dentro da pasta da página

## Auditoria
- Inventário revisado trimestralmente

## Eventos
- Organismos emitem callbacks para actions que afetam o domínio (ex: `onUserDeleted`)

## Configurações Futuras
- Documentar em Storybook com mock data
- Testes de integração com Testing Library

## Casos de Uso
- Construção de páginas complexas
- Reutilização de seções entre páginas

## Critérios de Aceite
- [ ] Props de dados estão tipadas
- [ ] Estados de loading e erro estão tratados
- [ ] Callbacks de ação estão documentados

---

## Inventário de Organismos

### Navbar
- **Responsabilidade:** Barra de navegação principal
- **Props:** `user`, `onLogout`, `currentPath`
- **Subcomponentes:** Logo, links de nav, UserMenu
- **Localização:** `src/components/layout/navbar.tsx`

### Sidebar
- **Responsabilidade:** Navegação lateral com itens de menu
- **Variantes:** collapsed (ícones), expanded (ícones + labels)
- **Props:** `items`, `currentPath`, `isCollapsed`, `onToggle`
- **Localização:** `src/components/layout/sidebar.tsx`

### DataTable
- **Responsabilidade:** Tabela com ordenação, filtro e paginação
- **Props:** `columns`, `data`, `isLoading`, `pagination`, `onSort`, `onFilter`
- **Localização:** `src/components/ui/data-table.tsx`

### UserMenu
- **Responsabilidade:** Menu dropdown do usuário logado (avatar + opções)
- **Props:** `user`, `onProfileClick`, `onSettingsClick`, `onLogout`
- **Localização:** `src/components/layout/user-menu.tsx`

### EmptyState
- **Responsabilidade:** Estado vazio de listas e seções
- **Props:** `icon`, `title`, `description`, `action`
- **Localização:** `src/components/ui/empty-state.tsx`

### PageHeader
- **Responsabilidade:** Cabeçalho de página com título, breadcrumb e ações
- **Props:** `title`, `subtitle`, `breadcrumbs`, `actions`
- **Localização:** `src/components/layout/page-header.tsx`

### Modal
- **Responsabilidade:** Container de modal com overlay, header, body e footer
- **Tamanhos:** `sm` | `md` | `lg` | `xl` | `fullscreen`
- **Props:** `isOpen`, `onClose`, `title`, `children`, `footer`, `size`
- **Localização:** `src/components/ui/modal.tsx`

### Toast / Notification
- **Responsabilidade:** Notificações temporárias no canto da tela
- **Variantes:** success, error, warning, info
- **Props:** gerenciado via hook `useToast()`
- **Localização:** `src/components/ui/toast.tsx`
