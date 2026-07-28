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
2. **Dois cliques** nele. Abre uma janela preta e o painel no navegador:

   ```
   ┌────────────────────────────────────────────────┐
   │  KORA Ponte — pedidos sem internet e impressão │
   └────────────────────────────────────────────────┘
     Estabelecimento: aguardando — abra o sistema KORA neste PC.
     Painel:          http://localhost:8123
     No celular:      http://192.168.0.42:8123/palm?t=a1b2c3...
     Deixe esta janela aberta (pode minimizar). Para parar: Ctrl+C.
   ```

3. No painel, clique em **Instalar neste computador**. A ponte se copia para
   a pasta do usuário e cria dois atalhos: um na Área de Trabalho e outro na
   Inicialização do Windows — a partir daí ela **abre sozinha** toda vez que
   o PC liga. Não pede senha de administrador.
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

## Como usar no dia a dia

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

**Onde ficam os pedidos?** No próprio PC, em
`%LOCALAPPDATA%\KORA\Ponte\dados\pedidos.json`. Pedidos já confirmados são
apagados automaticamente depois de 24 horas.

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
  `filaImpressao.js` (fila, tentativas, poda) e `vinculo.js` (validação do
  vínculo com o tenant). `lib/impressoras.js` e `lib/instalacao.js` são as
  únicas partes com I/O de sistema.
- Endpoints: `GET /saude`, `GET /palm`, `GET /catalogo` e `POST /pedido`
  (token), `GET /info`, `POST /snapshot`, `GET /pedidos`,
  `POST /pedidos/confirmar`, `GET /impressoras`, `POST /imprimir`,
  `GET /impressao`, `POST /impressao/limpar`, `GET /` (painel),
  `GET /painel/estado`, `POST /vincular`, `POST /instalar` (só localhost).
- **Onde ficam os dados depende de como a ponte roda.** Pelo código
  (`node servidor.js`), em `ponte/dados/` — como sempre foi. Como
  `KoraPonte.exe`, em `%LOCALAPPDATA%\KORA\Ponte\dados\`, porque o sistema de
  arquivos embutido no executável é **somente leitura** e ele pode estar
  rodando de um pen drive. Quem decide é `lib/instalacao.js` (`dirDados`).
  Arquivos: `config.json` (token + vínculo), `snapshot.json` (catálogo),
  `pedidos.json` e `impressao.json`.
- O `.exe` **não guarda credencial nenhuma** — nem chave do Supabase, nem
  senha. Do estabelecimento ele só conhece o UUID e o nome, que chegam pela
  rota `POST /vincular` a partir do app aberto no mesmo PC.
