# Componentes — Visão Geral — GastroMundi

## Objetivo
Indexar e categorizar todos os componentes React do projeto GastroMundi seguindo a metodologia Atomic Design.

## Contexto
GastroMundi adota Atomic Design como modelo mental (átomos → moléculas → organismos → páginas).
Na árvore de pastas isso é aplicado com um **critério híbrido — tipo + domínio**: o que é
compartilhado entre telas mora em pastas por TIPO dentro de `src/components/ui/`; o que serve
a uma feature só mora na pasta do DOMÍNIO, com subpastas por tipo quando há volume.
O objetivo é orientação rápida: o caminho do arquivo já diz o que ele é e a quem serve.

## Regras Gerais
- Componente reutilizado por mais de um domínio → `src/components/ui/<tipo>/`
  (`botoes/`, `cards/`, `campos/`, `paineis/`, `listas/`, `feedback/`, `marca/`, `pontes/`)
- Componente que só serve a uma feature → `src/components/<dominio>/`
  (`pdv/`, `caixa/`, `fiscal/`, `delivery/`, `financeiro/`, `estoque/`, `produtos/`,
  `clientes/`, `cozinha/`, `admin/`, `configuracoes/`, `relatorios/`, `mesas/`,
  `impressao/`, `assinatura/`, `navegacao/`, `console/`)
- Dentro do domínio, subpasta por tipo assim que houver mais de um arquivo do mesmo tipo:
  `modais/`, `paineis/`, `cards/`, `campos/`, `listas/`, `grades/`, `botoes/`, `hooks/`
- Páginas roteadas ficam em `src/pages/` (uma pasta por superfície: `desktop/`, `mobile/`,
  `console/`, `apex/`, `delivery/`, `login/`)
- Regras de negócio e acesso a dados ficam em `src/lib/<dominio>/`, nunca dentro do componente
- CSS fica co-localizado com o componente (decisão 018): `Componente.jsx` + `Componente.css`
  + `Componente.test.jsx` andam sempre juntos
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
│   ├── ui/            # compartilhado entre telas, agrupado por TIPO
│   │   ├── campos/    · feedback/ · listas/ · marca/ · paineis/ · pontes/
│   │   └── botoes/    · cards/    (reservados — ainda sem primitivo comum)
│   └── <dominio>/     # serve a uma feature só (pdv/, caixa/, fiscal/, …)
│       └── <tipo>/    # subpasta por tipo quando há volume:
│                      #   modais/ paineis/ cards/ campos/ listas/ grades/ botoes/ hooks/
├── pages/             # páginas roteadas, uma pasta por superfície
│   ├── desktop/ · mobile/ · console/ · apex/ · delivery/ · login/
├── layouts/           # cascas de página (equivalente a "templates" no Atomic Design)
├── lib/<dominio>/     # regras de negócio e acesso a dados
├── context/ · hooks/ · routes/ · constants/ · styles/ · utils/
```

Mapa de orientação completo (componentes + lib): [`src/LEIAME.md`](../../src/LEIAME.md).
