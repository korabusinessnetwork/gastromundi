---
name: grilling
description: Entrevista o usuário sem dó sobre um plano, decisão ou ideia até não sobrar nada suposto em silêncio. Use quando o usuário quiser testar o próprio raciocínio antes de construir, ou usar frases como "me questiona", "me grelha", "me interroga", "detona meu plano", "pergunta tudo antes de fazer", "quero fechar o desenho antes de codar", "grill me". É o primitivo reusável de entrevista — outras skills chamam esta em vez de reinventar o roteiro.
---

# Grilling — a entrevista até a árvore fechar

Entreviste o usuário sem dó até vocês chegarem a um **entendimento compartilhado**.
Modele o problema como uma **árvore de decisão**: toda decisão ramifica nas decisões
que dependem dela.

Isso existe porque, como diz o *Pragmatic Programmer*, **ninguém sabe exatamente o que
quer**. A distância entre o que o usuário pediu e o que ele queria é onde nasce retrabalho.
A entrevista fecha essa distância **antes** de escrever a primeira linha.

## O algoritmo

Trabalhe a árvore em **rodadas**.

A **fronteira** é o conjunto de decisões cujos pré-requisitos já estão resolvidos — as
perguntas que dá pra fazer **agora**, sem chutar respostas que você ainda não ouviu.

1. Calcule a fronteira.
2. Faça **a fronteira inteira numa rodada só**, numerada, cada pergunta com a sua
   recomendação.
3. **Pare e espere** as respostas do usuário.
4. As respostas reordenam a árvore: o que ficou resolvido empurra a fronteira pra fora e
   destrava perguntas que dependiam dali. Recalcule a fronteira e faça a rodada seguinte.

Uma pergunta cuja resposta depende de outra pergunta **ainda aberta nesta rodada**
pertence a uma rodada **posterior**, não a esta. Se você não consegue formular a pergunta
sem supor a resposta de outra, ela não está na fronteira.

## Formato de cada pergunta

```
❓ **Q1** — **<título da pergunta>**: <corpo da pergunta, pode ter vários parágrafos,
inclusive alternativas enumeradas>

➡️ <sua recomendação>
```

A recomendação não é opcional. Nunca faça uma pergunta sem dizer o que **você** faria e
por quê — o usuário responde muito mais rápido corrigindo uma proposta do que preenchendo
um vazio.

## Fato é seu, decisão é dele

**Achar fato é trabalho seu, nunca do usuário.** Se uma pergunta da fronteira depende de
algo que está no ambiente (o que já existe no schema, como um módulo está feito hoje, o
que a doc já decidiu), vá olhar. Não pergunte ao usuário nada que você mesmo pode
levantar.

Não trave por causa disso: uma investigação em curso é um pré-requisito não resolvido,
então **só as perguntas que dependem dela** esperam — o resto da fronteira vai agora.

As **decisões** são do usuário. Coloque cada uma na frente dele e espere.

## Quando termina

A sessão acaba quando **a fronteira fica vazia**: todo galho da árvore visitado, nada
suposto em silêncio.

**Não comece a executar até o usuário confirmar** que vocês chegaram ao entendimento
compartilhado. O produto desta skill é o entendimento, não o código.

---

## No GastroMundi

**Onde levantar fato** (nesta ordem, antes de perguntar qualquer coisa):
`memory/` (identidade, decisões, padrões, restrições) → `docs/03_REGRAS_DE_NEGOCIO/` e
`docs/08_DECISOES/` (ADRs) → `supabase/schema.sql` e `supabase/migrations/` (o banco real)
→ `src/`. Lembre que **ADR-004** define o estado atual: a stack real (Supabase direto)
prevalece sobre o modelo-alvo descrito em `01_ARQUITETURA/`, `04_MODELAGEM/` e `07_APIS/`.

**Subagente com parcimônia.** A regra de operação do projeto vale aqui: delegue só
investigação ampla genuinamente paralela em vários arquivos. Levantamento que se resolve
em algumas chamadas de ferramenta você faz no loop principal — é mais barato e mais rápido
que despachar um agente.

**Galhos que nunca podem ficar supostos em silêncio** — se o plano toca neles e o usuário
não falou, eles estão na fronteira:

- **Intuitividade** (princípio nº 1) — em qualquer tela: qual é a próxima ação óbvia,
  quais são os estados de carregando/erro/vazio/sucesso, e como o erro é prevenido em vez
  de avisado.
- **Custo** — se a ideia exige algo pago (gateway, TEF, provedor fiscal, SMS/e-mail, IA
  com custo relevante), isso é decisão do dono: traga custo aproximado, alternativa
  gratuita, impacto e recomendação de investir agora ou depois.
- **Multi-tenant / white-label** (decisão 017) — o que aqui é do tenant e o que é da
  plataforma; nada de marca, cor, logo ou regra de um cliente cravada no código.
- **Segurança** — o que passa por RLS, o que é segredo e não pode chegar ao frontend,
  quem enxerga o quê por papel.

Escreva as perguntas em português do dia a dia do restaurante/varejo, não em jargão
técnico — a pessoa do outro lado decide sobre o negócio dela.
