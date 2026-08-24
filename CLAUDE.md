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

### Git — a main é minha

Merge na `main` exige aprovação explícita do dono, sempre. Você pode desenvolver na
branch, commitar, dar push na branch e abrir o PR; **mergear, não** — pare no PR
aberto e me avise. Vale também para auto-merge e para push direto na `main`. A regra
de permissão em `.claude/settings.json` faz o Claude Code perguntar antes de mergear;
a proteção de branch no GitHub é a trava de verdade.

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
