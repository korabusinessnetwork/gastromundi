# Diretrizes de Desenvolvimento — GASTROMUNDI by Kora

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

## Stack

- React + Vite
- Supabase (auth, database, realtime)
- React Router v6
- Context API (sem Redux)
- Deploy: Vercel
