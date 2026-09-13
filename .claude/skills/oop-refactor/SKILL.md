---
name: oop-refactor
description: Revisar e refatorar código JavaScript/TypeScript aplicando princípios de orientação a objetos (encapsulamento, SOLID, padrões de projeto) com julgamento crítico sobre quando OOP ajuda e quando atrapalha. Use sempre que o usuário pedir revisão de código, refatoração, análise de arquitetura de componentes/módulos JS ou TS, mencionar "código bagunçado", "duplicação", "acoplamento", "SOLID", "design patterns", "classes vs funções", ou quando estiver revisando código de projetos React/Node antes de aprovar mudanças.
---

# OOP Refactor — Revisão e refatoração guiada por princípios (JS/TS)

Skill para revisar código JavaScript/TypeScript e propor refatorações fundamentadas em princípios de design — sem dogmatismo. O objetivo NUNCA é "deixar o código mais OOP"; é deixá-lo mais fácil de mudar com segurança. OOP é ferramenta, não meta.

## Filosofia central (leia antes de qualquer análise)

1. **Composição > herança.** Em JS/TS moderno, herança de classe é quase sempre a resposta errada. Hierarquias profundas (>2 níveis) são um code smell por si só. Prefira: funções que recebem dependências, objetos compostos, interfaces (TS) como contratos.
2. **Núcleo funcional, casca imperativa.** Lógica de negócio pura (funções sem efeito colateral, fáceis de testar) no centro; I/O, estado e efeitos (fetch, banco, DOM) nas bordas. Muitos "problemas de OOP" somem quando a lógica pura é extraída.
3. **Encapsulamento é o princípio que mais paga em JS/TS.** Esconder representação interna atrás de uma interface pequena vale mais que classes, herança e polimorfismo juntos. Um módulo com funções exportadas e estado privado no closure JÁ É encapsulamento.
4. **Duplicação é mais barata que a abstração errada.** Não unifique dois trechos parecidos até ter certeza de que mudam pelo mesmo motivo. Regra prática: espere a terceira ocorrência (rule of three).
5. **Em React, "OOP" se traduz em: custom hooks (comportamento reutilizável), componentes pequenos com props como contrato, e adaptadores na camada de dados.** Não sugira class components — são legado.

## Workflow de revisão

### Passo 1 — Entender antes de julgar
- Leia o código real. Se só houver descrição, peça o código.
- Identifique os padrões que o projeto JÁ usa (convenções de nome, estrutura de pastas, como módulos existentes resolvem problemas parecidos). Refatoração que ignora as convenções locais cria inconsistência — um problema pior do que o que resolve.
- Pergunte (ou infira) o que muda com frequência nesse código. Design serve pra facilitar as mudanças prováveis, não as imagináveis.

### Passo 2 — Diagnóstico por smells (não por checklist de princípios)
Procure, nesta ordem de impacto:

| Smell | Sinal | Refatoração típica |
|---|---|---|
| Lógica duplicada em N lugares | mesma regra copiada (ex: cálculo, validação, normalização) | Extrair função/módulo único; adaptador se os formatos divergem |
| Deus-objeto / deus-componente | arquivo com 500+ linhas, 10+ responsabilidades | Extrair módulos por responsabilidade; em React, extrair hooks e sub-componentes |
| Shotgun surgery | uma mudança de regra exige editar 5+ arquivos | Centralizar a regra num único módulo dono dela |
| Feature envy | função que só mexe em dados de outro módulo | Mover a função pra perto dos dados |
| Estado espalhado / duplicado | mesma informação derivável armazenada em 2+ lugares | Derivar em vez de armazenar (single source of truth) |
| Primitive obsession | strings/objetos soltos representando conceito do domínio | Criar tipo/factory com validação (em TS: type + funções; classe só se houver invariantes) |
| Condicionais por tipo repetidas | `if (x.tipo === 'a') ... else if (x.tipo === 'b')` em vários lugares | Polimorfismo via objeto de estratégias (mapa de funções), NÃO via hierarquia de classes |
| Acoplamento a detalhe externo | código de negócio chamando fetch/SDK direto em 10 lugares | Camada adaptadora fina (repository/gateway) |

### Passo 3 — Aplicar SOLID com tradução para JS/TS
Não cite SOLID como jargão — aplique a versão traduzida. Consulte `references/solid.md` para o detalhamento com exemplos em TS quando for escrever a justificativa de uma refatoração.

Resumo operacional:
- **S**: um módulo = um motivo pra mudar. Em React: um hook por preocupação.
- **O**: novas variantes sem editar o código existente → mapa de estratégias, registro de handlers, props de render.
- **L**: se um "subtipo" precisa de `if (instanceof)` no chamador, a abstração está errada.
- **I**: contratos pequenos. Em TS: várias interfaces enxutas > uma interface gorda.
- **D**: núcleo depende de contrato, não de implementação. Injete dependências por parâmetro (não precisa de framework de DI em JS).

### Passo 4 — Propor a refatoração
- **Sempre em passos pequenos e verificáveis**, cada um deixando o código funcionando (build/testes verdes). Nunca proponha uma reescrita big-bang.
- Para cada mudança, declare: (a) o smell que ela ataca, (b) o custo se NÃO fizer, (c) o risco da mudança em si.
- Se o código funciona e o smell é cosmético, diga explicitamente que **não refatorar é uma opção válida** — registre como dívida técnica e siga.
- Padrão de compatibilidade retroativa: quando o formato de dados muda, prefira **adaptador na leitura** (normaliza formato antigo e novo para um shape único) a migração de dados. Um único ponto de normalização substitui N correções espalhadas.
- Consulte `references/patterns.md` quando um padrão de projeto (Strategy, Adapter, Factory, Observer, Repository) parecer aplicável — ele traz as versões idiomáticas em JS/TS, que raramente envolvem classes.

### Passo 5 — Checar se OOP é a ferramenta certa
Antes de fechar a proposta, rode o checklist de `references/tradeoffs.md`. Perguntas-chave:
- Isso tem **estado com invariantes** que precisam ser protegidos? → classe ou closure com API controlada faz sentido.
- Isso é **transformação de dados**? → funções puras + pipeline; NÃO crie classe.
- Há **múltiplas implementações do mesmo contrato hoje** (não hipoteticamente)? → interface/estratégia se paga.
- A abstração proposta seria usada em **1 único lugar**? → provavelmente é indireção desnecessária; inline.

## Formato de saída da revisão

1. **Resumo executivo** (2-3 frases): estado geral e o problema nº 1.
2. **Achados**, ordenados por impacto, cada um com: smell → evidência (arquivo/trecho) → refatoração proposta → custo/risco.
3. **O que NÃO mudar**: liste explicitamente o que está bom ou o que não vale o risco de mexer agora.
4. **Plano em passos** (se o usuário pedir a refatoração): sequência incremental, cada passo verificável.

## Anti-padrões desta skill (nunca faça)

- Nunca proponha herança de classe como primeira solução pra reuso de código em JS/TS.
- Nunca crie interface/abstração "pra ficar preparado pro futuro" sem uma segunda implementação concreta existente.
- Nunca sugira reescrever módulo funcional que funciona só porque "seria mais elegante com classes".
- Nunca aplique padrão de projeto pelo nome ("aqui cabe um Visitor") sem mostrar o problema concreto que ele resolve neste código.
- Nunca ignore as convenções existentes do projeto em favor das "melhores práticas" genéricas.
