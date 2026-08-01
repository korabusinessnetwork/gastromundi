# Loop autocorretivo do Claude Code

Um ciclo de sete passos que o Claude Code executa por conta própria — planejar, executar, revisar,
arrumar, aprender, verificar o próximo passo, e parar para o ok antes de reiniciar do primeiro.

```
/spec  →  /build  →  /review ⟳ (arruma e re-audita)
                        ↓
                    /aprender  →  commit + push  →  /proximo
                                                       ↓
                                              para e espera o "vai"
```

## Os comandos

| Comando | Passo | O que faz |
|---|---|---|
| `/spec <ideia>` | 1. Planejar | Ideia solta vira especificação verificável em `specs/<slug>.md` |
| `/build` | 2. Executar | Implementa exatamente o escopo do spec, nada além |
| `/review` | 3+4. Revisar e arrumar | Audita critério a critério com evidência, corrige o que é seguro, re-audita |
| `/aprender` | 5. Aprender | Registra em `memory/` e atualiza o status no backlog |
| `/proximo` | 6. Próximo passo | Raio-x do que falta e recomendação de um item |
| `/ciclo [item]` | 1→6 + parada | Roda a sequência inteira, commita, empurra e para com o resumo |

Uso normal: `/ciclo` (sem argumento ele usa a recomendação da rodada anterior) ou
`/ciclo F018 — painel do garçom`. Os comandos individuais servem quando você quer conduzir passo a
passo, ou repetir só um deles.

## O que o ciclo nunca faz sozinho

- Construir algo que exige gasto financeiro — o `/spec` para antes, apresenta custo, alternativa
  gratuita e recomendação, e a decisão é do dono.
- Decidir regra de negócio ou produto que não está escrita em lugar nenhum.
- Mudança de schema em produção ou migration destrutiva.
- Escrever decisão nova em `memory/decisions.md` ou `docs/08_DECISOES/` — só propõe.
- Commitar com a suíte de testes vermelha, dar push na branch padrão, ou abrir pull request.

## Adaptação por projeto

Os comandos são globais e valem em qualquer repositório. Cada um começa lendo o que existir —
`CLAUDE.md`, `memory/*.md`, `docs/09_BACKLOG/`, `docs/08_DECISOES/`, `specs/_loop.md` e o
`package.json` (para descobrir o comando de teste real). Nada disso é obrigatório: sem `memory/` e
sem `docs/`, o passo "aprender" fica reduzido a um registro no próprio spec e o comando avisa que a
skill `fundacao-de-projeto` cria essa base.

O estado do loop mora em `specs/_loop.md` dentro de cada projeto: rodada, item, resultado da review,
pendências humanas e próximo candidato. É isso que torna barato reiniciar do passo 1 numa sessão
nova — o Claude lê o ledger em vez de reconstruir o contexto.

## Instalação

```bash
bash .claude/loop/instalar.sh
```

Copia os seis comandos para `~/.claude/commands/`, deixando-os disponíveis em todos os projetos.
É idempotente: rode de novo sempre que atualizar um comando aqui.

**No ambiente remoto do Claude Code, `~/.claude/` é efêmero** — o container é reciclado e a
instalação global some. Por isso a fonte de verdade é esta pasta, versionada no repositório; basta
rodar o instalador de novo no começo da sessão.

## Como alterar um comando

Edite o arquivo em `.claude/loop/commands/`, rode o instalador, e commite a mudança. Editar direto
em `~/.claude/commands/` funciona na sessão atual, mas se perde — e o próximo instalador sobrescreve.
