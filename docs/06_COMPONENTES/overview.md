# Componentes — Visão Geral — GastroMundi

## Objetivo
Indexar e categorizar todos os componentes React do projeto GastroMundi seguindo a metodologia Atomic Design.

## Contexto
GastroMundi adota Atomic Design como modelo mental para organização de componentes: átomos → moléculas → organismos → templates → páginas. Isso facilita reúso, teste e manutenção.

## Regras Gerais
- Componentes de UI pura ficam em `src/components/ui/` (átomos e moléculas)
- Componentes com lógica de domínio ficam em `src/components/` (organismos)
- Templates ficam em `src/templates/`
- Páginas ficam em `src/pages/`
- Nenhum componente de UI deve importar diretamente do Supabase — isso é responsabilidade de hooks ou containers

## Validações
- Componentes não devem ter side effects não documentados
- Props obrigatórias devem ser tipadas e documentadas

## Permissões
- Qualquer dev pode criar componentes locais
- Componentes candidatos ao design system passam por revisão antes de serem promovidos

## Exceções
- Componentes de página podem importar diretamente de hooks de dados

## Auditoria
- Inventário de componentes deve ser revisado trimestralmente para remoção de orphans

## Eventos
- N/A — componentes não disparam eventos de negócio diretamente

## Configurações Futuras
- Storybook para documentação visual de componentes
- Testes de snapshot para componentes críticos
- Testes de acessibilidade automatizados (axe-core)

## Casos de Uso
- Implementação de novas telas
- Code review
- Refatoração de UI
- Onboarding de devs frontend

## Critérios de Aceite
- [ ] Estrutura de pastas segue Atomic Design
- [ ] Componentes de UI não têm dependência de domínio
- [ ] Props estão tipadas em TypeScript

---

## Índice

| Nível | Arquivo | Descrição |
|-------|---------|-----------|
| Átomos | [atoms.md](./atoms.md) | Elementos básicos indivisíveis |
| Moléculas | [molecules.md](./molecules.md) | Composições simples de átomos |
| Organismos | [organisms.md](./organisms.md) | Seções complexas da interface |
| Templates | [templates.md](./templates.md) | Layouts de página reutilizáveis |

## Estrutura de Pastas

```
src/
├── components/
│   ├── ui/          # Átomos e moléculas (design system)
│   └── [domínio]/   # Organismos com lógica de negócio
├── templates/       # Layouts de página
└── pages/           # Páginas completas (roteadas)
```
