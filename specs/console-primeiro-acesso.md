# CONSOLE-UX 11 — o cartão de primeiro acesso (rodada 37)

## 1. Escopo

Depois de criar um estabelecimento, o Console mostra um **cartão de primeiro
acesso** — persistente, não a faixa de sucesso de uma linha — com o que o dono
precisa mandar para o cliente naquele minuto: nome do estabelecimento, plano
contratado, endereço de entrada no sistema e usuário do administrador criado,
mais um botão **"Copiar dados de acesso"** que põe a mensagem pronta na área de
transferência, com confirmação visível.

## 2. Fora de escopo

- **A senha não entra na mensagem nem na tela.** Ela foi digitada pelo dono no
  cadastro e não é relida de lugar nenhum; a mensagem diz para enviá-la por
  outro canal. Área de transferência e histórico de conversa não são lugar de
  senha.
- Envio automático por WhatsApp, e-mail ou SMS (canal pago / integração).
- Endereço/subdomínio próprio por estabelecimento (item de backlog, custa
  dinheiro — fica para a decisão do dono).
- Reexibir o cartão de um estabelecimento antigo pelo card da lista: o cartão é
  do estabelecimento **recém-criado**, na sessão em que foi criado.
- Mudança nas outras mensagens de sucesso (plano, layout, pagamento, add-ons) —
  continuam exatamente como estão.
- QR code, PDF ou impressão do cartão.

## 3. Origem e decisões que este item honra

- Backlog **F022** (Console da Plataforma), mesma trilha das rodadas 1 a 10 de
  CONSOLE-UX.
- **Decisão 017 (white-label):** nenhuma marca, nome de empresa ou cor de um
  cliente específico no texto — a mensagem fala do estabelecimento criado, não
  da plataforma.
- **CLAUDE.md, Segurança:** nada de dado sensível em log; nenhuma URL de API ou
  segredo hardcodado — o endereço de entrada sai de `window.location.origin`.
- **CLAUDE.md, decisão 018:** estilo fora do JSX, no `ConsolePage.css` já
  existente, com os tokens de tema em uso.
- **Princípio nº 1:** a próxima ação depois de criar um cliente é entregar o
  acesso a ele. Hoje a tela diz "criado" e o dono monta a mensagem de cabeça.

## 4. Arquivos afetados

- `src/lib/console.js` — função pura `montarMensagemPrimeiroAcesso`.
- `src/lib/console.test.js` — testes da função pura.
- `src/pages/console/ConsolePage.jsx` — o cartão no lugar da faixa quando o
  sucesso é de criação; copiar para a área de transferência.
- `src/pages/console/ConsolePage.css` — estilo do cartão.
- `src/pages/console/ConsolePage.test.jsx` — testes de tela.

## 5. Critérios de aceite

1. `montarMensagemPrimeiroAcesso({ estabelecimento, plano, endereco, usuario })`
   é **pura**, exportada de `src/lib/console.js`, e devolve uma string em
   português com as linhas de endereço, usuário e o aviso da senha.
2. A mensagem **nunca** contém senha, token ou o nome da plataforma — só o nome
   do estabelecimento, o plano, o endereço e o usuário (decisão 017).
3. Campo que falta some da mensagem em vez de virar "undefined" ou linha vazia
   (plano desconhecido, usuário ausente).
4. Depois de criar, a tela mostra o cartão com os quatro dados e o botão
   "Copiar dados de acesso"; as outras mensagens de sucesso continuam na faixa
   de uma linha, com os mesmos textos de hoje.
5. Clicar em copiar chama `navigator.clipboard.writeText` com exatamente a
   string da função pura e mostra confirmação visível ("Copiado!").
6. Se a cópia falhar ou a API não existir, a tela **não** engole o erro: mostra
   a mensagem em um bloco selecionável com a instrução de copiar à mão.
7. O cartão é dispensável (botão de fechar) e some ao dono começar outra ação
   (trocar plano, layout, add-ons, cobrar) — como a faixa já faz hoje.
8. O endereço de entrada vem de `window.location.origin`, sem URL hardcodada e
   sem variável de ambiente nova.
