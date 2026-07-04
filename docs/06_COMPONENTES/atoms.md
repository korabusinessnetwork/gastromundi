# Átomos — GastroMundi

## Objetivo
Documentar todos os componentes atômicos do GastroMundi: os elementos de UI mais básicos e indivisíveis que servem de base para todos os demais componentes.

## Contexto
Átomos são os blocos de construção fundamentais da interface. Não têm dependências de domínio ou lógica de negócio. Correspondem a elementos HTML aprimorados com estilo e comportamento consistentes.

## Regras Gerais
- Átomos não importam componentes de nível maior (sem moléculas, organismos, etc.)
- Átomos não fazem chamadas de API ou leem estado de domínio
- Todas as variantes visuais são controladas por props
- Acessibilidade é obrigatória em todos os átomos

## Validações
- Props obrigatórias devem ser tipadas e ter valor padrão quando possível
- Átomos devem funcionar corretamente com e sem conteúdo (empty states)

## Permissões
- Qualquer dev pode usar átomos
- Adição de novo átomo ao design system exige revisão

## Exceções
- Átomos de ícone seguem regras separadas (biblioteca de ícones dedicada)

## Auditoria
- Inventário revisado trimestralmente

## Eventos
- N/A

## Configurações Futuras
- Documentar em Storybook com todas as variantes
- Adicionar testes de acessibilidade automatizados

## Casos de Uso
- Base de toda a interface do GastroMundi

## Critérios de Aceite
- [ ] Cada átomo tem props documentadas
- [ ] Variantes estão listadas
- [ ] Estados estão documentados (default, hover, focus, disabled, loading, error)

---

## Inventário de Átomos

### Button
- **Variantes:** `primary` | `secondary` | `ghost` | `destructive` | `link`
- **Tamanhos:** `sm` | `md` | `lg` | `icon`
- **Estados:** default, hover, focus, loading, disabled
- **Props:** `variant`, `size`, `isLoading`, `leftIcon`, `rightIcon`, `onClick`, `disabled`
- **Localização:** `src/components/ui/button.tsx`

### Input
- **Variantes:** default, error, success
- **Estados:** default, focus, disabled, readonly, error
- **Props:** `type`, `placeholder`, `value`, `onChange`, `error`, `disabled`, `required`
- **Localização:** `src/components/ui/input.tsx`

### Textarea
- **Estados:** default, focus, disabled, error
- **Props:** `placeholder`, `value`, `onChange`, `rows`, `error`, `disabled`
- **Localização:** `src/components/ui/textarea.tsx`

### Label
- **Variantes:** default, required
- **Props:** `htmlFor`, `required`, `children`
- **Localização:** `src/components/ui/label.tsx`

### Badge
- **Variantes:** `default` | `success` | `warning` | `danger` | `info` | `outline`
- **Props:** `variant`, `children`
- **Localização:** `src/components/ui/badge.tsx`

### Avatar
- **Tamanhos:** `xs` | `sm` | `md` | `lg` | `xl`
- **Fallback:** iniciais do nome quando sem imagem
- **Props:** `src`, `alt`, `name`, `size`
- **Localização:** `src/components/ui/avatar.tsx`

### Spinner
- **Tamanhos:** `sm` | `md` | `lg`
- **Props:** `size`, `className`
- **Localização:** `src/components/ui/spinner.tsx`

### Divider
- **Variantes:** horizontal, vertical
- **Props:** `orientation`, `label`
- **Localização:** `src/components/ui/divider.tsx`

### Checkbox
- **Estados:** unchecked, checked, indeterminate, disabled
- **Props:** `checked`, `onChange`, `disabled`, `label`
- **Localização:** `src/components/ui/checkbox.tsx`

### Toggle (Switch)
- **Estados:** off, on, disabled
- **Props:** `checked`, `onChange`, `disabled`, `label`
- **Localização:** `src/components/ui/switch.tsx`
