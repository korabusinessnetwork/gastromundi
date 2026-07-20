# 06 — COMPONENTES · {{PRODUTO}}

> Catálogo vivo de componentes UI em atomic design. Um lugar, uma versão.

## O que vive aqui

- **Atoms**: botão, campo de texto, label, checkbox, etc.
- **Molecules**: form, card, modal, toast, alert
- **Organisms**: tabela com paginação, navbar, sidebar, pedido-form
- **Templates**: layout de página, variações por contexto (mobile/desktop)
- **Estados**: default, loading, error, success, disabled
- **Acessibilidade**: ARIA labels, keyboard nav, contrast ratios
- **Testes**: snapshot, interação, a11y

## O que NÃO vive aqui

- Código real → `src/components/`
- Design tokens → `02_DESIGN_SYSTEM/`
- Regras de quando mostrar → `03_REGRAS_DE_NEGOCIO/`
- Fluxos de interação → `05_FLUXOS/`

## Arquivos sugeridos

- `atoms.md` — botão, input, label, icon, badge (+ screenshots)
- `molecules.md` — formgroup, card, modal, toast, badge-group
- `organisms.md` — tabela, navbar, sidebar, form complexa
- `templates.md` — página de listagem, página de detalhe, modal workflow
- `estados.md` — loading, error, success, disabled, focus
- `ACCESSIBILITY.md` — checklist: keyboard, screenreader, contrast

## Como preencher

1. **Design System primeiro**: componentes nascem em `02_DESIGN_SYSTEM/`
2. **Atomic design**: breaking up UI into atoms/molecules/organisms
3. **Código separado de design**: JSX em `src/`, documentação aqui
4. **Componentes reutilizáveis**: se aparecer 2x, é componente
5. **Teste = documentação**: teste é prova de que componente funciona
6. **White-label**: componentes não assumem tenant específico (tokens, sim)

## Ligações

- `02_DESIGN_SYSTEM/` — tokens, cores, tipografia
- `src/components/` — código real dos componentes
- CLAUDE.md — regra: CSS separado do JSX (decisão 018)
