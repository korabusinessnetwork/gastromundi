# Esquema de `memory/` — meta-cabeçalho padrão

`memory/` é a camada de **governança** do projeto: identidade, decisões, padrões,
aprendizados, restrições e bugs conhecidos. É a fonte de verdade que deve ser
**consultada antes de qualquer decisão de produto ou arquitetura** — antes de propor uma
feature, escolher uma lib, mudar um fluxo ou desenhar uma tabela nova, leia `memory/`
primeiro. Ignorar isso é a causa mais comum de retrabalho e de decisões contraditórias
entre sessões/agentes diferentes.

Cada um dos 6 arquivos de `memory/` tem o **mesmo meta-cabeçalho de 10 seções** no topo,
seguido do conteúdo específico do domínio (padrões, decisões, etc. em si). O
meta-cabeçalho não é burocracia decorativa: ele torna cada arquivo auto-descritivo — um
agente ou dev novo entende, só de ler o topo, como escrever ali, quem pode escrever, e o
que dispara.

## As 10 seções do meta-cabeçalho

### Objetivo
Uma frase objetiva: para que este arquivo existe e o que ele é "a fonte oficial de
verdade sobre". Deve deixar claro o escopo — o que entra aqui e, implicitamente, o que
não entra (vai para outro arquivo de `memory/` ou para `docs/`).

### Contexto
Por que este arquivo precisa existir — a dor que ele resolve (conhecimento tácito que se
perde, decisões repetidas sem registro, contradições entre sessões). Também é o lugar
para regras de "quando consultar" (ex.: "consultar antes de decisão de produto/arquitetura").

### Regras Gerais
As regras de convivência do conteúdo: quando algo entra, como é classificado, convenções
de nomenclatura, tags de status (`[DEPRECADO]`, `[EXPERIMENTAL]`), e a regra de promoção
entre arquivos quando aplicável (ex.: aprendizado validado → padrão).

### Validações
O que precisa ser verdade antes de uma entrada ser aceita: exige revisão de outra pessoa?
Exige referência a casos reais? Exige post-mortem? Diferencia validação leve (padrão de
código) de validação pesada (padrão de segurança, decisão arquitetural).

### Permissões
Quem pode escrever, quem pode só ler, quem aprova. Arquivos de alto impacto (identity,
decisions) tendem a ter permissão restrita (product-owner/founder); arquivos operacionais
(bugs, learnings) tendem a ser abertos a qualquer dev.

### Exceções
Casos em que a regra geral pode ser quebrada — e sob qual condição/prazo. Ex.: adoção
provisória em urgência, dado sensível que precisa ser anonimizado antes de registrar,
pivô de identidade que exige novo arquivo em vez de edição do existente.

### Auditoria
O rastro mínimo que toda entrada precisa carregar: autor, data, motivo, referência a ADR
ou post-mortem quando aplicável. Também define a cadência de revisão periódica
recomendada (ex.: trimestral, ao fim de cada sprint).

### Eventos
Os eventos de domínio que uma mudança neste arquivo dispara, em **dot.case**
(`arquivo.ação`), no padrão do Event Bus do projeto. Servem para integração futura
(automação, notificações, changelog automático). Exemplos reais do projeto:
`pattern.added`, `pattern.deprecated`, `pattern.revised`, `learning.added`,
`learning.promoted`, `identity.updated`, `identity.reviewed`. Ao criar um arquivo novo em
`memory/`, defina pelo menos os eventos de criação e de alteração significativa.

### Configurações Futuras
Automação ou integração que ainda não existe mas está prevista: linter baseado em
padrões, ritual de retrospectiva, integração ao onboarding, changelog automático a partir
dos eventos. É um backlog de melhoria do próprio processo de governança — não do produto.

### Casos de Uso
Situações concretas em que alguém (humano ou agente) deve abrir este arquivo:
onboarding, code review, retrospectiva, análise pós-incidente, planejamento de
arquitetura futura. Ajuda a decidir, na dúvida, se uma informação pertence aqui.

### Critérios de Aceite
Checklist objetivo (`- [ ]`) que uma entrada precisa satisfazer para ser considerada bem
escrita: tem nome, contexto, exemplo e justificativa; está classificada corretamente;
status está atualizado. É o "definition of done" de uma entrada no arquivo.

