# Refatoração 6.11: READMEs dos projetos satélites, `ponte/` e `bot/`

> Execução Full Automático do plano de refatoração (2026-11-26), tarefa T22.

## A mudança

O plano pede que `ponte/` e `bot/` tenham, na raiz, um README dizendo o que são, como rodar e se
compartilham código com o app, e que só virem workspace npm se houver código duplicado.

- **`ponte/README.md`** já dizia o que é a ponte e como instalar, usar e gerar o `.exe`. Ganha a
  seção "Relação com o app": a ponte não importa nada do app nem o app dela; conversam só pela rede
  local; a única constante repetida é o tamanho mínimo do id de impressão (8), nos dois lados, com
  os nomes de cada um.
- **`bot/README.md`** (novo): a tabela do que há na pasta e de como rodar o importador de cardápio;
  a relação com o app (o importador importa `src/lib/importacao/` por caminho relativo, então
  mudar esses arquivos muda o bot); e a nota de segurança (login de usuário real, senha no `.env`).

**Decisão de workspace:** nenhum dos dois vira workspace npm. A ponte não divide código com o app;
o bot reusa o código do app por import direto, sem cópia e sem dependência em comum. Não há
duplicação que um workspace resolveria.

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | READMEs na raiz de `ponte/` e `bot/` dizem o que é, como rodar e se compartilham código | leitura dos dois arquivos |
| 2 | O que eles afirmam sobre código compartilhado bate com o código | busca de imports de `src/` em `ponte/` e `bot/` |
| 3 | Sem travessão no texto novo | busca |

## Revisão

- Spec: 3 de 3 em sim. A busca confirma: `ponte/` não importa de `src/` (só um comentário cita
  `src/lib/ponte.js`), e `bot/importador-cardapio/src/core.js` importa os três arquivos de
  `src/lib/importacao/` que o README cita.
- Qualidade: nenhum crítico ou importante.
