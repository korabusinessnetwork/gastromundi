# ESTADO

- status: EXECUTANDO
- projeto: GastroMundi (KORA)
- plano de origem: backlog vivo (`docs/09_BACKLOG/`, `specs/_loop.md`, memória `fila-proximas-features`)
- branch: full-auto/gastromundi
- início: 2026-09-10
- fase: 2, loop de execução
- base verificada: commit `8513a1c2`, `npm test` com 229 arquivos e 4067 testes verdes
- tarefa atual: T03, TD008, mover o bloqueio de tentativas de login para o servidor
- próximo passo: rodar o `/ciclo` do T03, ler `20260802_leva16_hardening_rpcs.sql` para copiar o padrão do `senha_admin_tentativas`, escrever a migration da RPC de tentativas de login, ligar `LoginPage`/`AppContext` nela mantendo o contador local só como feedback, testar a regra, rodar a suíte e commitar
- progresso: 2 de 7
