# KORA Ponte — pedidos sem internet

Programinha **gratuito** que roda no PC do caixa. Quando a internet cai, o
celular (Palm) continua mandando pedidos pelo **Wi-Fi do estabelecimento** —
o pedido chega no caixa e sai na impressora na hora. Quando a internet
volta, o app do caixa sincroniza tudo sozinho (fila offline).

```
Celular (Wi-Fi) ──► Ponte (PC do caixa) ◄── App do caixa (localhost)
                                │
                                └──► Impressora (pelo app do caixa)
```

## Instalação (uma vez só)

É **um arquivo só**: `KoraPonte.exe`. Não precisa instalar Node, nem copiar
pasta, nem digitar comando — o Node vai dentro do próprio programa.

1. Copie o `KoraPonte.exe` para o PC do caixa (pode ser pen drive, e-mail,
   pasta de Downloads — tanto faz).
2. **Dois cliques** nele. A ponte **não abre janela nenhuma**: ela fica
   trabalhando em segundo plano, como uma impressora que fica ligada. O que
   aparece é o **painel no navegador** — é ele a janela de controle da ponte
   (endereço `http://localhost:8123`).
3. No painel, clique em **Instalar neste computador**. A ponte se copia para
   a pasta do usuário e cria dois atalhos: um na Área de Trabalho e outro na
   Inicialização do Windows — a partir daí ela **abre sozinha** toda vez que
   o PC liga (aí sim, caladinha, sem abrir o navegador). Não pede senha de
   administrador.
4. Abra o sistema KORA nesse mesmo PC e faça login. **Pronto**: a ponte se
   vincula sozinha ao estabelecimento, sem ninguém digitar código nenhum.

> **Aviso do Windows na primeira vez.** Como o programa não tem certificado
> de assinatura (custa caro e não muda nada no funcionamento), pode aparecer
> "O Windows protegeu o seu computador". Clique em **Mais informações** →
> **Executar assim mesmo**. Só acontece na primeira execução.

Passo a passo completo, com o que fazer quando dá errado: [`INSTALACAO.md`](INSTALACAO.md).

### Como gerar o `.exe` (só quem desenvolve)

```
cd ponte
npm install
npm run build:exe
```

Sai em `ponte/dist/KoraPonte.exe` (~58 MB — leva o Node inteiro dentro).
O `palm.html` e o `painel.html` entram **dentro** do executável (`pkg.assets`),
por isso ele roda sozinho numa pasta vazia.

O `build:exe` tem **dois passos**: o `pkg` gera o `.exe` e, em seguida,
`node scripts/semJanela.mjs dist/KoraPonte.exe` troca 2 bytes do cabeçalho do
executável (campo `Subsystem` do PE: `3` = console → `2` = janela) para que ele
**não abra a janela preta**. Sem esse passo o `pkg` sempre entrega um programa
de console. O script confere a assinatura do arquivo antes de escrever, é
idempotente (rodar de novo não faz nada) e falha alto se o arquivo não for um
`.exe` 64-bit — a lógica pura fica em `lib/pe.js`, com testes.

## Como usar no dia a dia

- **A ponte é invisível.** Ela roda em segundo plano; não tem janela preta,
  não fica na barra de tarefas. Se o PC está ligado e ela foi instalada, ela
  está trabalhando.
- **O painel é a janela de controle.** Clique no atalho **KORA Ponte** da Área
  de Trabalho a qualquer momento: ele abre `http://localhost:8123` no
  navegador e mostra se está ligada, a qual estabelecimento está vinculada,
  quantos pedidos e quantas impressões estão na fila. Se a ponte já estiver
  aberta, o atalho só traz o painel dela — nunca abre uma segunda cópia.
- **Para parar**, use o botão **Parar a ponte** no fim do painel (ele pergunta
  "Tem certeza?" antes). Para voltar, é o mesmo atalho da Área de Trabalho.
- **Com internet**: nada muda. O app do caixa detecta a ponte sozinho e
  mantém o catálogo dela atualizado.
- **No app do caixa**: em *Configurações → Impressão → Pedidos sem Internet*
  aparece o **QR code** — cada celular da equipe escaneia **uma vez** e salva
  o link na tela inicial.
