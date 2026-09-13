# Formato de achado e severidade

Todo achado segue este formato, na frente e no `BUGS.md` consolidado. Achado sem reprodução e sem evidência não entra.

## Formato

```
B04 | fluxo: F12 | suíte: financeiro | severidade: S1 | status: CONFIRMADO (3/3)
  título: estorno duplicado quando o botão é clicado duas vezes
  ambiente: local, commit a1b2c3d, front 5203, banco qa_financeiro, usuário qa-admin@teste.local
  reprodução:
    1. abrir /financeiro e clicar no pagamento seed-pay-02
    2. clicar "estornar" e confirmar
    3. clicar "estornar" de novo antes da tela recarregar
  esperado: segundo estorno é recusado, pagamento já está estornado
  obtido: dois lançamentos de crédito criados, saldo do cliente fica R$ 240 negativo
  evidência: evidencias/B04-tela.png, evidencias/B04-network.har, query de conferência no relatório
  impacto: dinheiro a mais devolvido ao cliente, sem trava no back-end
  causa provável: POST /api/pagamentos/:id/estorno não checa status atual antes de inserir
  ocorrências: também em F14 (estorno via lista)
```

Campos obrigatórios: fluxo, severidade, status, reprodução numerada, esperado, obtido, evidência, impacto. `causa provável` é opcional e vai sempre marcada como hipótese, nunca como diagnóstico fechado.

## Status do achado

- `CONFIRMADO (3/3)`: reproduziu nas três tentativas.
- `FLAKY (2/5)`: reproduziu de forma inconstante, com a frequência observada e a condição suspeita.
- `NAO_REPRODUZIU`: aconteceu uma vez e não voltou. Vira nota no relatório da suíte, não vira bug.
- `BLOQUEADO`: não deu para chegar ao fluxo por causa de outro bug. Aponte qual.

## Escala de severidade

| Nível | Definição | Exemplos |
|---|---|---|
| **S1** | Perda ou exposição de dado, dinheiro errado, ou fluxo crítico impossível de concluir | cobrança duplicada, usuário vê dado de outro tenant, login quebrado, checkout não fecha, delete sem confirmação apaga tudo |
| **S2** | Fluxo importante quebrado com contorno, ou erro que confunde e leva a dado errado | relatório com número errado, filtro que ignora critério, erro 500 em caminho comum, permissão frouxa sem dado sensível |
| **S3** | Comportamento errado com impacto limitado, UX que atrapalha | validação faltando, mensagem de erro genérica, estado vazio sem texto, layout quebrado no celular, lentidão perceptível |
| **S4** | Cosmético ou raro | espaçamento inconsistente, texto truncado em caso extremo, aviso no console |

Regras de severidade:

- **Dinheiro, dado de cliente e autenticação sobem um nível** em relação ao que você classificaria pela aparência.
- **Frequência não muda a severidade, muda a prioridade.** Bug raro de S1 continua S1.
- **Na dúvida entre dois níveis, escolha o mais alto** e explique por quê em uma linha. Subestimar severidade é o erro que mais custa caro num relatório de QA.

## Achado de segurança

Tratamento especial:

1. Comprove com o **mínimo necessário**: um request que mostra que o dado veio, não um dump da base.
2. **Nunca use dado real** para comprovar, nem em ambiente local que tenha cópia de produção.
3. **Não registre o dado exposto na evidência.** Descreva o formato ("veio o CPF completo do usuário do outro tenant"), não o conteúdo.
4. Se o mesmo caminho está exposto em produção, isso **escala imediatamente** para o Matheus, em uma única mensagem, antes de continuar a varredura.

## Deduplicação pelo maestro

Dois achados são o mesmo bug quando a causa provável é a mesma e a correção seria a mesma. Junte num só, mantenha a severidade mais alta, e liste os fluxos afetados em `ocorrências`. Três telas com o mesmo componente de data quebrado é um bug, não três.

O contrário também vale: um mesmo sintoma com causas diferentes em lugares diferentes continua sendo dois bugs.

## Nota sobre o que não é bug

Não entra em `BUGS.md`:

- preferência de estilo ou de arquitetura sua (isso é assunto da skill de refino),
- comportamento documentado em ADR, `CLAUDE.md`, `memory/` ou `DECISOES.md`,
- limitação conhecida já registrada em `PENDENCIAS-DO-MATHEUS.md`,
- falha causada pelo próprio ambiente de teste (seed, porta, worktree). Conserte o ambiente e reexecute.
