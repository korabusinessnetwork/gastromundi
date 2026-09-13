# Ambiente de varredura

Commit base: <sha>
Data: <data>

## Subir do zero (um comando por linha, testado de verdade)

```bash
<instalação limpa>
<migrations>
<seed de QA>
<subir api>
<subir front>
```

## Variáveis

Arquivo `.env` local a partir do `.env.example`. Integrações externas em mock.

| Variável | Valor em QA | Observação |
|---|---|---|
| <VAR> | <valor falso> | <mock ativo> |

## Usuários de teste (seed)

| Papel | E-mail | Senha | Observação |
|---|---|---|---|

## Dados do seed

| Conjunto | Descrição | Usado por |
|---|---|---|
| vazio | entidade sem nenhum registro | estado vazio |
| unitário | exatamente 1 registro | paginação, singular/plural |
| volume | 500 registros | performance, scroll, filtro |
| extremo | texto longo, acento, emoji, valor negativo | encoding e layout |

## Isolamento

Cada suíte usa porta, banco e prefixo de dados próprios, conforme `SUITES.json`. Nenhuma suíte reseta o banco de outra.

## Limitações conhecidas do ambiente

- <o que não dá para testar localmente e por quê>
