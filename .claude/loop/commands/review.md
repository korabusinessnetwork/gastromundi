---
description: Passos 3 e 4 do ciclo — audita o build contra o spec, corrige o que é seguro, e só declara feito quando limpo
---

Argumento opcional (caminho do spec, se não for o mais recente): $ARGUMENTS

Você está nos **passos 3 e 4 (revisar e arrumar)** do ciclo. Auditar é o trabalho; corrigir é
consequência da auditoria, não uma faxina livre no código.

## Auditoria

1. Releia o spec (o de $ARGUMENTS, ou o mais recente em `specs/`). Se não houver spec, pare e diga:
   "Nenhum spec encontrado — rode /spec primeiro."
2. Releia **todos** os arquivos que o `/build` tocou. Auditoria por memória do que foi escrito não
   vale — leia o que está no disco.
3. Rode a suíte de testes do projeto — descubra o comando real no `package.json` (ou equivalente),
   não assuma `npm test`. **Suíte vermelha é critério não atendido**, mesmo que nenhum critério do
   spec fale de teste. Se o projeto não tiver suíte, diga isso em uma linha e siga.
4. Para cada critério de aceite do spec, responda **sim / não / parcial**, com evidência: arquivo e
   linha, ou o trecho de código que prova. Sem evidência, o critério é "não".
5. Confira também o que vale sempre, mesmo fora dos critérios escritos: segredo hardcodado, consulta
   ampla em tabela sensível, entrada não validada, dado sensível em log, dinheiro em float, erro
   externo não tratado, `console.log` esquecido, `TODO` sem justificativa, arquivo tocado fora do
   escopo do spec.

## Correção

Para cada item em "não" ou "parcial":

- **Corrija agora, sem perguntar**, quando a correção é segura e não-ambígua: bug óbvio, campo
  faltando, edge case do spec não tratado, float onde deveria ser inteiro, RLS ausente, validação
  faltando, estilo hardcodado onde o projeto usa token, teste que falta para função pura nova.
- **Nunca corrija sozinho** — pare e escale — quando o item cai em uma destas:
  1. decisão de produto (o que o usuário deve ver/fazer não está escrito em lugar nenhum);
  2. regra de negócio ambígua (o spec e o código divergem e não dá para saber qual está certo);
  3. mudança de schema em produção ou migration destrutiva;
  4. qualquer coisa que gere custo financeiro;
  5. credencial ou segredo necessário para funcionar.

Depois de corrigir, **refaça a auditoria do zero** — releia os arquivos, rode a suíte de novo. Não
assuma que a correção funcionou.

**Teto de 3 rodadas de correção.** Se depois da terceira ainda houver critério em "não" que não seja
parada obrigatória, não insista numa quarta: pare, descreva o que não converge, o que você tentou em
cada rodada e o que suspeita que seja a causa. Insistir gasta mais do que escalar.

## Saída final

Se tudo passou:

```
✅ feito — todos os critérios de aceite cobertos, sem ressalvas.
Suíte de testes: <comando> — verde.
[cada critério com a evidência]
```

Se algo precisa de decisão humana ou não convergiu:

```
⚠️ revisão parcial — X de Y critérios cobertos.
Suíte de testes: <comando> — <resultado>.
Corrigido automaticamente: [lista, com o que mudou em cada arquivo]
Precisa da sua decisão: [para cada item, a pergunta específica — não "o que você acha?"]
```

Nunca declare "feito" com qualquer critério ainda em "não": ou você corrigiu, ou está listado como
pendência. Não existe terceira opção silenciosa.

Se `specs/_loop.md` existir, registre o resultado da review na rodada atual (aprovada sem ressalvas,
ou parcial com as pendências). Termine indicando o próximo comando: `/aprender` se aprovado, ou a
decisão que falta se travou.
