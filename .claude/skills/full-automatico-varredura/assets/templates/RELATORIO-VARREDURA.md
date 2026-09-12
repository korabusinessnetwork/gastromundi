# Relatório de varredura

Projeto: <nome> | branch: varredura/<slug> | data: <data>
Ondas: <n> | suítes: <n> | frentes simultâneas: <n>

## Resumo em 5 linhas

- Fluxos mapeados: <n>, testados: <n>, passaram: <n>
- Bugs: S1 <n>, S2 <n>, S3 <n>, S4 <n>
- O mais grave: <título do S1 mais crítico>
- Testes que ficaram no repositório: <n>, rodam com `<comando>`
- Não testado: <n> fluxos, motivos na seção própria

## Bugs por severidade

<lista com id, título, fluxo e impacto em uma linha cada, detalhe completo em BUGS.md>

## Cobertura

<copiar a tabela de métricas de COBERTURA.md>

## Fluxos NAO_TESTADO

| Fluxo | Motivo | O que destravaria |
|---|---|---|

## Bateria de testes entregue

Como rodar tudo em um comando:

```bash
<comando>
```

| Suíte | Arquivos | Fluxos cobertos |
|---|---|---|

## O que está mockado

| Integração | Mock usado | Risco de o real se comportar diferente |
|---|---|---|

## Pendências do Matheus

<ordem de prioridade, detalhe em PENDENCIAS-DO-MATHEUS.md>

## Como seguir

- Corrigir os bugs automaticamente: `/varredura corrigir`
- Refinar o que não é bug e sim melhoria: `/refino`
- Rodar a varredura de novo depois das correções: `/varredura` (o mapa é reaproveitado, só o que mudou é remapeado)
