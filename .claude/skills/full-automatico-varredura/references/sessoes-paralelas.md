# Sessões paralelas de teste

Como dividir o mapa de fluxos em suítes e rodar várias frentes ao mesmo tempo sem uma contaminar o resultado da outra. Este arquivo complementa `references/paralelismo.md` da skill `full-automatico`, que continua valendo para worktrees, arquivos compartilhados e merge.

A diferença em relação ao paralelismo de construção: lá o risco é uma frente sobrescrever o código da outra. Aqui o risco é uma frente **sujar o dado** da outra e gerar bug falso. Isolamento de dado é o ponto central.

## Vocabulário

- **Maestro:** a sessão principal. Única que escreve em `.full-auto/varredura/` na cópia principal, monta as suítes, integra e consolida bugs.
- **Frente:** uma sessão ou subagente que executa uma suíte.
- **Suíte:** conjunto de fluxos da mesma área que não disputa dado com outra suíte.
- **Onda:** as suítes despachadas ao mesmo tempo.

## Como particionar

1. **Agrupe por área do produto** (auth, cadastro, pedidos, financeiro, relatórios, admin, integrações).
2. **Fluxos que tocam o mesmo registro ficam na mesma suíte.** Se `F07` fecha a conta da mesa 4 e `F09` cancela a conta da mesa 4, os dois vão juntos, senão um derruba o outro.
3. **Máximo de 8 fluxos por suíte.** Área grande vira duas suítes com dados separados (`pedidos-a` usa mesas 1 a 5, `pedidos-b` usa mesas 6 a 10).
4. **Segurança e permissão viram suíte própria**, com os modelos mais fortes, porque é onde o erro custa mais caro.
5. **Fluxos sem tela** (jobs, webhooks, migrations, RLS) viram uma suíte de back-end, testada por chamada direta.
6. **Teto de 10 frentes, prática de 3 a 5.** Cada frente custa uma consolidação, e frentes demais competem por CPU e deixam o app lento, o que gera falso `FLAKY` de timeout.

## `SUITES.json`

O maestro escreve o particionamento antes do fan-out:

```json
{
  "onda": 1,
  "suites": [
    {
      "id": "auth",
      "fluxos": ["F01", "F02", "F03"],
      "criticidade": "alta",
      "modelo": "forte",
      "porta_front": 5201,
      "porta_api": 3001,
      "banco": "qa_auth",
      "usuarios": ["qa-admin@teste.local", "qa-op@teste.local"],
      "dados": "seed padrão, prefixo auth-"
    }
  ]
}
```

Campo `dados` é o contrato de isolamento: cada suíte só cria, edita e apaga registros com o prefixo dela. Nenhuma frente apaga tabela inteira, nenhuma frente reseta o banco de outra.

## Isolamento de ambiente por suíte

Cada frente recebe, sem exceção:

- **Worktree própria**, branch `varredura/qa-<id>`, saindo do commit que fixou o ambiente e o seed.
- **Porta própria** para front e API (5201, 5202... e 3001, 3002...). Duas frentes na mesma porta é a causa número um de resultado sem sentido.
- **Banco ou schema próprio**, criado do zero com as migrations e o seed de QA. Em Supabase local, um schema por suíte ou uma instância por suíte, o que o projeto aguentar. Em SQLite, um arquivo por suíte.
- **Usuários de teste próprios**, um por papel, com prefixo da suíte.
- **Pasta de evidência própria**: `.full-auto/varredura/suites/<id>/evidencias/`.

O script `scripts/preparar-suites.js` lê o `SUITES.json`, cria worktree, branch, pasta de evidência e o `AMBIENTE.md` de cada suíte, e falha se houver porta ou banco repetido.

## Despacho

1. **Fixe e commite o que é compartilhado antes de despachar:** `AMBIENTE.md`, seed de QA, credenciais de teste, formato do relatório, convenção de nomes dos testes, e a ferramenta escolhida (Playwright para web, cliente HTTP para API). Frente que tem que decidir ferramenta sozinha entrega teste em três padrões diferentes.
2. **Despache todas as frentes da onda no mesmo bloco de chamadas.** Em blocos separados elas rodam em fila e você perde o paralelismo.
3. **Papéis de modelo pela skill `multi-model-orchestrator`:** fluxos críticos, segurança e permissão nos modelos mais fortes; cadastro simples, estado vazio, leitura e relatório nos mais baratos.

### Prompt de cada frente

Inclua, nesta ordem:

1. A suíte: id, fluxos com o texto completo do mapa, criticidade.
2. O ambiente: como subir, porta, banco, usuários, prefixo de dados.
3. A bateria obrigatória de variações (de `mapeamento-de-fluxos.md`).
4. O formato de achado e a escala de severidade (`bug-report.md`).
5. As proibições: não alterar código de produção, não alterar arquivos compartilhados, não sair da própria porta e do próprio banco, não usar credencial real, não apontar para produção.
6. O que entregar: `RELATORIO.md` no formato padrão, testes em `tests/e2e/<id>/`, evidências na pasta da suíte, e a lista de mudanças que ela precisa em arquivos compartilhados.
7. A instrução de escrever teste pelo `/ciclo` e de responder sozinha qualquer pergunta que o `/ciclo` faria.

### Modo B: sessões separadas do Claude Code

Quando as suítes forem grandes ou o Matheus quiser acompanhar:

```
claude --worktree qa-<id> --permission-mode auto
/varredura suite <id>
```

A sessão de suíte lê `.full-auto/varredura/suites/<id>/`, trabalha só ali e em `tests/e2e/<id>/`, e ao terminar marca `status: CONCLUIDO` na própria worktree e faz commit na branch dela. Pedidos ao maestro vão para `.full-auto/PEDIDOS-AO-MAESTRO.md`.

## Consolidação

Uma frente por vez: aplicar pedidos de arquivos compartilhados, fazer merge da branch (só `tests/` e evidências), rodar a bateria integrada, deduplicar bugs, atualizar `BUGS.md` e `COBERTURA.md`, remover a worktree (`git worktree remove`).

## Falso positivo: como reconhecer antes de reportar

Antes de aceitar o bug de uma frente, o maestro checa:

- **Timeout com várias frentes rodando** costuma ser contenção de CPU, não bug. Reexecute o fluxo sozinho.
- **Dado sumindo ou mudando do nada** costuma ser vazamento entre suítes. Confira o isolamento antes de acusar o sistema.
- **Erro logo no login** costuma ser seed ou `.env` da worktree, não autenticação quebrada.
- **Bug que só aparece em uma suíte e some quando reexecutado sozinho** entra como `FLAKY` com a condição observada, nunca como `FALHOU`.
