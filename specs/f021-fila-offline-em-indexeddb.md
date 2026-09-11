# F021 fatia 2, a fila offline passa a morar no IndexedDB

## O problema

A fila de operações pendentes do PDV grava hoje em `window.localStorage`, sob a chave
`kora.fila.pending.v1`. O ADR-013 já registrou por escrito o que isso custa:

> O `localStorage` é síncrono, limitado a poucos megabytes e compartilhado por origem. Uma
> fila grande em um serviço longo sem rede pode estourar a cota, e o código responde com a
> fila em memória, o que significa perder o pendente se a aba fechar.

Perder o pendente não é perder cache. Cada linha da fila é uma venda que já saiu para o
cliente, uma baixa de estoque que ainda não desceu, uma nota fiscal que ainda não foi
emitida. O `catch` vazio do `gravar` em `fila.js` transforma cota estourada em silêncio, e o
silêncio vira buraco de inventário e pendência fiscal invisível.

O ADR-013 também já escreveu qual é a saída, e por que o storage injetável existe:

> **IndexedDB desde o começo, com Dexie.** Rejeitada na Leva 11 por custo de entrega, não por
> mérito. O storage injetável foi construído justamente para essa troca acontecer depois sem
> tocar na lógica da fila, e ela segue como a próxima fatia do F021.

Esta é essa fatia.

## O obstáculo real, e a regra adotada

A promessa do storage injetável tem um furo que só aparece na hora de cumprir: **a API da
fila é síncrona e o IndexedDB é assíncrono.**

`fila.listar()`, `fila.tamanho()` e `fila.enfileirar()` devolvem valor na hora, e dois
consumidores dependem disso dentro de inicializador preguiçoso de `useState`, que não pode
esperar:

- `src/context/AppContext.jsx:137`, `useState(() => filaOffline.tamanho())`
- `src/components/fiscal/HistoricoNfce.jsx:57`, `useState(() => contarPendenciasFiscais())`

Trocar `getItem`/`setItem` por chamadas ao IndexedDB quebraria os dois. Reescrever a fila
inteira para `async` espalharia `await` por `AppContext`, `HistoricoNfce` e por toda a suíte
de testes da fila, que é justamente o que o storage injetável foi feito para evitar.

**A regra adotada: o IndexedDB entra como backing store durável de um espelho síncrono em
memória.**

O espelho é um `Map` que atende `getItem`/`setItem`/`removeItem` na hora, com a mesma cara do
`localStorage`. Toda escrita no espelho agenda uma gravação no IndexedDB. Na subida do app, a
hidratação lê o banco e traz o que ficou da sessão anterior.

`fila.js` não muda uma linha. Os consumidores continuam síncronos. O IndexedDB fica embaixo,
onde a cota é ordens de grandeza maior e o erro de gravação é observável em vez de mudo.

### A janela de hidratação, e por que a mesclagem é por `uid`

A hidratação é assíncrona, então existe uma janela entre o primeiro render e o momento em que
o banco responde. Se o operador enfileirar uma venda dentro dessa janela, o espelho tem uma op
e o banco tem três, e uma gravação ingênua apagaria as três.

Por isso a hidratação **mescla** em vez de sobrescrever, e a mesclagem da fila é por `uid`: as
ops persistidas entram primeiro, na ordem em que foram gravadas, e depois entram as ops locais
cujo `uid` ainda não está lá. O `uid` já existia em cada op (`fila.js` carimba um no
`enfileirar`), então a união é bem definida e a ordem de reenvio é preservada.

Quem decide como mesclar é quem monta o storage, não o storage. O adaptador recebe a função
por parâmetro e usa um default conservador quando ela não vem.

### A migração do `localStorage`

Existe fila pendente no `localStorage` de quem usa o sistema hoje. Descartá-la na virada seria
jogar fora venda de cliente. A hidratação, quando o banco não tem nada para a chave, adota o
valor legado do `localStorage` e só apaga a chave legada **depois** que a gravação no
IndexedDB confirmar. Gravação que falha deixa o legado onde está, para a próxima subida tentar
de novo.

Quando o banco já tem valor, ele manda: o legado é ignorado e removido, porque a fila já migrou
numa sessão anterior e o resto é sobra.

### Ambiente sem IndexedDB

Navegador antigo, aba em modo privado com IDB bloqueado, jsdom da suíte de testes: em nenhum
desses o app pode cair. Sem `indexedDB` no globo, ou com `open` lançando, ou com o banco
recusando abrir, a hidratação resolve dizendo que não há banco e o espelho segue valendo só em
memória. Nada lança, nada fica pendurado.

