# Guia de ADR (Architecture Decision Record)

## O que é

Um ADR é um documento curto e imutável (na essência) que registra **uma decisão
arquitetural**, o contexto que levou a ela, as alternativas que foram consideradas e as
consequências — inclusive as ruins. Vive em `docs/08_DECISOES/` com numeração sequencial
(`adr-001.md`, `adr-002.md`, ...) e um `overview.md` que resume a linha do tempo.

Um ADR não é um documento de design detalhado nem um manual de uso — é o registro do
**porquê** de uma escolha estrutural, escrito no momento em que ela é tomada, para que
alguém (humano ou agente) daqui a um ano entenda a decisão sem precisar reconstruir o
raciocínio do zero.

## Por que usar

Sem ADR, duas coisas ruins acontecem com o tempo:

1. **Decisão implícita** — a arquitetura muda porque "foi assim que alguém implementou",
   sem que ninguém tenha decidido conscientemente. A próxima pessoa (ou agente) não sabe
   se aquilo é intencional ou acidental, e não sabe se pode reverter.
2. **Documentação mentirosa** — `docs/` descreve uma arquitetura que o código não segue
   mais, porque a decisão real aconteceu em um PR ou numa conversa e nunca foi
   registrada. Isso é pior do que não ter documentação: gera confiança falsa.

O ADR resolve os dois problemas: força a decisão a ser explícita, e cria um rastro que
"documentação prevalece sobre código, e código errado deve ser corrigido" (ou vice-versa,
quando o ADR está desatualizado) — deixa de ser ambíguo qual dos dois está desatualizado.
Ver `CLAUDE.md`: "se doc e código conflitarem, a documentação prevalece — e deve ser
corrigida quando estiver errada". Um ADR é o mecanismo que mantém essa afirmação honesta.

## Quando uma decisão merece ADR

Checklist — se **qualquer item** for verdadeiro, escreva um ADR:

- [ ] Muda a arquitetura geral (camadas, onde a lógica de negócio vive, front vs backend)
- [ ] Muda a stack (framework, banco, provedor de auth, hosting, linguagem)
- [ ] Muda o modelo de dados de forma estrutural (não é só adicionar uma coluna — é mudar
      como tenant/isolamento/relacionamento central funciona)
- [ ] Envolve um trade-off relevante que alguém vai questionar depois ("por que não
      fizemos X em vez de Y?")
- [ ] Contradiz, ajusta ou substitui (total ou parcialmente) uma decisão anterior já
      registrada em ADR
- [ ] Tem custo financeiro recorrente ou implica dependência de terceiro difícil de reverter
- [ ] Afeta múltiplos módulos/telas e não pode ser revertida com um simples `git revert`

## Quando NÃO precisa

- Escolha de nome de variável, estrutura de pasta de um componente, detalhe de estilo —
  isso é `patterns.md`, não ADR.
- Correção de bug, mesmo que trabalhosa — isso é `bugs.md`/`learnings.md`.
- Decisão de produto reversível e de baixo impacto (copy de um botão, ordem de campos de
  um formulário) — isso é `decisions.md` em `memory/`, no máximo.
- Experimento local/temporário que não vai para produção.

Regra prática: se a resposta para "alguém vai perguntar por que fizemos assim daqui a 6
meses, e a resposta não está óbvia olhando o código" for sim, é ADR.

## Ciclo de status

Todo ADR tem um campo `Status:` que segue este ciclo:

1. **Proposto** — decisão em discussão, ainda não adotada. Pode ser descartada sem virar
   "Rejeitado" formal (basta não promovê-la); se quiser registrar explicitamente que foi
   descartada, marque `Status: Rejeitado` com o motivo.
2. **Aceito** — decisão em vigor. É o que o código deveria (ou já) refletir.
3. **Supersedido** — a decisão foi substituída por um ADR mais novo. O ADR antigo **não é
   apagado nem reescrito** — ele permanece como registro histórico, com o campo
   `Supersedido por:` apontando para o novo, e o novo ADR tem `Supersede:` apontando para
   o antigo.

### Supersessão parcial

Um ADR pode superseder **parte** de outro. Nesse caso, seja explícito no corpo do texto
sobre qual parte continua valendo e qual foi substituída — não deixe implícito. Exemplo
real do projeto (`adr-004.md`):

```
**Supersede:** [ADR-002](./adr-002.md) (parcialmente — arquitetura de acesso a dados e auth)
```

O ADR-002 continua "Aceito" como direção de roadmap para partes que não foram tocadas,
mas fica com uma nota indicando que a parte de acesso a dados/auth foi suspensa pelo
ADR-004 na fase atual. Isso evita que alguém leia o ADR-002 sozinho e conclua algo que já
não é verdade.

## Numeração sequencial

- `adr-NNN.md`, três dígitos, sem lacunas propositais (`adr-001`, `adr-002`, `adr-003`...).
- O número é **imutável** — nunca renumeie um ADR existente, mesmo que ele seja
  supersedido ou rejeitado. A imutabilidade do número é o que torna as referências
  cruzadas (`Supersede:`/`Supersedido por:`) confiáveis ao longo do tempo.
- `adr-000-template.md` é o template-base (não é um ADR de decisão real) — copie dele ao
  criar um novo. Se não existir ainda no projeto, é o primeiro artefato a criar ao
  inicializar `docs/08_DECISOES/`.
- Atualize `overview.md` (ou crie um, se ainda não existir) com uma linha por ADR: número,
  título curto, status atual — é o índice de leitura rápida antes de abrir os documentos
  individuais.

## Boas práticas de conteúdo

- **Alternativas consideradas**: liste pelo menos uma alternativa real que foi descartada
  e por quê. Um ADR sem alternativas é suspeito de racionalização a posteriori.
- **Consequências negativas, com honestidade**: todo ADR de peso real tem trade-off.
  Escreva a seção "Negativas" mesmo que doa — é o que dá credibilidade ao documento e
  avisa quem for mexer no código depois sobre o que esperar. Um ADR só com pontos
  positivos não é confiável.
- **Contexto antes de decisão**: descreva a situação/problema antes de anunciar a
  escolha, para que o raciocínio seja auditável, não só o resultado.
- **Referências**: aponte para ADRs relacionados, arquivos de schema/config relevantes, e
  `CLAUDE.md` quando a decisão afeta diretrizes de desenvolvimento.
- **Data e decisores**: sempre registrados — decisão sem dono e sem data não é rastreável.

## Exemplo de bom título de ADR

> ADR-004: Junção da fundação documental com o app em produção — stack real prevalece

Bom porque: identifica a decisão (não só o tema), é específico o bastante para ser
buscável, e já sinaliza a direção da escolha sem precisar abrir o documento. Evite
títulos genéricos como "Decisão sobre banco de dados" — prefira "Adoção de Supabase com
RLS direto no frontend em vez de API própria" (diz o quê e a alternativa descartada).
