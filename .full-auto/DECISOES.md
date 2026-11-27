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

## Execução 2, plano de refatoração, a partir de 2026-11-25

- **D2-01. Branch.** A skill pede `full-auto/<slug>`, mas o ambiente desta sessão exige trabalhar na `ccr-d707a34f-yu3pv6`. Fica a do ambiente. Cada rodada fechada é mesclada na main, como o CLAUDE.md autoriza de forma permanente (rodada fechada = review sem ressalva, suíte verde, build limpo); rodada com migration não é mesclada sem o dono.
- **D2-02. `/ciclo`.** A skill `/ciclo` não está entre as skills disponíveis nesta sessão. Cada tarefa roda o ciclo manualmente, no padrão que o plano já usa: critério de pronto, fotos de referência antes, construção, suíte, lint, build, comparação de telas, revisão em duas etapas (spec e qualidade) a partir do diff, correção até aprovar. Pendência P2-01.
- **D2-03. Uma rodada por tarefa, sem frentes paralelas na fase 5.** As rodadas mexem em CSS compartilhado, no roteiro de fotos e no Supabase falso, que são arquivos únicos; frentes paralelas se sobrescreveriam. Paralelismo fica para quando houver trilhas de fato independentes.
- **D2-04. Emoji do produto (T10) sem migration.** Tirar o campo de emoji da tela e da exibição não exige apagar a coluna `emoji` do banco; ela fica sem uso. Apagar a coluna seria migration em produção, decisão do dono, fica registrada como pendência.
- **D2-05. Defeito antigo achado durante uma rodada de estilo** é registrado na spec e no backlog, não corrigido na mesma rodada, a não ser que esteja nas linhas que a rodada reescreve e a correção seja de uma linha (como o título invisível da 5.21).
- **D2-06. © ® ™ não são emoji.** O contador usava a propriedade Unicode Extended_Pictographic, que inclui ©, ® e ™. São símbolos de texto (o crédito "© OpenStreetMap" é exigido pela licença do mapa); saem da contagem, com teste.
- **D2-07. Observação no cupom: "Obs.:".** O "📝" vira a palavra "Obs.:", a mesma que a sacola do cardápio já usa. Na térmica o emoji saía como um quadrado.
- **D2-08. T08 em duas rodadas.** Avisos, ícones e cupom (5.29); estados vazios, cardápio público e página da Kora (5.30). O emoji do campo do produto e seus reservas ficam na T10.
- **D2-09. O que entra no lugar do emoji do produto.** Onde ele tinha lugar fixo no desenho (coluna, caixa, item de lista), um ícone neutro (`LuPackage`; `LuUtensils` no cartão do delivery sem foto) na cor do tema. Onde vinha antes do nome, nada. O valor no banco fica, sem uso; apagar a coluna é migration e fica com o dono (D2-04).

- 2026-11-26, T11: a prova do white-label usa dois temas, o padrão e `scripts/telas/tema-prova.json`, sem cor em comum. Login e cardápio público sem estabelecimento ficam com o padrão de propósito: não há tenant para dar tema. A cor "Forte" da senha era ciano, que não é token; passou para `--gm-blue`.

- 2026-11-26, fase 6: as rodadas de domínio esvaziam `src/lib/` e `components/desktop/views/` (o "pronto quando" do plano). Telas que já estão em `pages/` (celular, cardápio público) não mudam de lugar nessas rodadas; os guardas de SQL ficam juntos em `src/lib/`; uma aba cujo CSS mora no CSS de outra tela vai junto com essa tela (DeliveryTab fica com Configurações).

- 2026-11-26, fase 6: o plano lista nove domínios, mas o "pronto quando" exige `components/desktop/views/` vazio. Acrescentadas T20a a T20g (cardápio, configurações, Área Admin, cozinha, financeiro, mesas, relatório), antes do roteador. É a leitura mais simples que cumpre o critério do próprio plano.

- 2026-11-26, regra do push com notas: o hook confere os commits de cada push. Por isso a rodada sobe num push só, no fim, com a nota junto; o nome na tela é "Novidades do sistema" (Princípio nº 1), no endereço `/patchnotes` pedido.

- 2026-11-26, T20d, T20e e T20g numa rodada só: domínios pequenos, só mudança de lugar, e cada mesclagem sobe produção; três deploys sem mudança visível não valem. Comparação completa das 209 telas no lugar da comparação por domínio.

- 2026-11-26, T20h acrescentada: o "pronto quando" da fase 6 exige `src/lib/` sem regra de negócio. Jarvas, importação, assinatura, ponte e sessão vão para `features/`; o resto de `src/lib/` é utilidade técnica e de plataforma e fica com o nome atual (renomear para `shared/lib/` mexeria em mais de 140 imports sem ganho).

- 2026-11-26, integração do #32 (decisão do dono): **subprodutos e grupos de escolha convivem.** O #32 trocava os subprodutos pelos grupos de escolha sem converter os combos existentes; a integração mantém os subprodutos (tela, combos e baixa de estoque) e acrescenta os grupos de escolha. Produção: o dono ainda não confirmou se as migrations do #32 estão aplicadas; a integração fica na branch de trabalho até lá.

## 2026-11-27, integração do #32: itens fixos do combo

Os "itens fixos" do #32 (editor "Já vem com") gravavam em `combo_produtos`, a mesma tabela que a
main usa para "Outros produtos" do combo, gravada junto com o combo pela RPC `salvar_combo`. Com as
duas telas, uma apagaria a lista da outra, e o PDV baixaria o estoque desses itens duas vezes (uma
pela baixa de `combo_produtos`, outra pela das escolhas). Ficou a versão da main; o editor de itens
fixos e a camada `comboItensFixos` do #32 saíram. O "Já vem com" do seletor do PDV continua, só para
mostrar, alimentado pelo principal, outros produtos e subprodutos do combo.

Também: o produto principal do combo passou a ser opcional (a migration 20260918 do #32 tira o NOT
NULL), exigido só no modo "substituir"; e entrou um "Preço fixo do combo" opcional que substitui o
total calculado, obrigatório no combo só de grupos de escolha.
