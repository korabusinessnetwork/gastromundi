# Importador de Cardápio — bot standalone

Bot **fora do sistema web** que importa cardápio (produtos) de planilhas
**CSV/XLSX** para o KORA. Ele vigia uma pasta: você (ou o cliente) solta a
planilha lá e o bot importa sozinho, movendo o arquivo para `processados/`
(ou `erros/`) e escrevendo um log do que entrou.

Por baixo, o bot **reusa exatamente a mesma validação e idempotência do app
web** (`src/lib/importacao`): mesma tolerância a Excel BR (acento/`;`/`R$`),
mesmo dedupe, mesma proteção contra CSV injection e o mesmo "rodar 2x não
duplica". Ele só troca o transporte — lê do disco e grava com o próprio login.

## Por que é seguro (mesmo modelo do app)

- O bot **faz login como um usuário real** do seu estabelecimento
  (`signInWithPassword`). A partir daí toda escrita passa pela **RLS** com o
  tenant vindo do **JWT** — o bot **nunca** usa service key nem decide o tenant.
- `SUPABASE_URL`/`SUPABASE_ANON_KEY` são **públicos** (a mesma chave anon já
  embarcada no app). O que é sensível é o `BOT_PASSWORD` — trate o `.env` como
  senha. Recomendado: criar um **usuário dedicado só para importação**.
- Nenhum segredo no código: tudo vem de variável de ambiente (`.env`).

## Instalação

Pré-requisito: Node.js 18+ instalado. Dentro desta pasta:

```bash
npm install
cp .env.example .env
```

Edite o `.env` com a URL/anon key do projeto (as mesmas do `.env.local` do app)
e o e-mail/senha do usuário que vai gravar. Veja `.env.example`.

## Uso

**Modo pasta (padrão)** — fica vigiando e importa o que aparecer:

```bash
npm start
```

Solte `cardapio.csv` (ou `.xlsx`) dentro da pasta `entrada/`. O bot importa e
move para `entrada/processados/`. Se algo falhar, vai para `entrada/erros/`.
Linhas inválidas de uma planilha são reportadas no log e **puladas** — as
linhas boas entram normalmente (igual ao wizard do app). `Ctrl+C` para sair.

**Modo avulso** — importa um arquivo e sai:

```bash
npm run once -- ./caminho/para/cardapio.csv
```

### Formato da planilha

O mesmo modelo do app: colunas `nome;preco;categoria;emoji;ativo;unidade`
(só `nome`, `preco` e `categoria` são obrigatórias). O jeito mais fácil de ter
um arquivo válido é **exportar o cardápio pelo próprio app** (aba
Importar/Exportar) e usar como base.

## Gerar o `.exe` (opcional)

Para rodar em uma máquina **sem Node instalado**, empacote com
[`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg) (gratuito):

```bash
npm install
npm run build:exe
```

Sai em `dist/importador-cardapio.exe`. Coloque o `.env` **ao lado do .exe**.

Observações honestas:

- **SmartScreen do Windows**: como o `.exe` não é assinado, o Windows pode
  mostrar um aviso ("Windows protegeu seu PC" → "Mais informações" →
  "Executar assim mesmo"). Sumir com esse aviso exige um **certificado de
  assinatura de código pago (~US$ 200–400/ano)** — decisão adiada por padrão
  (fase de bootstrap), igual ao QZ Tray silencioso. Como CLI, roda bem com o
  aviso.
- O empacotamento é feito por você (a máquina de build baixa o runtime do
  Node). Se `npm run build:exe` não puder rodar no seu ambiente, roda numa
  máquina local com Node/allow de rede.

## Testes

```bash
npm test
```

Cobre os helpers próprios do bot (`node --test`, sem dependência externa). As
regras pesadas de validação/idempotência já são testadas no app, em
`src/lib/importacao/*.test.js`, e são **as mesmas** aqui (reuso, não cópia).

## O que este bot NÃO faz (por enquanto)

- **Só produtos (cardápio).** Clientes e estoque ficam no wizard do app.
- **Não remove/desativa** produto que sumiu da planilha (modelo *merge*, igual
  ao app): ele cria e atualiza, nunca apaga.
- Precisa de internet (a gravação é no Supabase). O ganho aqui é automação de
  pasta, não operação offline.
