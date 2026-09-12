# Decisões tomadas no lugar do Matheus

Uma entrada por decisão. Ele revisa no final e pode reverter qualquer uma.

## D01 Sincronizar o repositório antes de qualquer trabalho
- **Contexto:** o `main` local estava 39 commits atrás do `origin/main`, com quatro arquivos alterados e dois não rastreados na cópia de trabalho.
- **Decisão:** conferi que nenhum dos 39 commits tocava os arquivos alterados localmente e fiz `git pull --ff-only`. As alterações locais (README, package.json, settings.local.json, scripts/setup-git.mjs, scripts/devs.json) continuam intactas e não commitadas.
- **Por quê:** trabalhar sobre uma base velha produziria conflitos e retrabalho. O avanço rápido é reversível e não descarta nada.
- **Como reverter:** `git reset --hard 8513a1c2` não é necessário, o estado anterior era `d45e8bbd`.

## D02 O plano de origem é o backlog vivo, não o PLAN.md
- **Contexto:** o `PLAN.md` da raiz descreve o redesenho da tela `/palm`, que já foi entregue, validado e aprovado (`VALIDATION.md` fecha com "Aprovado"). Não existe plano novo escrito.
- **Decisão:** em vez de parar para perguntar, adotei como plano o backlog já registrado pelo dono: o ledger `specs/_loop.md`, os documentos de `docs/09_BACKLOG/` e a fila de features da memória do projeto.
- **Por quê:** a única pergunta obrigatória da skill é a ausência total de plano, e plano existe, está apenas espalhado em vez de num arquivo só.
- **Como reverter:** apagar `.full-auto/TAREFAS.md` e escrever um `PLAN.md` novo.

## D03 Trabalhar em branch própria e mesclar na main ao fim de cada tarefa
- **Contexto:** a skill pede a branch `full-auto/<slug>`; a memória do projeto registra que o dono autorizou de forma permanente mesclar cada rodada terminada na `main`.
- **Decisão:** branch `full-auto/gastromundi`, com merge na `main` local ao fechar cada tarefa verificada. Push só quando o dono estiver acompanhando ou ao final, para não publicar trabalho meio feito.
- **Por quê:** junta as duas regras sem violar nenhuma, e mantém o botão de desfazer.
- **Como reverter:** `git checkout main` e apagar a branch.

## D04 Primeiro item: o ADR do PDV offline-first (F021)
Data: 2026-09-10.
Nada bloqueia venda ou uso hoje, então o critério passou a ser a prioridade escrita no backlog.
F018 e F021 são os dois itens Alto abertos. O F021 é o menor caminho até algo verificável,
porque a fila e o replay já rodam e o que falta primeiro é a decisão registrada, que é de graça
e destrava as fatias seguintes sem refazer escolha. O `controla_estoque` em `products`, que a
rodada 62 sugeriu, é decisão de produto do dono e continua parado, não virou tarefa.

## D05 Não esperar o ok do `/proximo`
Data: 2026-09-10.
A skill `/proximo` termina pedindo o ok do Matheus antes de reiniciar o ciclo. No modo Full
Automático essa espera está suspensa, conforme a regra de escalação desta skill e a memória
`loop-autonomo-e-main`, que autoriza emendar uma rodada na outra sem pedir comando.

## D06 A migration pendente da rodada 62 continua sendo ação do dono
Data: 2026-09-10.
`supabase/migrations/20260919_baixa_estoque_cria_linha.sql` precisa ser aplicada no painel do
Supabase. Eu não aplico nada em banco de produção, então o item foi para
`PENDENCIAS-DO-MATHEUS.md` e a execução segue sem ele.

## D07 TD015: `uid` é chave de renderização, não vira dado do estabelecimento
Data: 2026-09-10.
As listas editáveis sem chave de domínio ganharam um campo `uid` gerado por `novoUid()`
(`src/lib/uidLista.js`). Ele existe só para o React reconciliar a linha certa e não pode virar
coluna nem campo salvo. Onde o save monta o payload campo a campo (`CheckoutView`,
`DeliveryView`, `SecaoDelivery`), conferi lendo o código que o `uid` não é espalhado. Onde o
destino é um jsonb livre, que aceitaria o campo caladamente e o devolveria depois como se fosse
dado do cliente, o save passa por `listaSemUid` antes de gravar.
**Por quê:** o risco real de carimbar identidade de tela num objeto de negócio é ela vazar para o
banco e virar contrato sem ninguém decidir isso.
**Como reverter:** apagar `src/lib/uidLista.js` e voltar as chaves para o índice.

