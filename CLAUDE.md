# Diretrizes de Desenvolvimento — GastroMundi

## Princípio nº 1 — INTUITIVIDADE (inegociável)

O foco principal do sistema é ser **totalmente intuitivo**. Todo o front-end deve ser
imediatamente compreensível, sem necessidade de treinamento ou manual. Em qualquer
decisão de UI/UX, priorize a intuitividade acima de densidade de informação ou de
elegância técnica. Regras práticas:

- Fluxos óbvios: a próxima ação deve ser sempre a mais visível; caminho feliz em poucos cliques.
- Rótulos claros em português do dia a dia do restaurante/varejo — nada de jargão técnico na tela.
- Estados sempre visíveis: carregando, erro, vazio e sucesso com feedback imediato e humano.
- Prevenção de erro > mensagem de erro: desabilitar/guiar antes de deixar o usuário errar; confirmar ações destrutivas.
- Consistência total com o design system (`docs/02_DESIGN_SYSTEM/`) — mesmos padrões, ícones e posições entre telas.
- Acessível ao toque (PDV): alvos grandes, legível a distância, funciona no ritmo de operação.
- Ao entregar qualquer tela nova, justifique brevemente por que ela é intuitiva (ou o que a torna).

## Regra absoluta de escrita — travessão não existe, vírgula existe

**Em qualquer texto em português que apareça na tela, travessão (`—`) é proibido. Use
vírgula.** Vale para rótulo, botão, placeholder, mensagem de erro, texto de ajuda,
`aria-label`, `title` e o que mais o usuário lê. Vale também para o que você escreve
para o dono: docs, relatórios, mensagens, descrição de PR e de commit.

Isto é regra, não preferência de estilo, e **`src/lib/travessaoGuard.test.js` cobra na
suíte**. A regra já existia e continuava sendo quebrada porque nada a checava; texto
de tela é escrito no meio de outra tarefa, e é aí que o hábito vence a regra.

Duas formas continuam permitidas, porque não são pontuação:

1. **O marcador de célula vazia**, `{valor ?? "—"}` numa tabela, que quer dizer "não há
   valor". Vírgula sozinha numa célula não quer dizer nada. Repare no espaço: `"—"` é o
   marcador, `" — "` com espaço dos dois lados é **separador** dentro de uma frase
   montada (`[bairro, taxa].join(" — ")` vira "Centro — R$ 5,00" na tela), e separador é
   pontuação, tem de virar vírgula.
2. **A frase que cita o próprio símbolo**, como "clique no “—” da coluna Mensalidade".
   Trocar ali produziria uma instrução falsa, porque a célula continua mostrando o
   travessão.

**Uma exceção nomeada, por origem e não por forma:** `src/lib/assinatura.js` duplica
byte a byte uma frase que o BANCO levanta, e outro guard existe para as duas nunca
divergirem. Mudar só o lado do JS faria o usuário ler duas frases diferentes para a
mesma recusa. Há mais 21 mensagens de erro com travessão em `RAISE EXCEPTION` de
migrations, no mesmo caso; limpá-las custa reaplicar migration em produção por causa de
pontuação, e isso é decisão do dono, não varredura.

Comentário de código fica de fora de propósito. Comentário não é front, e proibir
travessão lá só tornaria a regra irritante o bastante para ser ignorada.

## Fonte de verdade (leia antes de qualquer mudança relevante)

