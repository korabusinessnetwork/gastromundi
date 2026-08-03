# CONSOLE-UX 21 — sugestão de usuário livre quando a criação falha por "usuário já em uso"

## 1. Escopo

Quando o provisionamento é recusado porque o **usuário de acesso já existe na
plataforma**, o Console passa a oferecer um candidato concreto num clique —
`Usar jose.bardoze` — em vez de só pedir ao dono que invente outro. Cada nova
recusa oferece um candidato diferente.

Hoje a colisão de username é, segundo o próprio comentário em
`src/lib/console.js:832-837`, "o modo de falha mais provável ao pôr um cliente
novo no ar": enquanto `TENANT_ROOT_DOMAIN` está desligado, a Edge Function monta
o e-mail no namespace `gastromundi` para todo estabelecimento, então o username
precisa ser único na **plataforma inteira** — o segundo cliente cujo responsável
se chame "joão" (ou que reuse "admin") bate aqui. O erro já é traduzido para
português e colado no campo certo; o que falta é a saída.

## 2. Fora de escopo

- **Verificar no banco se o usuário está livre antes de enviar.** `public.users`
  não tem o ramo `is_super_admin()` na RLS e o Console não a lê; consultar
  exigiria RPC `SECURITY DEFINER` nova — decisão do dono, e é a mesma pendência
  aberta desde a rodada 41. A sugestão continua sendo chute educado: quem
  verifica é o servidor, no envio.
- Mudar a mensagem de erro traduzida ou o `ERRO_USUARIO_EM_USO`. O texto atual
  está certo; ele só ganha um botão ao lado.
- Sugerir usuário **antes** da primeira recusa. Sem poder verificar, sugerir de
  saída seria inventar problema onde não há.
- Ligar `TENANT_ROOT_DOMAIN` para tornar o username único por tenant em vez de
  global. É mudança de borda e de domínio, com decisão do dono por trás.
- Trocar o usuário de um responsável **já criado** — `public.users` não é
  escrita pelo Console.

## 3. Origem e decisões que este item honra

- Backlog: **F022** (Console da Plataforma), melhoria CONSOLE-UX 21.
- Recomendação registrada em `specs/_loop.md` ao fim da rodada 46.
- `memory/patterns.md` (rodada 45): "conflito vira uma escolha de um clique, não
  uma frase pedindo para redigitar" — é o mesmo molde do endereço do cardápio,
  aplicado ao campo vizinho.
- Princípio nº 1: prevenção de erro > mensagem de erro; a próxima ação óbvia
  fica visível.
- Decisão 017 (white-label): o candidato sai do nome/endereço do próprio
  estabelecimento — nada de sufixo de marca cravado no código.
- Decisão 018 / ADR-007: estilo em `.css`, tokens `--gm-*`.

## 4. Arquivos afetados

- `src/lib/console.js` — `sugerirUsuarioLivre` (função pura).
- `src/lib/console.test.js` — testes da função.
- `src/components/console/NovoEstabelecimentoModal.jsx` — botão da sugestão e a
  contagem de recusas.
- `src/components/console/NovoEstabelecimentoModal.css` — reuso de `.nem-sugestao`
  (a classe da rodada 45); só entra regra nova se algo faltar.
- `src/components/console/NovoEstabelecimentoModal.test.jsx` — testes de tela.

## 5. Critérios de aceite

1. `sugerirUsuarioLivre(usuario, { slug, tentativa })` é função pura, sem I/O, e
   devolve sempre um username já normalizado por `normalizarUsername`.
2. O primeiro candidato junta o usuário digitado ao endereço do estabelecimento:
   `admin` + `bardoze` → `admin.bardoze`. É o que distingue dois clientes cujo
   responsável tem o mesmo nome.
3. A partir da segunda recusa, o candidato muda: `admin.bardoze2`,
   `admin.bardoze3`, … — nunca repete o que já foi recusado.
4. Quando o usuário digitado **já termina** no endereço (`admin.bardoze`), o
   primeiro candidato pula direto para o numérico (`admin.bardoze2`), em vez de
   sugerir `admin.bardoze.bardoze`.
5. Sem endereço utilizável, o candidato é numérico sobre o próprio usuário
   (`admin2`) — a função nunca devolve vazio quando recebe um usuário válido.
6. O candidato tem no máximo 30 caracteres — o mesmo `maxLength` do campo, com
   teste amarrando a constante nova ao número que a tela impõe e ao teto da
   borda: a base é truncada antes do sufixo, nunca o sufixo.
7. O candidato passa na validação que já existe (ao menos 3 caracteres depois de
   normalizar) e é sempre diferente do usuário que foi recusado.
8. O botão **só** aparece depois de uma recusa do servidor no campo
   `adminUsername` — nunca por validação local, nunca antes do primeiro envio, e
   nunca para outro erro de provisionamento.
9. Um clique preenche o campo com o candidato, limpa o erro e some — a tela volta
   ao estado normal, pronta para reenviar.
10. Se o dono editar o usuário à mão, a contagem de recusas zera: o próximo
    conflito volta a oferecer o candidato nº 1 sobre o texto novo.
11. O `aviso` de compensação (estabelecimento órfão que a borda não conseguiu
    apagar) continua aparecendo inteiro no alerta — a sugestão não o engole.
