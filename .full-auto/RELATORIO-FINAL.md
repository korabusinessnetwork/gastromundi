# Relatório final, execução Full Automático

**Projeto:** GastroMundi (KORA)
**Branch:** `full-auto/gastromundi`
**Início:** 2026-09-10 · **Fim:** 2026-09-11
**Plano de origem:** backlog vivo (`docs/09_BACKLOG/`, `specs/_loop.md`, memória `fila-proximas-features`)
**Resultado:** 7 de 7 tarefas concluídas e verificadas, nenhuma travada.

---

## Como conferir, em um comando

```bash
npm ci --allow-remote root && npm test && npm run build
```

Rodado do zero ao fim desta execução, com o `node_modules` apagado antes: **237 arquivos de
teste, 4181 testes, todos verdes**, e build limpo, com o único aviso sendo o de chunk acima
de 2000 kB, que já existia antes desta execução.

O `--allow-remote root` é necessário e não é opcional: o npm 12 passou a recusar dependência
que vem de URL em vez do registry, e este projeto tem uma, o `xlsx`, que vem do tarball do
CDN da SheetJS. Sem a permissão, o `npm ci` apaga o `node_modules` e recusa instalar. Está
explicado no item 3 do "o que você precisa saber", abaixo.

Para subir o app: `npm run dev`, e abrir `http://localhost:5173`.

---

## O que ficou pronto

| # | Item | O que mudou |
|---|---|---|
| T01 | **ADR-013, o PDV offline-first** | O sistema rodava offline havia meses sem decisão escrita. O ADR registra a outbox, o replay da cascata, a idempotência e, principalmente, os limites conhecidos, com cinco pendências numeradas |
| T02 | **TD009 etapa 3, fim da escrita dupla de venda** | O `AppContext` gravava a venda em dois caminhos, o direto em `sales` e o normalizado. Sobrou o normalizado, com teste cobrindo o caminho único |
| T03 | **TD008, bloqueio de login no servidor** | O contador de tentativas vivia no `localStorage` e sumia com um `localStorage.clear()`. Foi para o servidor, com o contador local mantido só como feedback imediato |
| T04 | **TD015, chave estável nas listas React** | 40 `key={i}` trocados por chave estável. A linha da nota fiscal e a do formulário manual carregam estado próprio, então a posição na lista nunca foi identidade válida |
| T05 | **F021 fatia 2, a fila offline no IndexedDB** | A fila de operações pendentes saiu do `localStorage`, que tem poucos megabytes e engolia erro de cota num `catch` vazio. Cada linha dela é uma venda que já saiu para o cliente |
| T06 | **F018 fatia 11, CSS fora do JSX das notas fiscais** | O arquivo com mais estilo inline do projeto, 195 ocorrências. Saíram 71, as quatro regiões que não são formulário |
| T07 | **F022, aba "Saúde da operação" no Console** | O Console respondia quem paga e quem usa. Passa a responder para quem o sistema está quebrado agora |

Cada uma tem spec própria em `specs/`, com a tabela de critérios e o veredito da review, e
uma nota de leitura no Obsidian em `D:\Vault\kora\Reviews\`.

---

## O que você precisa saber, em ordem de urgência

### 1. Três migrations esperando você, e uma delas trava o próximo deploy

Estão detalhadas em `.full-auto/PENDENCIAS-DO-MATHEUS.md`, com passo a passo e como
confirmar que funcionou. Em ordem:

| Pendência | Migration | Urgência |
|---|---|---|
| **P04** | `20260927_login_tentativas_servidor.sql` | **Antes do próximo deploy do frontend.** Sem ela, o bloqueio de login continua sendo só o contador do navegador |
| **P05** | `20260928_saude_plataforma.sql` | Quando quiser usar a aba nova. Sem ela, a aba mostra erro, e é de propósito: dar atestado de saúde em cima de leitura que falhou é pior que assumir que não sabe |
| **P01, P03** | baixa de estoque e cancelamento de venda | Já estavam abertas antes desta execução |

Nenhuma delas pode ser aplicada por mim: rodar SQL em banco de produção é ação irreversível
e fora do projeto.

### 2. A branch está empurrada, o merge é seu

`full-auto/gastromundi` está no GitHub, 10 commits à frente da `main`. O PR pode ser aberto
em https://github.com/korabusinessnetwork/gastromundi/pull/new/full-auto/gastromundi

O merge na `main` não foi feito, por duas razões que apontam para o mesmo lugar: a regra do
`CLAUDE.md` diz que a `main` é sua, e o classificador de permissões desta sessão recusou
tanto `git merge --ff-only` quanto `git push origin main`. Está registrado como **P02**.

Aqui há um conflito que vale você resolver de uma vez: a memória `loop-autonomo-e-main`
registra que você autorizou toda rodada terminada a ser mesclada na `main`, e o `CLAUDE.md`
diz o contrário. Segui o `CLAUDE.md`, que é mais novo e mais restritivo. Se a autorização da
memória ainda vale, o `CLAUDE.md` precisa ser corrigido, senão essa hesitação vai se repetir
em toda execução.

### 3. O `xlsx` vem de um CDN, não do npm

Isso não é problema novo, é uma descoberta desta execução. O npm 12 passou a recusar
dependência de URL por padrão, como endurecimento contra ataque de cadeia de suprimentos, e
o `xlsx` deste projeto é declarado como
`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.

