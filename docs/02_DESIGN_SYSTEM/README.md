# Design System — Visão Geral — GastroMundi

## Objetivo
Documentar o sistema de design do GastroMundi: princípios, componentes, tokens, padrões visuais e regras de uso que garantem consistência na interface.

## Contexto
O design system de GastroMundi é construído sobre Tailwind CSS com tokens customizados. Ele é a fonte de verdade visual do produto — toda decisão de interface deve ser derivada daqui.

## Regras Gerais
- Nenhum valor de cor, espaçamento ou tipografia deve ser hardcoded — sempre usar tokens
- Componentes novos só entram no design system após validação visual e de acessibilidade
- O design system é documentado em `docs/02_DESIGN_SYSTEM/`; em código, os primitivos ficam em `components/ui/` e os componentes de domínio em `components/<dominio>/` (ver `COMPONENTES.md`)
- Toda alteração de token de alto impacto (ex: cor primária) deve ser validada em todos os componentes

## Validações
- Componentes devem passar por checklist de acessibilidade (contraste mínimo WCAG AA)
- Tokens devem ser nomeados semanticamente (ex: `color-primary`, não `color-blue-500`)

## Permissões
- Qualquer dev pode usar componentes existentes
- Adição de novos componentes ao design system exige revisão do designer ou tech lead
- Alteração de tokens globais exige aprovação e comunicação para toda a equipe

## Exceções
- Em protótipos marcados como `[POC]`, valores hardcoded são tolerados temporariamente
- Componentes one-off (uso único) podem ficar fora do design system com tag `[LOCAL]`

## Auditoria
- Changelog do design system deve ser mantido
- Revisão de acessibilidade: a cada nova versão relevante

## Eventos
- `design-system.token.updated` — token global alterado
- `design-system.component.added` — novo componente documentado
- `design-system.component.deprecated` — componente marcado como obsoleto

## Configurações Futuras
- Criar Storybook para documentação interativa de componentes
- Implementar tema escuro (dark mode)
- Exportar tokens como CSS custom properties e JSON para handoff de design

## Casos de Uso
- Implementação de novas telas
- Code review de componentes
- Handoff de design para desenvolvimento
- Onboarding visual de novos devs

## Critérios de Aceite
- [x] Paleta de cores definida (claro/escuro) em `CORES.md`
- [x] Tipografia definida em `TIPOGRAFIA.md`
- [x] Espaçamentos e layout definidos em `ESPACAMENTOS.md`
- [x] Iconografia definida em `ICONOGRAFIA.md`
- [x] Tokens transversais (raio/sombra/z-index/breakpoints) em `TOKENS.md`
- [x] Componentes inventariados em `COMPONENTES.md`
- [x] Movimento definido em `ANIMACOES.md`
- [x] Princípios de acessibilidade e identidade premium documentados

---

## Princípios (identidade premium)

Referências: **Apple, Linear, Stripe, Notion**. A interface da GastroMundi é:
1. **Calma e sóbria** — neutros graphite, um acento de marca preciso, sem ruído visual.
2. **Operacional** — leitura instantânea de status, números tabulares, áreas de toque generosas.
3. **Consistente** — a mesma situação tem sempre a mesma cor, ícone e padrão (entre módulos).
4. **Acessível** — WCAG AA, foco visível, status nunca só por cor.
5. **Rápida** — movimento sutil e curto que nunca atrasa a operação.
6. **Dark-first quando preciso** — tema escuro de primeira classe (cozinha/KDS, baixa luz).

## Índice

| Documento | Conteúdo |
|-----------|----------|
| [CORES.md](./CORES.md) | Paleta (claro/escuro), semântica e mapeamento de status do domínio |
| [TIPOGRAFIA.md](./TIPOGRAFIA.md) | Inter, escala, pesos, algarismos tabulares |
| [ESPACAMENTOS.md](./ESPACAMENTOS.md) | Grade 4px, áreas de toque, medidas de layout |
| [ICONOGRAFIA.md](./ICONOGRAFIA.md) | Lucide, tamanhos, mapeamento por módulo/ação |
| [TOKENS.md](./TOKENS.md) | Raios, sombras, breakpoints, z-index, opacidades |
| [COMPONENTES.md](./COMPONENTES.md) | Primitivos, compostos e componentes de domínio (PDV) |
| [ANIMACOES.md](./ANIMACOES.md) | Durações, easing, padrões de movimento, reduced-motion |
