# Templates — GastroMundi

## Objetivo
Documentar os templates de layout reutilizáveis do GastroMundi: estruturas de página que definem a disposição de regiões como sidebar, navbar, conteúdo principal e rodapé.

## Contexto
Templates são layouts de página que compõem organismos estruturais (Navbar, Sidebar) com uma área de conteúdo dinâmico. Eles garantem consistência visual entre páginas e centralizam mudanças de layout.

## Regras Gerais
- Templates não contêm dados de domínio — apenas estrutura e layout
- Páginas são renderizadas dentro de templates via slot/children
- Mudanças de layout afetam todas as páginas que usam o template — revisar impacto antes de alterar

## Validações
- Templates devem ser responsivos (mobile, tablet, desktop)
- Templates devem lidar com sidebar collapsed/expanded sem quebrar o layout

## Permissões
- Alterações em templates existentes exigem revisão visual em todas as páginas afetadas

## Exceções
- Páginas de autenticação usam template próprio (sem sidebar/navbar principal)
- Páginas de erro (404, 500) usam template minimalista

## Auditoria
- Mudanças de template devem ser testadas em múltiplos breakpoints

## Eventos
- N/A

## Configurações Futuras
- Suporte a temas (light/dark) no nível do template
- Template de impressão para relatórios

## Casos de Uso
- Criar nova página com layout consistente
- Mudar estrutura de layout globalmente

## Critérios de Aceite
- [ ] Todos os templates estão documentados com áreas de layout identificadas
- [ ] Templates são responsivos
- [ ] Props de configuração estão documentadas

---

## Inventário de Templates

### AppLayout (Principal)
- **Uso:** Todas as páginas internas do app
- **Estrutura:** Sidebar + Navbar + área de conteúdo principal
- **Props:** `children`
- **Responsividade:** Sidebar recolhe em mobile
- **Localização:** `src/templates/app-layout.tsx`

```
┌────────────────────────────────────┐
│              Navbar                 │
├──────────┬─────────────────────────┤
│          │                         │
│ Sidebar  │   Conteúdo (children)   │
│          │                         │
└──────────┴─────────────────────────┘
```

### AuthLayout
- **Uso:** Páginas de autenticação (/login, /register, /forgot-password)
- **Estrutura:** Logo + formulário centralizado + link de suporte
- **Props:** `children`, `title`, `subtitle`
- **Localização:** `src/templates/auth-layout.tsx`

```
┌────────────────────────────────────┐
│                                    │
│          Logo                      │
│    ┌─────────────────────┐         │
│    │   Formulário (slot) │         │
│    └─────────────────────┘         │
│          Links de suporte          │
│                                    │
└────────────────────────────────────┘
```

### OnboardingLayout
- **Uso:** Fluxo de onboarding
- **Estrutura:** Barra de progresso + conteúdo + navegação entre etapas
- **Props:** `children`, `currentStep`, `totalSteps`, `onBack`, `onNext`
- **Localização:** `src/templates/onboarding-layout.tsx`

### SettingsLayout
- **Uso:** Páginas de configurações
- **Estrutura:** AppLayout + nav lateral de settings
- **Props:** `children`, `currentSection`
- **Localização:** `src/templates/settings-layout.tsx`