Isso é degradação, não equivalência, e está dito assim no código: sem IDB, a fila volta a ser
o que era quando o `localStorage` estourava a cota, viva só enquanto a aba estiver aberta.

## Arquivos afetados

| Arquivo | O que muda |
|---|---|
| `src/lib/offline/storageIdb.js` | **novo**, o adaptador: espelho síncrono, hidratação, gravação, migração, fallback |
| `src/lib/offline/storageIdb.test.js` | **novo**, a suíte do adaptador, com `fake-indexeddb` |
| `src/lib/offline/filaApp.js` | monta a fila sobre o adaptador em vez de `window.localStorage`, exporta `prontoOffline` e `assinarFilaOffline` |
| `src/context/AppContext.jsx` | reassina o contador de pendências quando a hidratação termina |
| `src/components/fiscal/HistoricoNfce.jsx` | mesma reassinatura para o aviso de pendência fiscal |
| `src/context/AppContext.filaHidratacao.test.jsx` | **novo**, tranca o critério 11 do lado do provider |
| `src/components/fiscal/HistoricoNfce.test.jsx` | tranca o critério 11 do lado da tela de notas |
| `src/context/AppContext.estoqueIdempotencia.test.jsx` | lê e semeia a fila pela porta dela, não mais pelo `localStorage` |
| `docs/08_DECISOES/adr-013.md` | pendência 1 fechada, negativo da cota reescrito |
| `package.json` | `fake-indexeddb` em `devDependencies` |

## Fora de escopo

- **`snapshot.js` continua no `localStorage`.** O snapshot de bootstrap é cache de leitura,
  limitado e descartável: perdê-lo custa uma carga a mais, não uma venda. A tarefa é a fila.
- **Nenhuma biblioteca de IndexedDB em runtime.** Dexie e `idb` resolveriam um problema que
  aqui não existe: são uma chave e um object store. O adaptador cabe em um arquivo, e
  dependência em runtime é peso no bundle do PDV. `fake-indexeddb` entra só em `devDependencies`.
- **`fila.js` e `drenarFila` não mudam.** Se mudarem, a premissa desta fatia está errada.
- **Conflito multi-dispositivo, expiração de JWT offline, realtime degradado e contingência
  fiscal** seguem como pendências 2 a 5 do ADR-013.

## Critérios de aceite

1. `src/lib/offline/fila.js` não tem nenhuma linha alterada, e `src/lib/offline/fila.test.js`
   passa sem edição.
2. `filaApp.js` não usa mais `window.localStorage` como storage da fila.
3. Uma op enfileirada, com a gravação concluída, é enxergada por uma **nova** instância de fila
   montada sobre um adaptador novo apontado para o mesmo banco.
4. Uma op enfileirada **antes** de a hidratação terminar sobrevive a ela, e as ops que estavam
   no banco também: o resultado é a união por `uid`, persistidas primeiro.
5. Sem `indexedDB` no ambiente, o adaptador funciona em memória, `pronto` resolve com
   `{ idb: false }`, e nada lança nem fica pendurado.
6. `indexedDB.open` que lança, ou requisição de abertura que dispara `onerror`, cai no mesmo
   caminho de memória do critério 5.
7. Fila legada no `localStorage` é adotada na hidratação, e a chave legada é removida **só**
   depois de a gravação no IndexedDB confirmar.
8. Quando o banco já tem valor para a chave, o legado do `localStorage` não sobrepõe nada.
9. Falha de gravação no banco chama o callback `aoFalhar` e não lança nem derruba o espelho.
10. `assinar` avisa quando a hidratação muda o espelho, e não avisa quando não muda.
11. `AppContext` e `HistoricoNfce` atualizam o contador de pendências quando a hidratação
    termina, e cancelam a assinatura ao desmontar.
12. `mesclarPorUid` tem teste próprio: união, ordem, valor nulo dos dois lados, e JSON inválido
    de qualquer um dos lados sem lançar.
13. `npm test` verde na suíte inteira, sem teste existente removido ou enfraquecido, e
    `npm run build` limpo.
14. O ADR-013 reflete o estado novo: pendência 1 fechada, e o negativo da cota reescrito para
    o que passa a ser verdade.

## Aprovado sem ressalvas significa

Os 14 critérios em sim, com evidência lida do arquivo real, não do diff. O critério 1 se
verifica com `git diff --stat` mostrando `fila.js` e `fila.test.js` fora da lista.

---

## Veredito da review, 10/09/2026

**Aprovado sem ressalvas.** Os 14 critérios em sim, com evidência lida do arquivo real.

