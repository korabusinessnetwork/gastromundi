# Segurança

Esta pasta cobre a segurança do GastroMundi em duas frentes que não se confundem:

1. **O que o código precisa ter** (validação de input, RLS, segredo fora do repositório,
   campos explícitos em tabela sensível). Isso está no `CLAUDE.md`, seção Segurança, e em
   `memory/restrictions.md`.
2. **O que o agente que escreve o código precisa ter em volta dele.** É o assunto deste
   documento.

## Princípio

Quem escreveu o código não é bom revisor do próprio código. Vale para humano e vale para
IA. Então o projeto roda com um revisor que não participou da escrita, e com um portão
antes de instalar qualquer coisa de terceiro.

Regra de custo (fase de bootstrap, ver `memory/restrictions.md`): nesta camada só entra o
que é gratuito e roda sozinho. Ferramenta que consome token por execução fica fora do
default e vira decisão explícita do dono.

## A camada instalada

| Ferramenta | Origem | O que faz | Onde vive |
|------------|--------|-----------|-----------|
| `security-guidance` | Anthropic, oficial | Revisa a mudança que o próprio Claude acabou de fazer, em três pontos: regex no edit, review do diff no fim do turno, review agêntico no commit | Escopo de usuário (`~/.claude`), não versionado |
| `skillspector` | NVIDIA, Apache 2.0 | Escaneia skill ou plugin de terceiro **antes** de instalar: prompt injection, exfiltração, supply chain | CLI do sistema (`uv tool install`), não versionado |
| `vibesec` | BehiSecc, comunidade | Contexto de código seguro para web no agente: IDOR, XSS, SSRF, SQLi, JWT, mass assignment | `.claude/skills/vibesec/`, versionado no repo |

Decisão registrada em [ADR-014](../08_DECISOES/adr-014.md), que também lista o que ficou
deliberadamente de fora por consumir token.

### Como reinstalar numa máquina nova

O `vibesec` vem junto com o clone do repositório, não precisa de nada. Os outros dois são
por máquina:

```
claude plugin marketplace add anthropics/claude-plugins-official
claude plugin install security-guidance@claude-plugins-official --scope user
uv tool install git+https://github.com/NVIDIA/skillspector.git
```

Pré-requisitos: Claude Code 2.1.144 ou maior, Python 3.8 ou maior no PATH, repositório git,
e `uv` instalado. Kill switch do `security-guidance` por projeto: `SECURITY_GUIDANCE_DISABLE=1`.

### O portão do SkillSpector

Nenhuma skill ou plugin de terceiro entra no projeto sem `skillspector scan` antes. Isso
está como restrição permanente em `memory/restrictions.md`.

```
skillspector scan <pasta-da-skill> --no-llm
```

Só o modo estático, que não precisa de chave de LLM. O estágio semântico precisa de chave e
custa token: use apenas quando o estático levantar algo ambíguo, e avise o dono antes.

**O score sozinho não decide.** O scanner casa palavra-chave, então guia defensivo de
segurança levanta achado alto por citar `rm -rf /` ou `/etc/passwd` dentro de uma tabela de
ataques documentados. Leia o achado, confira o trecho citado, e registre a conclusão. O que
nunca pode acontecer é instalar sem olhar.

## O que o primeiro diagnóstico fechou

Varredura de leitura feita com o VibeSec carregado, nas rotas autenticadas e nas
chamadas ao Supabase. As correções e o que cobra cada uma:

| O que era | Onde | O que cobra agora |
|-----------|------|-------------------|
| `.select()` sem argumento nas escritas em `users`, que é `select *` em tabela sensível | `src/context/AppContext.jsx` | colunas explícitas (`colunasRetornoUsers`) |
| `insert`/`update` recebendo o objeto inteiro do chamador | `users` e `pending`, mesmo arquivo | allowlist em `src/lib/camposPermitidos.js`, com teste |
| `Access-Control-Allow-Origin: "*"` nas 9 Edge Functions | `supabase/functions/*/index.ts` | `_shared/cors.ts` mais `src/lib/functionsCors.test.js` |
| erro cru no `console` no caminho do pagamento | `PDVView/index.jsx`, `useFinalizarPagamento.js` | `resumoErro` mais `src/lib/consolePagamentoGuard.test.js` |
| SVG injetado por `dangerouslySetInnerHTML` sem conferência de forma | `src/lib/qrCodeSvg.js` | `svgSeguro`, com teste |

Três observações que valem mais que a tabela:

1. **CORS aqui não é autenticação, e o aperto é opcional por decisão.** Estas
   funções autorizam pelo cabeçalho `Authorization`, que o navegador não manda
   sozinho para outra origem, e quem tem o token chama por fora do navegador,
   onde CORS não existe. O que a variável `ORIGENS_PERMITIDAS` encurta é o
   alcance de um token já vazado. Sem a variável configurada, o comportamento
   segue sendo `*`: falhar fechado derrubaria emissão fiscal no primeiro deploy
   em que alguém esquecesse a variável, e trocar risco baixo por parada de caixa
   é péssimo negócio. Formato e exemplo em `.env.example`.
2. **A allowlist de colunas não substitui a RLS, e não é ela que segura o
   tenant.** Quem impede gravar em linha de outro estabelecimento é a policy
   RESTRICTIVE de isolamento, e continua sendo. A allowlist fecha o contrato do
   lado do cliente, que é onde o erro futuro nasce.
3. **Allowlist que descarta em silêncio troca brecha por bug mudo.** Por isso
   `separarCampos` devolve o que ignorou, e os três pontos de escrita reportam
   ao Sentry quando ignoram alguma coisa.

## Limite conhecido (importante)

Nenhuma das três cobre bem o maior risco desta stack: **política RLS mal escrita vazando
dado entre tenants**. Elas pegam injection, XSS, deserialização insegura, segredo
hardcodado. Uma policy que deixa o tenant A ler o pedido do tenant B passa batido, porque
não há nada sintaticamente errado nela.

Então a checagem de isolamento multi-tenant continua **manual e obrigatória**, conforme
`ADR-008` e a restrição legal de isolamento em `memory/restrictions.md`. Ferramenta não
substitui esse teste.

Vale o mesmo para a regra de negócio do dinheiro (caixa, fechamento, fiscal): nenhuma
ferramenta aqui sabe o que é um fechamento de caixa correto. Isso continua sendo teste
nosso.