12. Nada de consulta nova, migration nova ou variável de ambiente nova.
13. Nenhum estilo no JSX: só classes de `NovoEstabelecimentoModal.css` com
    tokens `--gm-*`.
14. Suíte verde (`npx vitest run`), com teste de unidade da função nova e teste
    de tela cobrindo os critérios 8, 9 e 10.

## 6. Edge cases conhecidos

- **Recusa sem slug no formulário**: impossível hoje (a rodada 45 tornou o
  endereço obrigatório na validação), mas a função é exportada — recebe `slug`
  vazio e cai no numérico do critério 5.
- **Usuário digitado muito longo** (30+ caracteres): trunca a base, mantém o
  sufixo; o resultado continua com 3 ou mais caracteres.
- **Usuário que normaliza para vazio** (`!!!`): a validação local já barra antes
  do envio, então a recusa do servidor não acontece; a função devolve string
  vazia e a tela não mostra botão.
- **Recusa repetida muitas vezes**: o contador só cresce; não há teto, e o
  candidato acompanha (`admin.bardoze9`).
- **Erro do servidor que não é colisão de usuário**: nenhuma sugestão, mesmo que
  o campo `adminUsername` esteja preenchido.
- **Fechar e reabrir o modal**: a contagem nasce zerada com o componente.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, suíte verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nos fluxos existentes do Console.

## 8. Resultado da review (2026-08-03)

**Aprovado sem ressalvas — 14 de 14 critérios.**
Suíte: `npx vitest run` — 199 arquivos / 3441 testes, verde (eram 3422 antes
desta rodada; +19).

| # | Critério | Evidência |
|---|---|---|
| 1 | Função pura | `src/lib/console.js:610-655` — só string, sem I/O; teste de pureza em `console.test.js` |
| 2 | Junta usuário e loja | `console.js:631` (`${base}.${loja}`); teste "junta o usuário ao endereço da loja" |
| 3 | Candidato muda a cada recusa | `console.js:645-647`; testes "muda o candidato a cada nova recusa" (unidade) e "a sugestão muda a cada nova recusa" (tela) |
| 4 | Não repete a loja | `console.js:630` (`jaTemLoja`); teste "não repete a loja quando o usuário já termina nela" |
| 5 | Sem loja, cai no número | `console.js:645` (`raiz === base` desloca o número); teste "cai no número quando não há endereço utilizável" |
| 6 | Teto de 30, corta a base | `console.js:634-640`; testes "respeita o limite do campo" e a amarração em `provisionamentoValidacao.test.js:456-462` |
| 7 | Passa na validação e difere do recusado | `console.js:648-652`; testes "nunca devolve o usuário que acabou de ser recusado" e "devolve candidato que passa na validação" |
| 8 | Só depois da recusa do servidor | `NovoEstabelecimentoModal.jsx:100-103` (`recusasDeUsuario > 0 && erros.adminUsername`) e `:133` (só incrementa em `campo === "adminUsername"`); testes "não sugere nada antes do primeiro envio" e "não sugere quando a recusa é de outra coisa" |
| 9 | Um clique resolve | `NovoEstabelecimentoModal.jsx:112-116` + `:339-346`; teste "um clique adota a sugestão, limpa o erro e some" |
| 10 | Editar à mão zera a contagem | `NovoEstabelecimentoModal.jsx:115`; teste "editar o usuário à mão zera a contagem" |
| 11 | Aviso de órfão continua inteiro | `NovoEstabelecimentoModal.jsx:134` (inalterado); teste "o aviso de estabelecimento órfão continua inteiro ao lado da sugestão" |
| 12 | Sem consulta, migration ou env nova | `git diff --stat` — 5 arquivos, todos em `src/`; nenhum `supabase/` tocado |
| 13 | Nada de estilo no JSX | Reusa `.nem-sugestao` (CONSOLE-UX 19); `NovoEstabelecimentoModal.css` não precisou de regra nova, e não há `style=` no arquivo |
| 14 | Suíte verde com teste novo | 10 testes de unidade, 8 de tela, 1 de amarração |

### Corrigido durante a review

- **Regressão em `provisionamentoValidacao.test.js`.** Trocar o
  `maxLength={30}` do campo por `maxLength={MAX_USERNAME}` quebrou o teste que
  lê o número literal do JSX para amarrá-lo ao teto da borda — a amarração
  existe justamente para o número ter uma fonte independente. O campo voltou ao
  literal, e a constante nova ganhou seu próprio teste de amarração
  (`MAX_USERNAME` do Console = `maxLength` do campo = `MAX_USERNAME` da borda).

### Fora desta rodada (registrado para a próxima)

- **Verificar o usuário antes de enviar.** Só com RPC `SECURITY DEFINER` sobre
  `public.users` — a mesma pendência aberta desde a rodada 41. Decisão do dono.
- O botão pula um número quando o dono aceita a sugestão e ela também é
  recusada (`admin.bardoze` → `admin.bardoze2`, nunca repetido, mas a contagem
  reinicia). É o comportamento desejado — o texto mudou, então a sugestão é
  nova; fica anotado para não parecer descuido numa leitura futura.
