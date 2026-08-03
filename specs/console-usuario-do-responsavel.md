# CONSOLE-UX 22 — o usuário de acesso nasce do nome do responsável

## 1. Escopo

No formulário de criação de estabelecimento, o campo **Usuário de acesso** passa
a nascer do **Nome do responsável** já normalizado (`José Maria` → `josemaria`),
enquanto ninguém o editar. Assim que o dono digitar no campo — ou aceitar a
sugestão de usuário livre da rodada 47 —, ele para de seguir o nome e a escolha
manual manda.

É o último campo do cadastro que o dono ainda precisa inventar do zero no meio
da venda. Hoje ele digita "José Maria" em Responsável e o campo vizinho fica
vazio, esperando que ele traduza aquilo para `josemaria` de cabeça, sabendo as
regras que ninguém escreveu na tela (só minúscula, sem acento, sem espaço). O
molde já existe duas vezes na mesma tela: o endereço do cardápio derivado do
nome do estabelecimento (rodada 45) e a sugestão de usuário livre (rodada 47).

## 2. Fora de escopo

- **Verificar no banco se o usuário derivado está livre.** `public.users` não
  tem o ramo `is_super_admin()` na RLS; a verificação continua sendo o envio, e
  a saída quando ele recusa continua sendo a sugestão da rodada 47.
- Derivar a **senha** do nome. Senha é gerada por sorteio (rodada 20) e nunca
  por dado do cliente.
- Mudar `normalizarUsername`, a validação da borda ou o `MAX_USERNAME`.
- Derivar o usuário de um responsável **já criado** — `public.users` não é
  escrita pelo Console.
- Mudar o campo Nome do responsável (rótulo, limite, validação).

## 3. Origem e decisões que este item honra

- Backlog: **F022** (Console da Plataforma), melhoria CONSOLE-UX 22.
- Recomendação registrada em `specs/_loop.md` ao fim da rodada 47.
- `memory/patterns.md` (rodada 45): campo derivado é **estado derivado, não
  efeito** — enquanto ninguém tocou, o campo *é* a derivação, então não existe
  instante em que a tela mostre um valor velho.
- Princípio nº 1: a próxima ação óbvia fica visível; prevenção de erro >
  mensagem de erro; estado sempre visível (a dica diz que o campo está
  seguindo o nome).
- Decisão 017 (white-label): a derivação sai do nome digitado, sem sufixo,
  prefixo ou marca cravada no código.
- Decisão 018 / ADR-007: estilo em `.css`, tokens `--gm-*`.

## 4. Arquivos afetados

- `src/lib/console.js` — `usernameSugeridoDoNome` (função pura).
- `src/lib/console.test.js` — testes da função.
- `src/components/console/NovoEstabelecimentoModal.jsx` — estado `usernameTocado`,
  o valor efetivo e a dica.
- `src/components/console/NovoEstabelecimentoModal.test.jsx` — testes de tela.
- `src/components/console/NovoEstabelecimentoModal.css` — só se faltar classe;
  a expectativa é reusar `.nem-dica`.

## 5. Critérios de aceite

1. `usernameSugeridoDoNome(nome)` é função pura, sem I/O, e devolve sempre um
   username já passado por `normalizarUsername`.
2. Nome com acento, espaço e maiúscula vira usuário válido: `"José Maria"` →
   `"josemaria"`.
3. O resultado respeita `MAX_USERNAME` (30), truncando o nome — e o corte não
   deixa o texto terminar em `.`, `-` ou `_`.
4. Nome que não produz um usuário aceitável (vazio, só símbolos, ou menos de 3
   caracteres depois de normalizar) devolve `""` — o campo fica **vazio** para o
   dono digitar, em vez de exibir um valor que a validação vai recusar.
5. Enquanto o dono não editar o campo, o Usuário de acesso exibido é a derivação
   do nome do responsável, **por estado derivado, não por `useEffect`**: mudar o
   nome muda o usuário na mesma renderização.