## Os 6 arquivos e quando escrever em cada um

| Arquivo | Papel | Quando escrever |
|---|---|---|
| `identity.md` | Propósito, valores, público-alvo, posicionamento — "o que o produto é" | Ao definir/mudar propósito central, tom de voz ou público-alvo. Mudança exige ADR em `docs/08_DECISOES/` |
| `decisions.md` | Registro leve de decisões de produto/processo que não chegam a virar ADR completo | Decisão tomada que outros precisam saber, mas sem trade-off arquitetural profundo (para isso, ver `adr-guide.md`) |
| `patterns.md` | "Como fazemos aqui" — padrões consolidados de código, arquitetura, UX, processo | Quando a mesma solução se repete **3+ vezes** e passa a ser adotada oficialmente |
| `learnings.md` | Erros, surpresas, insights — memória viva do que funcionou e do que não funcionou | Sempre que algo surpreender a equipe (bom ou ruim), especialmente pós-incidente |
| `restrictions.md` | Limites hard do projeto — custo, compliance, técnicos — que não podem ser violados sem decisão explícita do dono | Ao identificar algo que custa dinheiro, trava legal/fiscal, ou limite técnico inegociável |
| `bugs.md` | Bugs conhecidos, não resolvidos ou resolvidos com gambiarra registrada, para não serem redescobertos do zero | Ao encontrar um bug que não será corrigido imediatamente, ou cuja correção teve trade-off |

### Regra de promoção: learning validado → pattern

Um aprendizado em `learnings.md` que se repete e se prova consistente (validado por pelo
menos um segundo membro, ou observado em 2+ casos reais) deve ser **promovido**: copiado
(não apenas referenciado) para `patterns.md` com a entrada original marcada como
promovida, e o evento `learning.promoted` registrado. O aprendizado original não é
apagado — ele continua sendo o histórico de "como chegamos a esse padrão". A mesma
lógica se aplica a `bugs.md` → `learnings.md` quando um bug recorrente revela uma lição
maior sobre o sistema, e a `decisions.md` → ADR quando uma decisão leve se revela mais
estrutural do que parecia.

## Mini-exemplo de cabeçalho preenchido

```markdown
# Restrições do Projeto GastroMundi

## Objetivo
Registrar limites inegociáveis do projeto — custo, compliance fiscal, técnicos — que
qualquer decisão de produto ou arquitetura deve respeitar sem exceção silenciosa.

## Contexto
O projeto está em fase de bootstrap pré-receita. Decisões que implicam custo recorrente
tomadas sem visibilidade do dono já geraram retrabalho. Este arquivo existe para que
toda restrição de custo/compliance esteja em um único lugar, consultável antes de
qualquer implementação.

## Regras Gerais
- Toda restrição tem categoria: `custo`, `compliance`, `técnica`
- Restrições de custo exigem: valor aproximado, alternativa gratuita (se houver),
  recomendação de timing (agora/depois) — decisão final é do dono
- Restrições não têm prazo de expiração automático; só saem daqui por decisão explícita

## Validações
- Restrição de compliance fiscal exige referência à lei/norma aplicável
- Restrição de custo exige ao menos uma alternativa gratuita avaliada, mesmo que descartada

## Permissões
- Qualquer dev pode propor uma restrição; apenas o dono (founder) pode remover ou flexibilizar uma

## Exceções
- Em uso experimental/local (não produção), uma restrição de custo pode ser suspensa
  temporariamente, com tag `[SUSPENSA-DEV]` e prazo

## Auditoria
- Autor, data e categoria obrigatórios em cada entrada

## Eventos
- `restriction.added` — nova restrição registrada
- `restriction.lifted` — restrição removida por decisão do dono

## Configurações Futuras
- Alertar automaticamente quando um PR tocar área com restrição de custo ativa

## Casos de Uso
- Antes de integrar gateway de pagamento, TEF, SMS/e-mail pago, IA com custo relevante
- Revisão de arquitetura antes de escalar

## Critérios de Aceite
- [ ] Categoria definida
- [ ] Se custo: valor aproximado e alternativa gratuita registrados
- [ ] Autor e data presentes
```
