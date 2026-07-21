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

## Processo de trabalho — orquestração multi-modelo (regra do dono, 2026-07-16)

**REGRA ABSOLUTA (dono, 2026-07-21): a CADA prompt do dono, sem exceção, começar
invocando a skill `multi-model-orchestrator` (`Skill(multi-model-orchestrator)`) e
operar no modo dela.** Isso vale até para tarefas pequenas — nesse caso a regra 4
manda o orquestrador fazer direto, sem fan-out, mas o modo é sempre o de orquestração.
Reforço mecânico: hook `UserPromptSubmit` em `.claude/settings.json` injeta esse
lembrete a cada prompt (não depende de memória de sessão).

**Sempre operar no modo da skill `multi-model-orchestrator`** (skill do claude.ai do dono;
quando o corpo dela não carregar no ambiente, seguir o padrão abaixo, que a codifica):

1. **Planejar TUDO antes de executar** — escopo fechado, peças definidas, sem retrabalho.
2. **Builds multi-parte → fan-out paralelo** de até 10 subagentes, com **dono exclusivo
   por diretório/arquivo** (dois agentes nunca tocam o mesmo arquivo). Modelo casado ao
   peso da peça: **Opus/Sonnet nas peças críticas** (lógica, telas, segurança),
   **Haiku nas menores** (seeds, docs, boilerplate).
3. **Sintetizar e VALIDAR no fim** — o orquestrador revisa cada entrega dos modelos
   inferiores, integra os pontos compartilhados (rotas, índices), roda testes e build.
4. **Tarefa de peça única não ganha fan-out** — o orquestrador faz direto (casar o
   modelo ao tamanho da tarefa vale também para não fragmentar o que é pequeno).
5. Subagentes **não commitam/nem fazem push** — integração e commit são do orquestrador.

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