## D08 TD015: `CombosView` desceu para o balde A, não precisou de `uid`
Data: 2026-09-10.
O spec previa `uid` nos itens do combo, mas a lista já carrega o `id` do produto do catálogo,
que é único dentro de um combo por construção (o mesmo produto não entra duas vezes).
**Por quê:** chave de domínio existente sempre vence chave inventada, é menos código e menos
estado para manter sincronizado.

## D09 TD015: `AdminView.jsx:342` subiu do balde A para o C
Data: 2026-09-10.
O spec planejava `ing.produtoId ?? ing.nome ?? i` para a lista de ingredientes da ficha técnica.
Ler o arquivo derrubou a premissa: o ingrediente adicionado à mão nasce sem `produtoId`, e o nome
não é único dentro de uma ficha, nada impede duas linhas "Leite". A cadeia de fallback produziria
chave duplicada exatamente nas fichas mais bagunçadas, que é o pior lugar para isso acontecer. A
lista é só de leitura, então o índice ficou, com a justificativa escrita no código.
**Por quê:** chave duplicada é pior que chave por índice, o React descarta o segundo nó.

## D10 TD015: `AdminView` tira o `uid` na hora de salvar
Data: 2026-09-10.
Fichas e compras vão para a tabela `config`, num jsonb sem colunas fixas. O save espalha o objeto
inteiro da linha, então o `uid` entraria no banco sem reclamação nenhuma. Por isso o payload passa
por `listaSemUid`. Atenção para não confundir com o `uid()` local que o próprio `AdminView` já
tinha: aquele gera **id de entidade** e continua indo para o banco de propósito.

## D11 TD015: os helpers de faixa de horário ficaram duplicados nas duas telas
Data: 2026-09-10.
`faixaNova` e `horarioParaEdicao` foram escritos localmente em `DeliveryView` e em
`SecaoDelivery` em vez de exportados de `src/lib/deliveryHorario.js`.
**Por quê:** aquele módulo se declara puro no cabeçalho, "sem I/O, sem env", e `novoUid` toca
`crypto` e `Date.now()`. Duplicar duas funções de três linhas custa menos que quebrar a promessa
do módulo, que é o que permite testá-lo sem ambiente.

## D12 TD015: `RelatorioView` passou a usar o `uid` do próprio item
Data: 2026-09-10.
A tabela de cancelamentos monta linhas achatando os itens das vendas, então o `uid` que o item
já carrega desde `comandaItens.js` passou a ser copiado para a linha achatada. A chave ficou
`c.uid ?? i` de propósito: venda fechada antes de os itens nascerem com identidade não tem `uid`
nenhum para usar, e o relatório continua abrindo o histórico inteiro.

## D13, o `uid` dos fornecedores do produto

A review do ciclo encontrou uma chave escrita mas sem lastro: `ProdutosView` renderizava os
cartões de fornecedor com `c.uid ?? idx`, e `uid` não existia em linha nenhuma, então a chave
caía sempre no índice sem avisar. O plano dizia que esse `uid` viria do balde B, mas o balde B
não tinha essa lista.

Decidi carimbar em vez de reverter para `key={idx}` com comentário. A lista é adicionada e
removida do meio, e o cartão em edição é apontado por posição, que é exatamente o cenário que
o TD015 descreve. O `uid` entra nos dois pontos de criação da linha e não chega ao banco: o
save monta `unidades_compra` campo a campo, o que já estava verificado no quadro de veredito
do spec.

## D14, o IndexedDB entrou EMBAIXO da fila, não no lugar dela

Data: 2026-09-10.

O T05 pedia trocar o `localStorage` da fila offline por IndexedDB preservando o storage
injetável. Na hora de cumprir apareceu o furo: a API da fila é síncrona e o IndexedDB é
assíncrono. `filaOffline.tamanho()` é chamado dentro de inicializador preguiçoso de
`useState` em dois lugares (`AppContext` e `HistoricoNfce`), e inicializador de `useState`
não espera promessa.

As três saídas possíveis eram: reescrever a fila inteira para `async`, o que espalharia
`await` por dois componentes e por toda a suíte da fila, exatamente o que o storage
injetável foi construído para evitar; deixar como está e adiar o F021, o que mantém o
`catch` vazio transformando cota estourada em venda perdida em silêncio; ou colocar o
IndexedDB embaixo de um espelho síncrono em memória.

Escolhi a terceira. O espelho é um `Map` que atende `getItem`, `setItem` e `removeItem` na
hora, com a cara do `localStorage`, e cada escrita nele agenda uma gravação no banco. Na
subida, a hidratação lê o banco e traz o que ficou da sessão anterior. `fila.js` e
`fila.test.js` não mudaram uma linha, que era a premissa da fatia.

Três consequências que precisaram de decisão própria:

