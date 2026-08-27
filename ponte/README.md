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
   a pasta do usuário, cria o atalho da Área de Trabalho e registra uma
   Tarefa Agendada do Windows — a partir daí ela **sobe sozinha assim que
   alguém entra na conta do PC** (caladinha, sem abrir o navegador) e volta
   sozinha se cair no meio do expediente. Não pede senha de administrador.

   > **Atenção:** ela sobe no *logon*, não no *boot*. Se o PC reiniciar de
   > madrugada e ninguém entrar na conta, a ponte só volta quando alguém
   > entrar. Fazer a ponte subir antes do logon exigiria instalar como
   > administrador, e a instalação é sem UAC de propósito.

   > **Se o painel mostrar o aviso "Liberar o celular no Wi-Fi", clique nele.**
   > É o firewall do Windows barrando a porta da ponte. Sem essa regra o
   > celular do garçom fica rodando e dá "sem conexão", enquanto no PC do
   > caixa tudo parece certo — o bloqueio é silencioso. Esse botão (e só
   > ele) pede confirmação de administrador; a instalação em si não pede. O
   > painel confere sozinho e não mostra o aviso quando a passagem já está
   > aberta.
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

### Como publicar (é daqui que sai o botão de download no app)

O app tem um botão **Baixar o programa** em dois lugares: Configurações →
Impressão → "Impressora e papel" (quando o dono escolhe a impressora térmica)
e a aba "Pedidos sem Internet". Os dois apontam para o mesmo endereço, que vem
da variável `VITE_PONTE_DOWNLOAD_URL` — vazia, os botões nem aparecem e as
telas seguem pedindo o arquivo por fora.

O arquivo mora no bucket público `branding` do Supabase. Ele sobe
**compactado**: o teto de upload do plano gratuito é de 50 MB (Storage →
Settings) e o `.exe` tem ~58 MB, então cru ele é recusado — o zip fica em
~21 MB. Para publicar uma versão nova:

1. `npm run build:exe` (acima) — sai em `ponte/dist/KoraPonte.exe`.
2. Compacte esse `.exe` num `.zip` com o nome **exatamente** `KoraPonte.zip`.
   O `.exe` tem de ficar na raiz do zip, com o nome `KoraPonte.exe` — é ele
   que o dono vê depois de extrair, e é esse nome que as duas telas mandam
   ele clicar. Confira que o zip ficou abaixo de 50 MB; se não ficou, use um
   asset de Release do GitHub (gratuito, teto de 2 GB por arquivo, e como o
   repositório é público o link baixa direto) e aponte a variável para lá.
3. No painel do Supabase: **Storage → `branding` → Upload**, com o nome
   **exatamente** `KoraPonte.zip`, sobrescrevendo o que estiver lá. É o nome
   que mantém o endereço fixo — não coloque a versão no nome do arquivo.
4. Só na primeira vez: copie o endereço público
   `{VITE_SUPABASE_URL}/storage/v1/object/public/branding/KoraPonte.zip`
   para `VITE_PONTE_DOWNLOAD_URL` na Vercel e refaça o deploy.

Escrever no bucket é só pelo painel. A RLS de `storage.objects` está ligada e
não existe nenhuma policy de insert/update/delete para o `branding` — as
únicas policies de storage do projeto são as do `delivery-fotos` —, então nem
`anon` nem `authenticated` gravam ali; só a `service_role`, que é o painel.
Isso é o que impede um estabelecimento de trocar o executável que todos os
outros baixam, e precisa continuar valendo: se um dia o `branding` ganhar
policy de escrita para usuário logado, este arquivo tem de sair dele.

> **Se um dia o arquivo passar a ser publicado cru** (plano pago, ou um `.exe`
> que caiba nos 50 MB), o texto das duas telas precisa mudar junto: hoje elas
> dizem para descompactar antes do duplo clique, e essa frase passaria a
> mandar o dono procurar um zip que não existe.

## Como usar no dia a dia

