# Diretrizes de Desenvolvimento — GastroMundi

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

## Stack

- React + Vite
- Supabase (auth, database, realtime)
- React Router v6
- Context API (sem Redux)
- Deploy: Vercel
