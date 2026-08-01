---
description: Passo 2 do ciclo — implementa a partir do spec, seguindo os padrões do projeto
---

Argumento opcional (caminho do spec, se não for o mais recente): $ARGUMENTS

Você está no **passo 2 (executar)** do ciclo. Aqui você só constrói — auditar é do `/review`.

## Antes de tocar em qualquer arquivo

1. Localize o spec: o caminho em $ARGUMENTS, ou o mais recente em `specs/`. Se não houver spec
   nenhum, pare e diga: "Nenhum spec encontrado — rode /spec primeiro."
2. **Leia o spec inteiro**, incluindo "fora de escopo" e os edge cases.
3. Leia `CLAUDE.md` e `memory/patterns.md` (se existirem) — os padrões do projeto valem sem
   precisar perguntar.
4. Leia os arquivos que você vai modificar antes de modificá-los, e procure o que já existe:
   helper, hook, componente ou função que resolva parte do problema. **Reusar o que existe vem
   antes de escrever novo.**

## Enquanto constrói

- Implemente exatamente o escopo. Nada da seção "fora de escopo", nada de refactor de vizinhança,
  nada de abstração "para o futuro", nada de fallback que o spec não pediu.
- Siga as convenções que o projeto já usa — descubra lendo o código ao redor, não por suposição:
  nomenclatura, idioma dos identificadores, formato de migration, organização de pastas,
  separação de estilo e marcação, tokens de tema.
- Regras que valem sempre, mesmo que o spec não repita: nenhum segredo hardcodado; nenhuma consulta
  ampla em tabela sensível; entrada de usuário validada antes de ir ao banco; nada de dado sensível
  em log; dinheiro em inteiro; erro de chamada externa tratado.
- Nada de `console.log` esquecido. Nada de `TODO` sem justificativa escrita ao lado.
- Se precisar desviar do spec para o código funcionar, **desvie e anote o motivo** — o `/review`
  vai cobrar isso.

## Paradas obrigatórias (não construa, pare e pergunte)

- O spec exige decisão de produto ou regra de negócio que não está escrita em lugar nenhum.
- O trabalho pede mudança de schema em produção destrutiva (drop/rename de coluna com dado,
  migration sem caminho de volta).
- Apareceu um custo financeiro que o spec não previu.
- Falta credencial/segredo para seguir.

Nesses casos: não invente o caminho, escreva a pergunta específica e pare.

## Ao final

Não rode a suíte de aprovação aqui (é do `/review`). Reporte:

- arquivos criados e modificados;
- quais critérios de aceite você acredita já cobertos, um a um;
- qualquer desvio do spec, com o motivo;
- se `specs/_loop.md` existir, atualize a rodada atual com "build concluído".

Termine com: `Build concluído. Rode /review para auditar contra o spec.`