- **`memory/`** — identidade, decisões, padrões, aprendizados e restrições do projeto. Consultar antes de decisões de produto/arquitetura.
- **`docs/`** — regras de negócio por módulo (`03_REGRAS_DE_NEGOCIO/`), design system (`02_DESIGN_SYSTEM/`), fluxos, modelagem e ADRs (`08_DECISOES/`).
- **ADR-004** define o estado atual: a stack real (Supabase direto) prevalece; API própria + Drizzle + Clerk (ADR-002) é roadmap. Partes de `01_ARQUITETURA/`, `04_MODELAGEM/` e `07_APIS/` descrevem o modelo-alvo, não o estado atual.
- Schema do banco em produção: `supabase/schema.sql` + `supabase/migrations/`.
- Se doc e código conflitarem, a documentação prevalece — e deve ser corrigida quando estiver errada.
- **Jarvas** (IA transversal): spec em `docs/03_REGRAS_DE_NEGOCIO/JARVAS.md` — insight/alerta/sugestão orientados a eventos, nunca executa ações sem confirmação humana.
- **Produto = SaaS multi-estabelecimento white-label** (decisão 017). Hoje atende o estabelecimento GastroMundi, mas o alvo é vender em escala para vários estabelecimentos. Todo código novo deve assumir **múltiplos tenants** e ser **adaptável por estabelecimento**: nada de marca, nome, cor, logo ou regra específica de um cliente hardcodada — identidade e configurações vêm do tenant. Combina com o sistema de planos (F013) e o multi-tenancy por RLS (decisão 002).

## Custo — priorizar o gratuito (fase de bootstrap)

Enquanto o projeto está em construção/pré-receita, **use sempre meios gratuitos**. Toda
implementação que exija investimento financeiro para rodar é **adiada por padrão** (jogada
pra frente), salvo decisão explícita do dono. Ao esbarrar em algo pago (gateway de
pagamento, TEF, emissão fiscal com provedor pago, SMS/e-mail pago, monitoramento pago,
uso de IA que gere custo relevante etc.), **não decida sozinho**: apresente o custo
aproximado, se há alternativa gratuita, a importância/impacto da implementação, e uma
recomendação de investir **agora** ou **mais pra frente** — o dono decide. Detalhes em
`memory/restrictions.md` (Restrições de Custo).

## Segurança (obrigatório em todo código novo)

- **Nunca** hardcodar chaves, URLs de API, secrets ou senhas no código. Sempre usar `import.meta.env.VITE_*`
- **Nunca** fazer `select *` em tabelas sensíveis (usuarios, caixa, pedidos, logs). Sempre especificar os campos necessários
- **Sempre** validar inputs do usuário antes de qualquer operação no Supabase
- **Nunca** logar dados sensíveis com `console.log` (senhas, tokens, dados financeiros)
- **Sempre** verificar autenticação antes de renderizar rotas protegidas
- Ao criar uma nova tabela ou função no Supabase, lembrar de avisar que RLS precisa ser configurada no painel

## Padrões de código

- Componentes React em arquivos separados, um componente por arquivo
- Variáveis e funções em português quando forem nomes de domínio do negócio (ex: `abrirCaixa`, `fecharComanda`), inglês para padrões técnicos (ex: `handleSubmit`, `useEffect`)
- Sempre tratar erros de chamadas ao Supabase com `try/catch` ou checagem de `.error`
- Logs de atividade (`activity_log`) devem ser fire-and-forget — nunca bloquear a operação principal
- Rodar `npm test` antes de commitar; novas funções puras (dinheiro, conversões, regras do Jarvas) devem nascer com teste
- Fluxos críticos do PDV têm testes de componente em `src/**/*.test.jsx` — rode-os antes de mexer no PDV
- **Separar CSS do JSX** (decisão 018): estilo não deve ficar acoplado à marcação. Em telas novas e ao refatorar, extrair os estilos do JSX (CSS Modules ou `.css` co-localizado, mantendo o Tailwind já em uso) para permitir edição de layout a longo prazo e customização visual por estabelecimento (white-label, decisão 017). Padrão definitivo a ser fixado em ADR de theming/CSS.

## Stack

- React + Vite
- Supabase (auth, database, realtime)
- React Router v6
- Context API (sem Redux)
- Deploy: Vercel

## Operação

Estas regras existem porque o custo de uma sessão agêntica se concentra em turnos
e subagentes, não em tokens de resposta. Entenda o motivo e aplique com julgamento;
não são checklist.

### Subagentes

Cada subagente refaz contexto do zero, explora, reporta, e eu releio o relatório —
o custo se multiplica e a latência também.