9. Nenhuma consulta nova ao banco, nenhuma cor ou estilo inline no JSX, nenhum
   `console.log`, nenhum `TODO` sem justificativa.
10. Rodadas 1 a 10 de CONSOLE-UX seguem verdes.

## 6. Edge cases conhecidos

- Retorno da Edge Function sem `admin.username` (payload inesperado).
- Plano cujo código não está no catálogo carregado, ou catálogo que falhou
  (`erroPlanos`) — a mensagem cai no código do plano, nunca em "undefined".
- `navigator.clipboard` ausente (contexto não seguro) ou `writeText` rejeitado
  (permissão negada).
- Dono cria um segundo estabelecimento sem fechar o cartão do primeiro: o
  cartão passa a ser do novo.
- Nome do estabelecimento com aspas, acento ou emoji — a string sai como está,
  sem escape inventado.

## 7. Definição de "aprovado sem ressalvas"

Todos os critérios de aceite em sim, `npx vitest run` verde, sem `TODO`
pendente, sem `console.log` esquecido e sem regressão nas rodadas 1 a 10 do
Console.

## 8. Resultado da review — 2026-08-03

**Aprovado sem ressalvas — 10 de 10.**
Suíte: `npx vitest run` — 198 arquivos / 3289 testes, verde (era 3271).
`src/lib/console.test.js` foi de 139 para 150; `ConsolePage.test.jsx`, de 89 para 96.

| # | Critério | Resultado | Evidência |
|---|---|---|---|
| 1 | `montarMensagemPrimeiroAcesso` pura e exportada | sim | `src/lib/console.js` (fim do arquivo); teste "é pura: não altera o objeto recebido" |
| 2 | Mensagem sem senha, token ou marca da plataforma | sim | testes "não carrega senha nenhuma além do aviso" e "não cita a plataforma"; na tela, "a senha nunca aparece na tela" |
| 3 | Campo ausente some em vez de virar "undefined" | sim | testes de plano/usuário/endereço ausentes; na tela, "resposta sem usuário não vira 'undefined'" |
| 4 | Cartão mostra os quatro dados + botão copiar; as outras confirmações seguem na faixa de uma linha | sim | `ConsolePage.jsx` — só `sucesso.criado` abre a `<section className="console__acesso">`; teste "mostra os dados que o cliente precisa para entrar" |
| 5 | Clique chama `clipboard.writeText` com o texto exato da função pura e confirma "Copiado!" | sim | teste "copiar põe a mensagem pronta na área de transferência e confirma na tela" |
| 6 | Falha na cópia mostra o texto em bloco selecionável | sim | `copiarAcesso` (`catch` → `copiaFalhou`); teste "cópia que falha não mente" |
| 7 | Cartão dispensável e some ao começar outra ação | sim | botão "Dispensar" e `setSucesso(null)` nos handlers; testes "o cartão é dispensável" e "começar outra ação fecha o cartão" |
| 8 | Endereço vem de `window.location.origin`, sem URL no código nem variável nova | sim | `const enderecoDeEntrada = ... window.location.origin`; nenhuma URL literal no diff de `src/` fora de fixture de teste |
| 9 | Sem consulta nova, sem estilo inline, sem `console.log`, sem `TODO` | sim | diff de `src/` sem `console.log`, `TODO` ou `style=`; estilo todo em `ConsolePage.css`, só com tokens já usados no arquivo |
| 10 | Rodadas 1 a 10 do Console seguem verdes | sim | suíte inteira verde, nenhum teste antigo alterado |

### Desvio do spec

A seção "Arquivos afetados" não listava `src/components/console/NovoEstabelecimentoModal.jsx`.
Ele foi tocado (três linhas) para o `onCriado` levar junto o `plano_codigo` escolhido
no formulário: quem conhece o plano com certeza é o próprio formulário, e depender do
formato da resposta da Edge Function deixaria o cartão sem essa informação em silêncio.

### Ficou para depois

- Envio automático por WhatsApp/e-mail (fora de escopo desta rodada; depende de canal pago).
- Reabrir o cartão de um estabelecimento antigo — hoje ele só existe no minuto da criação.
