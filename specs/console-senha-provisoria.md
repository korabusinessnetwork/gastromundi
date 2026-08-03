# CONSOLE-UX 20 — a senha provisória do responsável

## 1. Escopo

O campo "Senha provisória" do formulário "Novo estabelecimento" ganha um botão
**Gerar senha** (senha forte, sorteada com `crypto.getRandomValues`, em um
alfabeto sem caracteres que se confundem ao ditar) e um aviso **não
bloqueante** de senha fraca abaixo do campo.

Hoje o dono inventa, no meio da venda, a senha do administrador do cliente. A
regra que existe é o mínimo de 6 caracteres — nada impede `123456` em todo
cliente novo, e essa é a senha do usuário mais poderoso do estabelecimento.

## 2. Fora de escopo

- Endurecer o mínimo de 6 caracteres. É regra do servidor (`MIN_SENHA` em
  `supabase/functions/_shared/validacaoProvisionamento.ts`) e mudá-la de um
  lado só cria divergência; aumentar o mínimo é decisão do dono.
- Forçar troca de senha no primeiro acesso, expiração ou histórico de senha —
  exige schema e fluxo de login novos.
- Pôr a senha na mensagem copiada do cartão de primeiro acesso. A regra
  registrada em `memory/patterns.md` (rodada 37) continua valendo: senha nunca
  entra em área de transferência nem em histórico de conversa.
- Trocar a senha de um responsável **já criado** — a RLS de `tenants`/`users`
  não permite, e exigiria RPC nova.
- Esconder o campo atrás de `type="password"`. Ele é visível de propósito: o
  dono precisa ler a senha para o cliente na hora.

## 3. Origem e decisões que este item honra

- Backlog: **F022** (Console da Plataforma), melhoria CONSOLE-UX 20.
- Recomendação registrada no ledger `specs/_loop.md` ao fim da rodada 45.
- `memory/patterns.md` (rodada 37): senha nunca no texto copiado.
- Decisão 018 / ADR-007: estilo em `.css`, tokens `--gm-*`, nada no JSX.
- Princípio nº 1: prevenção de erro > mensagem de erro — a próxima ação óbvia
  (gerar uma senha boa) fica a um clique, em vez de depender da imaginação de
  quem está no meio de uma venda.
- CLAUDE.md (segurança): nada de senha em `console.log`.

## 4. Arquivos afetados

- `src/lib/console.js` — `gerarSenhaProvisoria`, `forcaDaSenha`.
- `src/lib/console.test.js` — testes das duas funções.
- `src/components/console/NovoEstabelecimentoModal.jsx` — botão e aviso.
- `src/components/console/NovoEstabelecimentoModal.css` — estilo do botão e do
  aviso.
- `src/components/console/NovoEstabelecimentoModal.test.jsx` — testes de tela.

## 5. Critérios de aceite

1. `gerarSenhaProvisoria()` devolve 10 caracteres sorteados com
   `crypto.getRandomValues` — nunca `Math.random`.
2. O alfabeto não tem caractere ambíguo ao ditar: sem `0`, `1`, `l`, `i`, `o`,
   `O` e sem maiúscula (a senha é lida em voz alta para o cliente).
3. Toda senha gerada tem ao menos uma letra e ao menos um dígito, e passa na
   validação que já existe (mínimo de 6, máximo de 100).
4. Duas chamadas seguidas não devolvem a mesma senha.
5. `forcaDaSenha(senha)` é função pura e devolve `{ nivel, motivo }` com
   `nivel` em `"fraca" | "media" | "forte"`; senha vazia devolve `nivel: ""`
   (não há o que avaliar antes de digitar).
6. É **fraca**: menos de 8 caracteres, ou só dígitos, ou só letras, ou uma das
   senhas óbvias da lista (`123456`, `senha`, `admin`, `mudar123`, `qwerty`,
   `000000`, `abc123`, o próprio usuário digitado). O `motivo` diz em
   português o que a torna fraca.
7. O aviso de senha fraca **não bloqueia** o cadastro: o botão "Criar
   estabelecimento" continua habilitado, e a única regra que barra o envio
   segue sendo o mínimo de 6 caracteres.
8. O botão "Gerar senha" preenche o campo, limpa o erro do campo, e o valor
   gerado aparece na tela (o campo é `type="text"` de propósito).
9. O botão fica desabilitado durante o envio, como todo controle do modal.
10. A senha nunca é logada: nenhum `console.log` com o valor, nem no clique do
    botão nem no envio.
11. A senha gerada não entra em nada que seja copiado: a mensagem de primeiro
    acesso continua sem senha (o teste que já garante isso segue verde).
12. Nenhum estilo novo no JSX: só classes em `NovoEstabelecimentoModal.css`,
    com tokens `--gm-*`.
13. Suíte verde (`npx vitest run`), com teste de unidade para as duas funções
    novas e teste de tela cobrindo os critérios 6, 7 e 8.

## 6. Edge cases conhecidos

