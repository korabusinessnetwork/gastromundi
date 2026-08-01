---
description: Passo 1 do ciclo — transforma uma ideia em especificação verificável, antes de construir
---

Ideia recebida: $ARGUMENTS

Você está no **passo 1 (planejar)** do ciclo. Não implemente nada aqui — apenas especifique.

## Reconhecimento do projeto (obrigatório, antes de escrever o spec)

Leia o que existir, na ordem. Use só o que existe; nada é obrigatório:

1. `CLAUDE.md` na raiz — regras de execução, segurança, custo e padrões de código do projeto.
2. `memory/identity.md`, `memory/decisions.md`, `memory/patterns.md`, `memory/restrictions.md` —
   o que já foi decidido e o que é proibido. Nunca especifique algo que contradiga uma decisão ativa
   sem dizer explicitamente que a contradiz.
3. `docs/09_BACKLOG/` e `docs/08_DECISOES/` — se a ideia corresponde a um item já catalogado
   (ex: `F018`, `TD009`), use o identificador dele no spec em vez de criar um nome novo.
4. `specs/_loop.md`, se existir — o ledger do loop diz em que rodada você está e o que ficou pendente.
5. `package.json` (ou equivalente) — descubra o comando real de teste; não assuma `npm test`.

Se o projeto não tiver `memory/` nem `docs/`, siga mesmo assim, mas avise numa linha que o passo
"aprender" do ciclo ficará reduzido ao registro no próprio spec, e que a skill `fundacao-de-projeto`
resolve isso.

## Portão de custo (para o ciclo antes de especificar)

Se a ideia exige algo **pago** para funcionar (gateway de pagamento, TEF, provedor fiscal, SMS/e-mail
pago, monitoramento pago, uso de IA com custo relevante, qualquer serviço com mensalidade): **não
escreva o spec**. Em vez disso, apresente:

- custo aproximado, com a fonte/data do número;
- se existe alternativa gratuita e o que se perde com ela;
- importância e impacto de fazer agora;
- sua recomendação: investir **agora** ou **mais pra frente**.

E pare — a decisão é do dono.

## Estrutura do spec

Salve em `specs/<slug-da-ideia>.md`, com este conteúdo:

### 1. Escopo
Uma frase objetiva do que será construído, sem ambiguidade.

### 2. Fora de escopo
O que explicitamente NÃO será feito nesta rodada. É isso que impede o `/build` de crescer sozinho.

### 3. Origem e decisões que este item honra
Item do backlog (se houver), decisão de `memory/decisions.md` e/ou ADR que o trabalho respeita.
Se o item não existe no backlog, diga isso — o `/aprender` vai cadastrá-lo depois.

### 4. Arquivos afetados
Arquivos que provavelmente serão criados ou modificados, respeitando as convenções já usadas no
projeto (descubra lendo, não assuma): nomes, pastas, formato de migration, idioma dos identificadores.

### 5. Critérios de aceite
Lista numerada e verificável — cada item precisa poder ser respondido com sim/não depois do build,
com evidência no código. Bons critérios:

- "RLS ativa na tabela X permitindo apenas leitura do próprio tenant"
- "Split de pagamento usa aritmética inteira (centavos), nunca float"
- "Retorna erro claro quando o payload está incompleto, sem quebrar a tela"

Evite "funciona bem", "está organizado", "código limpo" — não são verificáveis.

**Critérios obrigatórios quando o projeto os exigir** (leia o `CLAUDE.md` para saber quais valem
aqui; inclua apenas os aplicáveis ao que está sendo construído):

- Multi-tenant: dado novo é isolado por tenant e a RLS foi considerada (avisar se precisa ser
  configurada no painel).
- Segredos: nada de chave, URL de API ou senha hardcodada — sempre variável de ambiente.
- Consultas: nada de `select *` em tabela sensível; campos especificados.
- Dinheiro: aritmética em inteiro (centavos), nunca float.
- Erros: toda chamada externa tratada, com estado visível para o usuário.
- Teste: função pura nova nasce com teste; fluxo crítico tocado tem seu teste rodado.
- Estilo: CSS separado do JSX, usando os tokens de tema do projeto — nada de cor hardcodada.
- Tela nova: uma frase justificando por que ela é intuitiva (o "próxima ação óbvia" do projeto).
- White-label: nada de marca, nome, cor ou regra de um cliente específico cravada no código.

### 6. Edge cases conhecidos
Casos limite que o `/build` precisa tratar (concorrência, lista vazia, valor zero, offline,
permissão insuficiente, dado legado fora do formato novo).

### 7. Definição de "aprovado sem ressalvas"
Uma frase que diz quando o `/review` pode declarar feito. Padrão:
"todos os critérios de aceite em sim, suíte de testes verde, sem TODO pendente, sem `console.log`
esquecido e sem regressão nos fluxos existentes."

## Saída

Mostre o spec resumido no chat (escopo, critérios de aceite e o que ficou fora) e termine com:

`Spec salvo em specs/<slug>.md. Rode /build quando estiver de acordo.`