- **Sem internet**: o garçom abre o link salvo (ou escaneia o QR), monta o
  pedido e envia. O pedido chega no caixa e imprime normalmente.

## Perguntas frequentes

**Precisa pagar alguma coisa?** Não. Zero custo, zero mensalidade — é um
programa gratuito rodando no PC que já existe.

**Preciso digitar algum código para ligar ao meu estabelecimento?** Não. É o
mesmo `KoraPonte.exe` para todo mundo; quem diz de quem ele é são as
Configurações do sistema KORA aberto naquele PC. Se o PC mudar de dono ou de
loja, é só abrir o sistema com o novo login — a ponte se revincula sozinha.

**O celular precisa de internet?** Não — só precisa estar no **mesmo Wi-Fi**
do PC do caixa.

**E se o Wi-Fi cair junto?** A ponte usa a rede local do roteador, que
continua funcionando mesmo sem internet. Se o próprio roteador desligar,
aí não há rede — religue o roteador.

**Qualquer pessoa no Wi-Fi consegue mandar pedido?** Não. O link tem um
**código secreto** (o `?t=...`) que nasce no primeiro uso e fica só no PC do
caixa. E as telas de gerência (painel, vínculo, instalação, impressão) só
respondem no próprio PC — de outro aparelho da rede, a ponte devolve 403.

**A porta 8123 está ocupada?** O app do caixa só procura a ponte na porta
padrão, então trocar a porta é coisa de desenvolvimento
(`KORA_PONTE_PORTA=8200`). Se der conflito no PC do caixa, avise o suporte.

**Como sei que ela está rodando, se não tem janela?** Clique no atalho **KORA
Ponte** da Área de Trabalho: se o painel abrir dizendo *Ponte ligada*, está
tudo certo. Se abrir dizendo *Ponte parada*, clique no atalho de novo.

**Fechei sem querer / preciso parar.** Só dá para parar pelo botão **Parar a
ponte**, no fim do painel — e ele pergunta antes de parar mesmo. Não tem mais
janela para fechar por engano.

**Onde ficam os pedidos?** No próprio PC, em
`%LOCALAPPDATA%\KORA\Ponte\dados\pedidos.json`. Pedidos já confirmados são
apagados automaticamente depois de 24 horas.

**E se eu precisar mostrar ao suporte o que aconteceu?** Na mesma pasta fica o
`ponte.log` (`%LOCALAPPDATA%\KORA\Ponte\dados\ponte.log`): é o diário da ponte
— o que ela imprimiu, o que falhou, quando ligou e quando parou. Ele se limita
sozinho a ~256 KB (a geração anterior vira `ponte.log.1`) e **nunca guarda o
código secreto** do link do celular.

## Impressão (a ponte imprime sozinha)

A ponte também **fala direto com a impressora térmica**, sem instalar nada
além do Node — é o papel que antes exigia o QZ Tray (programa pago). O app
do caixa manda as linhas já prontas; a ponte converte para ESC/POS, imprime
e corta o papel.

**Dois tipos de impressora:**

| Tipo | Quando usar | O que informar |
| --- | --- | --- |
| `windows` | Impressora **instalada no Windows** (USB, compartilhada) | o nome exato que aparece em *Dispositivos e Impressoras* |
| `rede` | Impressora com **IP próprio** (Ethernet/Wi-Fi) | o IP e, se for diferente do padrão, a porta (padrão `9100`) |

**Se a impressora estiver ocupada, sem papel ou desligada, nada se perde.**
O trabalho fica guardado no PC do caixa (`dados/impressao.json`) e a ponte
tenta de novo sozinha: 5 segundos, 15 segundos e depois de minuto em minuto,
até 5 tentativas. Assim que a impressora voltar, a comanda sai.

**Quando um trabalho falha de vez** (as 5 tentativas acabaram), ele fica com
o estado `falhou` e a mensagem do erro na lista (`GET /impressao`). O que
fazer: resolver o problema na impressora (papel, cabo, ligar), mandar
imprimir de novo pelo app e, se quiser limpar o histórico,
`POST /impressao/limpar` (só apaga o que já terminou — nunca o que ainda
vai imprimir).

### Endpoints de impressão (só no PC do caixa)