- **`crypto.getRandomValues` ausente**: não existe navegador suportado sem ele
  (é padrão desde o IE11) e o jsdom da suíte o tem. Se faltar, a função lança —
  é melhor falhar visivelmente do que gerar senha previsível com `Math.random`.
- **Senha igual ao usuário digitado** (`barze` / `barze`): entra como fraca
  pelo critério 6, mesmo tendo 6 caracteres.
- **Senha longa e só de letras** (`abcdefghijkl`): fraca por não ter dígito.
- **Senha colada de um gerenciador** (20+ caracteres com símbolo): forte, sem
  aviso — não inventar regra que reprove senha boa.
- **Máximo de 100 caracteres**: o `maxLength` do campo já é 100 e não muda.
- **Dono gera e depois edita à mão**: o aviso reavalia a cada tecla; nada fica
  preso ao fato de ter sido gerado.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, suíte verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nos fluxos existentes do Console.

## 8. Resultado da review (2026-08-03)

**✅ Aprovado sem ressalvas — 13 de 13 critérios.**
Suíte: `npx vitest run` — 199 arquivos / 3422 testes, verde (eram 3388 antes da
rodada; +34 testes novos).

| # | Critério | Evidência |
|---|---|---|
| 1 | 10 caracteres, `crypto.getRandomValues` | `src/lib/console.js` — `TAMANHO_SENHA = 10` e `sortearIndice` usa `globalThis.crypto.getRandomValues`; teste "sorteia com crypto.getRandomValues, nunca com Math.random" espiona os dois |
| 2 | Alfabeto sem `0 1 l i o O` nem maiúscula | `LETRAS_SENHA`/`DIGITOS_SENHA` em `console.js`; teste roda 200 sorteios contra `/^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/` |
| 3 | Sempre letra + dígito, passa na validação | `gerarSenhaProvisoria` semeia uma letra e um dígito antes de completar; testes "sempre tem ao menos uma letra e ao menos um dígito" e "passa na validação do formulário" |
| 4 | Duas chamadas diferem | Teste "duas chamadas seguidas não devolvem a mesma senha" (50 sorteios em um `Set`) |
| 5 | `forcaDaSenha` pura, `{nivel, motivo}`, vazio → `""` | `console.js`; testes "não avalia campo vazio" e "é pura: a mesma entrada devolve sempre o mesmo resultado" |
| 6 | Regras de senha fraca com motivo em português | `SENHAS_OBVIAS` + checagens de tamanho/só-dígitos/só-letras/igual-ao-login; `it.each` com 10 casos, mais os dois testes de igualdade ao usuário |
| 7 | O aviso não bloqueia o cadastro | Teste "o aviso avisa, mas não bloqueia": `123456` mostra "Senha fraca", o botão segue habilitado e o provisionamento é chamado |
| 8 | Botão preenche, limpa o erro, valor visível | `NovoEstabelecimentoModal.jsx:338-348` (`setAdminPassword` + `limparErro`), `type="text"` na linha 353; testes "um clique preenche...", "gerar de novo troca a senha", "gerar limpa o erro que estava no campo" |
| 9 | Botão desabilitado durante o envio | `NovoEstabelecimentoModal.jsx:341` — `disabled={enviando}`, igual aos demais controles do modal |
| 10 | Senha nunca logada | Nenhum `console.log` em `console.js` nem no modal; teste "a senha nunca vai parar no log" espiona `console.log` no clique e no envio |
| 11 | Senha não entra em nada copiado | `montarMensagemPrimeiroAcesso` (`console.js:1228`) só recebe estabelecimento/plano/endereço/usuário; a linha da senha continua sendo "a que foi definida no cadastro" |
| 12 | Nenhum estilo no JSX | `grep style= NovoEstabelecimentoModal.jsx` — zero ocorrências; `.nem-label-linha`, `.nem-gerar` e `.nem-forca--*` em `NovoEstabelecimentoModal.css:148-176`, todas com tokens `--gm-*` |
| 13 | Suíte verde com os testes pedidos | 12 testes de unidade em `console.test.js` e 9 de tela em `NovoEstabelecimentoModal.test.jsx` |

### Corrigido durante a review

- **Botão dentro do `<label>` roubava o nome acessível do campo.** Como o
  `<button>` ficava dentro do `<label className="nem-campo">`, o nome acessível
  do botão virou o texto inteiro do label ("Senha provisória gy2gk4t9rk Senha
  forte.") e `getByLabelText(/Senha provisória/i)` passou a devolver o botão em
  vez do input — o campo ficou sem rótulo para leitor de tela. Trocado por
  `<div className="nem-campo">` com `<label htmlFor="nem-senha">` e
  `id="nem-senha"` no input (`NovoEstabelecimentoModal.jsx:335-351`).

### Fora desta rodada, registrado

- Aumentar o mínimo de 6 caracteres é decisão do dono (mexe em `MIN_SENHA` na
  Edge Function, os dois lados juntos).
- Troca obrigatória no primeiro acesso continua sem fluxo — exige schema novo.
