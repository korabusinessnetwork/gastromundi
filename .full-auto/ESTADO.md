# ESTADO

- status: EXECUTANDO
- projeto: GastroMundi (KORA)
- plano de origem: backlog vivo (`docs/09_BACKLOG/`, `specs/_loop.md`, memória `fila-proximas-features`)
- branch: full-auto/gastromundi
- início: 2026-09-10
- fase: 2, loop de execução
- base verificada: commit `8513a1c2`, `npm test` com 229 arquivos e 4067 testes verdes
- tarefa atual: T04, TD015, trocar `key={i}` por chave estável nas listas React
- próximo passo: rodar o `/ciclo` do T04, mapear as 40 ocorrências de `key={i}`/`key={index}` com grep, trocar por chave estável (id do domínio) onde a lista reordena ou muda de tamanho, deixar justificativa escrita nas que forem legitimamente estáticas, rodar a suíte e commitar
- progresso: 3 de 7