- Delegue apenas para investigação ampla genuinamente paralela em vários arquivos,
  ou trilhas independentes de tamanho real.
- Não delegue trabalho que se resolve em algumas chamadas de ferramenta.
- Nunca delegue para verificar o próprio trabalho: verificação pertence ao loop
  principal.
- Se um subagente resolve, use um. Mantenha a contagem baixa e não redo o trabalho
  dele depois que ele reporta.
- Ao disparar vários para trabalho independente, mande todos no mesmo bloco para
  rodarem em paralelo.

### Verificação

Você já verifica seu próprio trabalho por padrão. Não adicione um passo separado de
verificação nem revise duas vezes por precaução — isso duplica custo sem achar mais
nada. Verifique quando houver motivo concreto (teste falhou, resultado inesperado),
não por ritual.

### Escopo

Entregue o que foi pedido, no escopo pedido. Interprete ambiguidade como um colega
cuidadoso faria: decisões pequenas (nome de variável, valor default, qual de duas
abordagens equivalentes) você toma e menciona; mudança de escopo ou ação destrutiva
você pergunta antes.

Se achar que o pedido está errado ou que existe caminho melhor, diga em uma frase e
siga com o pedido — não estreite, alargue nem transforme por conta própria. Termine a
tarefa inteira; se algo ficou de fora, diga o que e por quê em vez de reportar
"pronto".

Não adicione features, refactor, abstração, error handling ou fallback além do que a
tarefa exige. Correção de bug não pede faxina em volta.

### Git — merge de rodada terminada está autorizado

Mesclar na `main` **toda rodada terminada** está autorizado de forma permanente pelo
dono (confirmado em 11/09/2026). Rodada terminada quer dizer as três coisas juntas:
review aprovada sem ressalvas, suíte verde e build limpo. Continua valendo abrir o PR
antes, para o histórico ficar legível.

Isto substitui a regra anterior ("a main é minha", que exigia aprovação a cada merge)
e resolve a contradição com a memória `loop-autonomo-e-main`. Se as duas voltarem a
divergir, esta regra manda.

O que continua fora, sempre: `push --force` em qualquer branch, mesclar rodada que
não fechou, e reescrever histórico já empurrado.

**O PR não é formalidade, é o que a proteção de branch exige.** Medido em 11/09/2026:
`git push origin main` é aceito quando os commits empurrados estão cobertos por um PR
aberto (o push fecha o PR como merged), e é **recusado** com "protected branch hook
declined" quando não estão. Commit avulso feito direto na `main` não sobe. Então o
caminho é sempre: commitar na branch, abrir o PR, e só então `git merge --ff-only`
mais `git push origin main`. O `gh pr merge` está bloqueado pelo classificador do modo
automático, por isso o merge é feito pelo git e não pelo `gh`.

**Efeito colateral que precisa de aviso:** a integração da Vercel sobe **produção** a
cada push na `main` (não há `git.deploymentEnabled: false` no `vercel.json`). Se a
rodada tiver migration ainda não aplicada no Supabase, isso deploya frontend novo
contra banco velho. Nesse caso, avise antes de mesclar e deixe a decisão comigo, em
vez de mesclar calado.

### Comunicação

Seu texto entre chamadas de ferramenta é o que eu leio — eu não vejo seu raciocínio
nem os resultados crus.

- Antes da primeira ferramenta, uma frase do que você vai fazer.
- Durante, atualize só quando achar algo que importa ou mudar de direção.
- Não narre ação rotineira ("agora vou...", "deixa eu ver...").
- Ao terminar, abra pelo resultado — a primeira frase responde "o que aconteceu".
  Detalhe depois.
- Legível vale mais que curto. Encurte cortando o que não muda minha decisão, não
  comprimindo em fragmentos, setas (`A → B → falha`) ou abreviação. Escreva frases
  completas com os termos por extenso.
- Se corrigir um erro seu, corrija e siga. Só comente quando o erro muda o que eu
  faria; sem pedido de desculpas, sem ruminar.
