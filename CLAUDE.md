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

## Stack

- React + Vite
- Supabase (auth, database, realtime)
- React Router v6
- Context API (sem Redux)
- Deploy: Vercel