| Rota | O que faz |
| --- | --- |
| `GET /impressoras` | Lista as impressoras instaladas no Windows (`{ impressoras: [{ nome, padrao }] }`) |
| `POST /imprimir` | Põe um documento na fila. Corpo: `{ destino, linhas: ["..."], cortaPapel?: true, copias?: 1 }`. Responde `202 { id }` |
| `GET /impressao` | Mostra a fila e o histórico (`{ trabalhos, pendentes }`) |
| `POST /impressao/limpar` | Apaga da fila os trabalhos já concluídos/falhados |

Exemplos de `destino`:

```json
{ "tipo": "windows", "nome": "EPSON TM-T20" }
{ "tipo": "rede", "host": "192.168.0.50", "porta": 9100 }
```

> Essas rotas só respondem em `localhost`. Ninguém no Wi-Fi consegue acionar
> a impressora — o celular manda **pedido**, quem manda **imprimir** é o caixa.

## Para desenvolvedores

- Zero dependências — só Node puro (`node:http`, `node:fs`, `node:net` etc.).
  A impressão RAW no Windows usa o PowerShell que já vem no sistema.
- Lógica pura em `lib/` com testes (`npx vitest run ponte/lib` na raiz do repo):
  `pedidos.js`, `http.js`, `escpos.js` (bytes ESC/POS + acentuação CP850),
  `filaImpressao.js` (fila, tentativas, poda), `vinculo.js` (validação do
  vínculo com o tenant) e `pe.js` (onde fica o campo `Subsystem` no cabeçalho
  do `.exe` — usado pelo `scripts/semJanela.mjs`). `lib/impressoras.js`,
  `lib/instalacao.js` e `lib/log.js` são as partes com I/O de sistema.
- **Sem console.** O `.exe` é GUI subsystem: `console.log` não vai para lugar
  nenhum. Todo registro passa por `lib/log.js` (`logar` / `logarErro`), que
  grava em `<dirDados>/ponte.log`, mascara segredos (`?t=…`, hex longo) antes
  de escrever e nunca lança exceção. Rodando pelo Node (dev), ele também ecoa
  no terminal.
- **Como se para/reabre**: `POST /parar` (só localhost) responde 200 e encerra
  logo depois; é o botão *Parar a ponte* do painel. Abrir o `.exe` com a porta
  já ocupada (`EADDRINUSE`) não é erro: ele registra no log, abre o painel da
  instância que já estava no ar e sai com código 0. Já um erro fatal de
  verdade, quando o programa foi aberto **na mão**, gera
  `<dirDados>/ponte-nao-abriu.html` e abre essa página no navegador — sem essa
  página o dono não veria nada, já que não há janela. Com `--autostart` (só o
  atalho da Inicialização leva esse argumento) nada é aberto no navegador,
  nem o painel nem o aviso.
- Endpoints: `GET /saude`, `GET /palm`, `GET /catalogo` e `POST /pedido`
  (token), `GET /info`, `POST /snapshot`, `GET /pedidos`,
  `POST /pedidos/confirmar`, `GET /impressoras`, `POST /imprimir`,
  `GET /impressao`, `POST /impressao/limpar`, `GET /` (painel),
  `GET /painel/estado`, `POST /vincular`, `POST /instalar`, `POST /parar`
  (só localhost).
- **Onde ficam os dados depende de como a ponte roda.** Pelo código
  (`node servidor.js`), em `ponte/dados/` — como sempre foi. Como
  `KoraPonte.exe`, em `%LOCALAPPDATA%\KORA\Ponte\dados\`, porque o sistema de
  arquivos embutido no executável é **somente leitura** e ele pode estar
  rodando de um pen drive. Quem decide é `lib/instalacao.js` (`dirDados`).
  Arquivos: `config.json` (token + vínculo), `snapshot.json` (catálogo),
  `pedidos.json`, `impressao.json` e `ponte.log` (+ `ponte.log.1`).
- O `.exe` **não guarda credencial nenhuma** — nem chave do Supabase, nem
  senha. Do estabelecimento ele só conhece o UUID e o nome, que chegam pela
  rota `POST /vincular` a partir do app aberto no mesmo PC.
