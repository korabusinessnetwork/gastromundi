---
description: Uma rodada completa do laboratório — escolhe, especifica, constrói, verifica, revisa, aprende e fecha
---

Você é o operador do laboratório. Esta é **uma rodada**, do começo ao fim, sem
pedir confirmação em nenhum ponto. Ninguém está olhando enquanto você trabalha:
o que ficar escrito no disco é o único registro que sobra.

## Antes de qualquer coisa — reconstrua o estado

Seu contexto nasceu vazio nesta rodada. Leia, nesta ordem:

1. `specs/_loop.md` — o ledger. **O número desta rodada é a contagem de linhas
   que começam com `## Rodada ` no ledger, mais um.** Não guarde esse número em
   arquivo nenhum; ele se deriva do ledger e por isso sobrevive a um crash no
   meio da rodada.
2. `memory/learnings.md`, `memory/patterns.md`, `memory/bugs.md`,
   `memory/decisions.md` — o que já se aprendeu. Nunca repita um erro que está
   escrito em `memory/bugs.md`.
3. `backlog/features.md`, `backlog/bugs.md`, `backlog/tech-debt.md`.
4. `CLAUDE.md` do laboratório.

Leia a seção "Próximo item recomendado" da rodada mais recente do ledger: ela é
a sua primeira candidata, escrita pelo seu antecessor com o contexto todo na mão.

## Se esta rodada for múltiplo de 10 — rode o meta em vez do ciclo

Se `rodada % 10 == 0`, **não faça o ciclo normal**. Rode `/meta` e pare por aqui.
Meta-rodada não toca em `src/`.

## Os oito passos

1. **`/proximo`** — escolha o item da rodada. Um item, só um.
2. **`/spec`** — escreva `specs/<slug>.md`. A spec é o contrato; sem spec não há
   build.
3. **`/build`** — implemente exatamente o escopo. Nada além.
4. **Portão 1 — a suíte.** Rode `npm test`.
   - Verde: siga.
   - Vermelho: conserte **nesta mesma rodada**. Se depois de tentar você não
     fechar, rode `git checkout -- .` para reverter o working tree, registre o
     que travou em `memory/bugs.md`, escreva a rodada no ledger como
     **revertida** e encerre. **Nunca commite suíte vermelha** — o ledger
     mentindo é pior do que uma rodada perdida.
5. **Portão 2 — o smoke.** Rode `node tools/smoke.mjs --rota=<Rota para smoke
   da spec> --rodada=<N>`. Mesma regra do portão 1: falhou, conserte ou reverta.
   Um teste verde com a tela quebrada no navegador não vale nada.
6. **`/review`** — audite critério por critério e anexe a tabela de evidências
   no fim da spec.
7. **`/aprender`** — grave em `memory/` o que esta rodada ensinou.
8. **Feche a rodada:**
   - `git add -A && git commit` com a mensagem
     `feat(<escopo>): <descrição> (rodada N)`. O commit é **local** — o
     laboratório nunca dá push, e o portão de segurança nega a tentativa.
   - Acrescente no **topo** do ledger (logo abaixo do título `# Ledger do
     ciclo`) o bloco:

     ```
     ## Rodada N — <ITEM> (<resumo curto>) — YYYY-MM-DD
     - Spec: specs/<slug>.md
     - Resultado da review: aprovado sem ressalvas (X de Y) — suíte N arquivos / N testes
     - Smoke: verde na rota <rota> — Screenshots/rodada-N.png
     - O quê: <o que mudou, em uma ou duas frases>
     - Aprendido: memory/learnings.md — <a lição>
     - Commit: <sha curto> na branch <branch>
     - Pendente de decisão: <o que precisa do dono, ou "nada">
     - Próximo item recomendado: <item + por que ele e não outro>
     ```

   - Escreva a nota espelho em `$KORA_VAULT/Ciclos/YYYY-MM-DD-rodada-N.md` com
     o mesmo conteúdo mais um front-matter
     `tipo: ciclo / projeto: pdv-lab / rodada: N`. A nota de commit em
     `Commits/` sai sozinha pelo hook `post-commit`.

## Regras que valem a rodada inteira

- **Um item por rodada.** Viu outro problema no caminho? Anote em
  `backlog/bugs.md` e siga. Correção de bug não pede faxina em volta.
- **Dinheiro é inteiro em centavos.** Nunca float, em nenhum lugar.
- **CSS separado do JSX** — `.css` co-localizado, nunca estilo inline novo.
- **Intuitividade acima de tudo:** rótulo em português do dia a dia do balcão,
  próxima ação sempre visível, estado de carregando/erro/vazio/sucesso sempre
  na tela. Se a tela precisa de explicação, ela está errada.
- **Os arquivos de `memory/` e `specs/` têm quebra de linha CRLF.** Edite-os
  pela ferramenta de edição, nunca por script node procurando `\n` — falha em
  silêncio e você perde a rodada.
- **Sem rede.** Nada de `curl`, `wget`, nem dependência nova que precise baixar
  algo em tempo de execução.
- Se algo exigir decisão do dono (regra de negócio ambígua, custo, escopo novo),
  **não decida**: registre em "Pendente de decisão" no ledger e escolha outro
  caminho dentro do escopo.

Ao terminar, imprima três linhas e nada mais: o número da rodada, o item, e o
sha do commit (ou "revertida" e o motivo).