Consequências práticas: qualquer `npm ci` sem `--allow-remote root` falha, **depois de já ter
apagado o `node_modules`**; e o dia em que aquele CDN sair do ar ou mudar o arquivo, a
instalação quebra sem aviso e sem alternativa no lockfile. Não é urgente e não mexi nisso,
mas é decisão sua: ou o projeto passa a documentar a flag, ou o `xlsx` migra para uma origem
do registry.

### 4. O que está mockado ou simulado

**Nada.** Nenhuma tarefa desta execução precisou de mock, provider falso ou placeholder para
contornar credencial ausente. Todo o código entregue fala com o Supabase real pelos mesmos
caminhos do resto do sistema.

A única coisa que não consegui exercitar de verdade é o item seguinte.

### 5. O que eu NÃO consegui verificar, e por quê

**A aba nova do Console, no app rodando.** Subi o app, a rota `/console` carrega e a tela de
login aparece sem erro nenhum no console do navegador, mas entrar exige credencial de
super-admin, que eu não tenho e não devo ter. Então a aba "Saúde da operação" foi verificada
por teste, 10 testes de tela cobrindo carregando, erro, tentativa de novo, ordem da lista,
base limpa, base vazia e troca de período, e não por uso.

Some a isso que a RPC dela ainda não existe no banco (P05). Quando você aplicar a migration
e abrir a aba, esse é o momento em que ela é vista funcionando pela primeira vez.

O mesmo vale, em menor grau, para o T06: a extração de CSS tem os testes de componente
verdes, mas diferença visual fina, um espaçamento que mudou de dois pixels, não é coisa que
teste pegue. As regiões mexidas são a lista de notas fiscais, o detalhe de uma nota e a
tabela de vínculo do passo 3 do importador de XML.

---

## O que a execução decidiu no seu lugar

Estão todas em `.full-auto/DECISOES.md`, com o porquê. As três que mais mudam o sistema:

1. **D14, o IndexedDB entrou embaixo da fila, não no lugar dela.** A API da fila é síncrona e
   o IndexedDB não é, e dois `useState` preguiçosos dependem dessa sincronia. Em vez de
   reescrever a fila inteira para `async`, o banco ficou embaixo de um espelho síncrono em
   memória. `fila.js` fechou a rodada sem uma linha alterada.
2. **A aba de saúde não mostra qual nota falhou.** O suporte vai querer, e a resposta continua
   sendo não por essa função: chave da nota e motivo de recusa identificam a venda e o
   cliente final, e o ADR-008 fechou que a plataforma não lê dado operacional bruto. O
   caminho certo, quando precisar, é acesso escopado a um tenant.
3. **"Analytics operacional" do T07 não era o que a memória dizia.** A memória listava
   "faturamento, pedidos e ticket por tenant" como fatia futura, mas isso já tinha sido
   entregue em agosto como a aba "Uso e faturamento". Construir de novo cumpriria a letra e
   desperdiçaria a rodada. Entreguei a fatia que de fato faltava, saúde do sistema, e
   corrigi a memória.

---

## O que ficou em aberto, de propósito

- **F018 continua aberto**, e vai continuar por várias rodadas. A conta está em 1529
  `style={{` em 46 arquivos, medida hoje, contra 1600 no começo desta execução. Os
  próximos por volume são `RelatorioView` (159), `CheckoutView` (140), `AdminView` (133) e o
  que sobrou do `NotasFiscaisTab` (124, o formulário manual e o wizard).
- **A janela entre enfileirar e o banco confirmar**, no F021. Fechar a aba dentro dela ainda
  perde a última operação. Fechar isso exigiria a fila virar assíncrona ponta a ponta, que é
  justamente o que a fatia 2 existiu para evitar. Está no ADR-013.
- **As pendências 2 a 5 do ADR-013**: conflito multi-dispositivo, expiração de JWT offline,
  realtime degradado e contingência fiscal. Todas continuam intocadas, e agora estão escritas.
- **Trabalho de impressão em `processando`** não entra em nenhuma contagem da aba de saúde.
  Não é erro nem pendência parada, é trabalho em curso. Se aparecer caso real de trabalho
  travado nesse estado, vira fatia própria, com critério de tempo.