- **A ponte é invisível.** Ela roda em segundo plano; não tem janela preta,
  não fica na barra de tarefas. Se o PC está ligado, alguém entrou na conta e
  ela foi instalada, ela está trabalhando.
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

**O garçom escaneou o QR e o celular diz "sem conexão".** Se os dois estão
no mesmo Wi-Fi, quase sempre é o firewall do Windows. Abra o painel no PC do
caixa: se aparecer **Liberar o celular no Wi-Fi**, clique e confirme o aviso
do Windows. É a regra que deixa a porta `8123` receber a rede local.

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
- Lógica em `lib/`, com teste ao lado de cada arquivo (`npx vitest run ponte/lib`
  na raiz do repo): `pedidos.js`, `http.js`, `escpos.js` (bytes ESC/POS +
  acentuação CP850), `filaImpressao.js` (fila, tentativas, poda), `vinculo.js`
  (validação do vínculo com o tenant), `corpo.js` (junta os pedaços que chegam
  pela rede **como bytes**, senão um acento partido no meio vira "Jo??o" na
  comanda; teto de tamanho em bytes e promessa que sempre termina),
  `persistencia.js` (tudo que se grava e se lê no disco — falha de disco vira
  erro explicado para a rota responder, em vez de derrubar a ponte) e `pe.js`
  (onde fica o campo `Subsystem` no cabeçalho do `.exe` — usado pelo
  `scripts/semJanela.mjs`). `impressoras.js`, `instalacao.js` e `log.js` são as
  que tocam o sistema (impressora, PowerShell, atalhos, disco).
- **Sem console.** O `.exe` é GUI subsystem: `console.log` não vai para lugar
  nenhum. Todo registro passa por `lib/log.js` (`logar` / `logarErro`), que
  grava em `<dirDados>/ponte.log`, mascara segredos (`?t=…`, hex longo) antes
  de escrever e nunca lança exceção. Rodando pelo Node (dev), ele também ecoa
  no terminal.
- **Um erro não derruba a ponte.** Cada requisição é atendida dentro de
  `try/catch`, e o processo registra `uncaughtException` e `unhandledRejection`
  (`servidor.js`) — o tropeço vai para o `ponte.log` e a ponte continua no ar.
  No Node 24 uma promessa rejeitada sem dono **encerra o processo** por padrão:
  sem esse par de handlers, um pedido torto no meio do movimento fechava a
  ponte inteira, sem janela nem aviso para ninguém perceber.
- **Como se para/reabre**: `POST /parar` (só localhost) responde 200 e encerra
  logo depois; é o botão *Parar a ponte* do painel. Abrir o `.exe` com a porta
  já ocupada (`EADDRINUSE`) não é erro: ele registra no log, abre o painel da
  instância que já estava no ar e sai com código 0. Já um erro fatal de
  verdade, quando o programa foi aberto **na mão**, gera
  `<dirDados>/ponte-nao-abriu.html` e abre essa página no navegador — sem essa
  página o dono não veria nada, já que não há janela. Com `--autostart` (só o
  atalho da Inicialização leva esse argumento) nada é aberto no navegador,
  nem o painel nem o aviso — é ele que a Tarefa Agendada (e, em instalações
  antigas, o atalho da Inicialização) passa para a ponte.
- Endpoints: `GET /saude`, `GET /palm`, `GET /catalogo` e `POST /pedido`
  (token), `GET /info`, `POST /snapshot`, `GET /pedidos`,
  `POST /pedidos/confirmar`, `GET /impressoras`, `POST /imprimir`,
  `GET /impressao`, `POST /impressao/limpar`, `GET /` (painel),
  `GET /painel/estado`, `POST /vincular`, `POST /origem/esquecer` (solta o
  endereço do app fixado no primeiro vínculo — serve quando o
  estabelecimento troca de domínio), `POST /instalar`,
  `POST /firewall/liberar` (cria a regra do firewall para a porta; o Windows
  ainda pergunta ao dono), `POST /autostart/desligar` (desfaz a abertura
  automática) e `POST /parar` (só localhost).
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
