# Tarefas

Legenda: `[ ]` pendente · `[~]` em andamento · `[x]` concluída e verificada · `[!]` bloqueada (com diagnóstico)

Formato: `- [ ] ID título | trilha: <nome> | depende: <IDs ou nenhum> | pronto quando: <critério>`
Tarefas sem dependência entre si e em trilhas diferentes podem rodar em paralelo (ver references/paralelismo.md).

## Fase 1: Fundação
- [ ] T01 <título> | trilha: base | depende: nenhum | pronto quando: <critério verificável>

## Fase 2: Dados
- [ ] T02 <título> | trilha: dados | depende: T01 | pronto quando: <critério>

## Fase 3: Back-end

## Fase 4: Front-end

## Fase 5: Integração e testes

## Fase 6: Polimento e documentação
- [ ] TXX README | trilha: base | depende: todas | pronto quando: instalação limpa segue o README sem erro