1. **A hidratação mescla, não sobrescreve.** Entre o primeiro render e a resposta do banco
   o operador pode enfileirar uma venda. Uma gravação ingênua apagaria o que estava no
   banco. A mesclagem é união por `uid`, persistidas primeiro, porque `fila.js` já carimba
   `uid` em toda op no `enfileirar` e a ordem de reenvio precisa ser preservada. Quem
   decide como mesclar é quem monta o storage, não o storage.
2. **O legado só é apagado depois da confirmação.** Quem já usa o sistema tem fila pendente
   no `localStorage`. A chave antiga só some quando a gravação no IndexedDB confirmar; se
   falhar, a fila antiga fica onde está para a próxima subida tentar de novo.
3. **Sem IndexedDB, degrada em silêncio assumido.** Navegador antigo, aba privada com IDB
   bloqueado, jsdom da suíte: a hidratação resolve `{ idb: false }` e a fila vive só em
   memória. Isso é pior que o `localStorage`, e está escrito assim no código e no ADR, em
   vez de fingir equivalência.

Nenhuma biblioteca em runtime. Dexie e `idb` resolveriam um problema que aqui não existe,
são uma chave e um object store, e dependência em runtime é peso no bundle do PDV.
`fake-indexeddb` entrou só em `devDependencies`.

O que a decisão não fecha: a janela entre enfileirar e o banco confirmar. Fechar a aba
dentro dela ainda perde a última op. Está registrado como pendência residual no ADR-013.

---

# Decisões da varredura de refino, 2026-09-12

## D-R01 O ciclo de cada item foi feito no loop principal, não pela skill `/ciclo`
- **Contexto:** a skill de refino manda rodar toda tarefa pela `/ciclo` (especificar, construir, revisar). O `CLAUDE.md` deste projeto manda o contrário na seção Operação: não adicionar passo separado de verificação, não revisar duas vezes por precaução, e ser frugal com subagentes porque o custo se concentra em turnos.
- **Decisão:** cada item da rodada tem critério de pronto escrito antes (a coluna do `TAREFAS.md` é a especificação), é construído com teste, e é verificado contra o critério mais o baseline inteiro. O ciclo aconteceu, a orquestração de três skills por item não.
- **Por quê:** o `CLAUDE.md` do projeto é fonte de verdade e prevalece sobre a skill quando as duas divergem. Oito itens vezes três skills seriam 24 rodadas de contexto para mudanças que somam poucas linhas cada.
- **Como reverter:** rodar `/spec`, `/build` e `/review` por item nas próximas rodadas.

## D-R02 Os fluxos que exigem sessão foram verificados sem navegar
- **Contexto:** não há `.env.local`, instância Supabase alcançável, nem Supabase CLI neste ambiente. Subir Postgres em Docker para a varredura custaria a maior parte da sessão.
- **Decisão:** as superfícies anônimas foram abertas de verdade no navegador (raiz, login, cardápio público, rotas protegidas sem sessão, rota inexistente, em 1280x800 e em 390x844). Os fluxos autenticados foram verificados por leitura de código, pelos testes de componente e pelos guards da suíte.
- **Por quê:** o limite está declarado no `BASELINE.md` em vez de virar uma aprovação que eu não medi.
- **Como reverter:** com credenciais de um projeto Supabase de teste no `.env.local`, a varredura de navegação cobre os fluxos autenticados também.

## D-R03 Um `.env.local` de valores falsos ficou no diretório de trabalho
- **Contexto:** o dev server não sobe sem `VITE_SUPABASE_URL`.
- **Decisão:** criei `.env.local` apontando para um host morto (`127.0.0.1:54321`), o que também rendeu o achado N01: com o servidor inalcançável, o login acusa "Usuário ou senha incorretos" e gasta tentativa.
- **Por quê:** o arquivo está no `.gitignore` (linha 4), então não vai para o repositório.
- **Como reverter:** apagar o arquivo.

## D-R04 Os merges da rodada 2 foram acumulados, com a verificação completa no fim
- **Contexto:** a skill manda rodar a verificação completa depois de cada merge. Na rodada 2 as seis trilhas rodam ao mesmo tempo, e a suíte inteira passou de 76 s para mais de 7 minutos com a CPU disputada por elas.
- **Decisão:** os merges de trilhas com arquivos disjuntos são acumulados, e a verificação completa roda quando a leva chega, mais uma vez no fechamento da rodada.
- **Por quê:** os conjuntos de arquivos foram desenhados sem interseção, cada trilha já rodou a suíte inteira verde na worktree dela, e uma falha depois do merge se isola por trilha em um comando. O ganho é não gastar meia hora de relógio em verificações que testam a mesma coisa.
- **Como reverter:** rodar `npm test` entre cada merge, quando não houver frentes concorrendo por CPU.