6. Ao digitar no campo Usuário de acesso, ele para de seguir o nome para sempre
   naquele formulário — inclusive se o dono **apagar** tudo, o campo fica vazio
   e não ressuscita a derivação.
7. Aceitar a sugestão de usuário livre (rodada 47) também marca o campo como
   editado — o candidato aceito não pode ser sobrescrito pela próxima letra
   digitada no nome do responsável.
8. O que é enviado ao servidor, o que a força da senha compara e o que a
   sugestão da rodada 47 recebe é sempre o **valor efetivo** do campo (derivado
   ou digitado), nunca um estado desatualizado.
9. Enquanto o campo segue o nome, a dica diz isso em português do dia a dia e
   avisa que dá para editar; depois de editado, volta a dica atual sobre os
   caracteres aceitos.
10. Se o servidor já tinha recusado o usuário e o campo ainda segue o nome,
    editar o **nome do responsável** zera a contagem de recusas — o texto do
    usuário mudou, então a próxima sugestão é a nº 1 sobre o texto novo.
11. A validação de envio continua sendo a mesma: usuário com menos de 3
    caracteres barra o envio com a mensagem que já existe.
12. Nada de consulta nova, migration nova ou variável de ambiente nova.
13. Nenhum estilo no JSX; só classes do `.css` com tokens `--gm-*`.
14. Suíte verde (`npx vitest run`), com teste de unidade da função nova e teste
    de tela cobrindo os critérios 5, 6, 7 e 10.

## 6. Edge cases conhecidos

- **Nome só de símbolos** (`"!!!"`): derivação vazia, campo vazio, validação
  local barra no envio como hoje.
- **Nome curtíssimo** (`"Zé"` → `"ze"`, 2 caracteres): abaixo do mínimo de 3, a
  derivação devolve `""` em vez de um usuário que seria recusado.
- **Nome muito longo**: trunca em 30 sem terminar em separador.
- **Nome que já é um username** (`"admin"`): sai igual, sem dupla normalização.
- **Colar um nome inteiro depois de editar o usuário**: o campo editado não se
  mexe (critério 6).
- **Fechar e reabrir o modal**: `usernameTocado` nasce falso com o componente,
  então o campo volta a seguir o nome.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, suíte verde, sem TODO pendente, sem
`console.log` esquecido e sem regressão nos fluxos existentes do Console —
especialmente na sugestão de usuário livre (rodada 47) e na força da senha
(rodada 20), que leem o mesmo campo.

## 8. Resultado da review (2026-08-03)

Aprovado sem ressalvas — 14 de 14 critérios em sim. Suíte `npx vitest run`:
199 arquivos / 3455 testes, verde (+14 desta rodada).

**Desvio do escopo, com motivo.** A mensagem de `traduzirErroProvisionamento`
(`src/lib/console.js`) foi encurtada de "Este usuário de acesso já existe na
plataforma. Escolha outro — por exemplo, o nome do responsável junto do nome da
loja." para "Este usuário de acesso já existe na plataforma. Escolha outro." A
frase é renderizada DENTRO do `<label>` do campo Usuário de acesso, então, com a
recusa na tela, ela entrava no nome acessível daquele campo e
`getByLabelText(/Nome do responsável/i)` passava a achar dois inputs — quebrando
testes que esta rodada não tocou. O exemplo também já estava obsoleto: o campo
agora nasce do responsável e o botão da rodada 47 mostra um usuário livre pronto.

**Fica para uma próxima rodada:**

- Verificar o usuário derivado no banco antes do envio — segue dependendo da RPC
  `SECURITY DEFINER` sobre `public.users` (decisão do dono, aberta desde a rodada 41).
- O mesmo molde ainda cabe no **e-mail** do responsável, se ele um dia entrar no
  formulário: hoje a borda o monta sozinha a partir do username.