| # | Critério | Evidência |
|---|---|---|
| 1 | `fila.js` e `fila.test.js` intocados | `git diff --stat` não lista nenhum dos dois, e `fila.test.js` passa sem edição |
| 2 | `filaApp.js` não usa mais `window.localStorage` como storage | `filaApp.js:23`, a fila é montada sobre `criarStorageIdb`; o `localStorage` só entra em `legado` (`:15-21`) |
| 3 | Op gravada é enxergada por instância nova sobre o mesmo banco | `storageIdb.test.js`, describe "durabilidade": instância nova lê a gravação, e a fila inteira sobrevive a um reload de aba na ordem `["a", "b"]` |
| 4 | Op enfileirada antes da hidratação sobrevive, e as do banco também | describe "janela de hidratação": resultado `["antiga", "nova"]`, persistidas primeiro, e o resultado é durável |
| 5 | Sem `indexedDB`, memória, `pronto` resolve `{ idb: false }`, nada pendura | describe "ambiente sem IndexedDB", primeiro teste; `liberado()` também resolve |
| 6 | `open` que lança e `onerror` caem no mesmo caminho | mesmo describe: os dois chamam `aoFalhar(erro, { acao: "abrir" })` e resolvem `{ idb: false }`; `onblocked` idem, sem pendurar |
| 7 | Legado adotado, chave legada apagada só depois da confirmação | describe "migração": adota e apaga após confirmar; com gravação falhando, o legado **permanece** |
| 8 | Banco com valor manda sobre o legado | mesmo describe: o valor do banco vence e a sobra legada é varrida |
| 9 | Falha de gravação chama `aoFalhar` e não derruba o espelho | describe "falha e aviso": `put` falho vira `{ acao: "gravar", chave }` e o espelho segue respondendo; `get` falho vira `{ acao: "ler", chave }` |
| 10 | `assinar` avisa quando muda e cala quando não muda | describe "assinar": avisa uma vez quando a hidratação traz pendência, não avisa quando nada muda, e o cancelamento para o aviso |
| 11 | `AppContext` e `HistoricoNfce` atualizam e cancelam ao desmontar | `AppContext.filaHidratacao.test.jsx` (contador vai a 2 e pendência fiscal a 1 depois da hidratação; assinatura zera no desmonte) e `HistoricoNfce.test.jsx` (o aviso "1 nota ainda não foi emitida" só aparece depois da hidratação; assinatura zera no desmonte) |
| 12 | `mesclarPorUid` com teste próprio | describe "mesclarPorUid": união, ordem, nulo dos dois lados, JSON inválido de cada lado e dos dois, item sem `uid`, valor que não é lista |
| 13 | `npm test` verde e `npm run build` limpo | 235 arquivos, 4148 testes, todos passando; build só com o aviso pré-existente de chunk acima de 2000 kB |
| 14 | ADR-013 reflete o estado novo | seção 1b nova sobre o IndexedDB embaixo do espelho síncrono, negativo da cota trocado pelo da janela de gravação assíncrona, pendência 1 riscada e marcada como fechada na fatia 2 |

### O que a review corrigiu sozinha

1. **Oito testes quebrados em `AppContext.estoqueIdempotencia.test.jsx`.** O arquivo lia e semeava a fila direto no `window.localStorage`, e o `clear()` do `beforeEach` deixou de zerar a fila quando ela saiu de lá. Corrigido expondo `storageFilaOffline` em `filaApp.js` e passando os auxiliares a ler por `filaOffline.listar()` e a semear por `storageFilaOffline.setItem(...)`, mais `filaOffline.limpar()` no `beforeEach`. Nenhuma asserção foi enfraquecida: o teste passou a ler a mesma fila pela API dela, em vez de depender de qual banco está embaixo.
2. **Comentário vencido em `AppContext.jsx:28`,** que ainda descrevia a fila como singleton sobre `localStorage`.
3. **Critério 11 sem teste.** Estava correto no arquivo mas não trancado por nada. Viraram quatro testes, dois de cada lado da costura.

### O que ficou fora, de propósito

- **A janela entre enfileirar e confirmar.** O espelho responde na hora e a gravação no banco vem depois. Fechar a aba dentro dessa janela ainda perde a última op. É a pendência residual registrada no ADR-013, e fechá-la exige a fila virar assíncrona ponta a ponta, o que esta fatia existe justamente para evitar.
- **`snapshot.js` no `localStorage`.** Cache de leitura descartável, fora do escopo.
- **Pendências 2 a 5 do ADR-013** (conflito multi-dispositivo, expiração de JWT offline, realtime degradado, contingência fiscal) seguem abertas.
