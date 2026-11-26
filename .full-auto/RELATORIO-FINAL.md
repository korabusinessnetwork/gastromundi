# Relatório final: plano de refatoração do GastroMundi (execução 2)

## Resumo
O plano de refatoração (`docs/09_BACKLOG/plano_refatoracao.md`, ADR-015) terminou, da fase 5 à fase
F. Todas as metas de saída estão em "sim": nenhum estilo inline, cor fixa ou emoji no código;
nenhuma chamada ao Supabase fora de `dados/`, e o lint cobra isso; cada assunto mora em
`src/features/<dominio>/`; e as rotas ficam em `src/app/rotas/`, uma por superfície. A auditoria
final passou duas vezes. A primeira achou três pontos e corrigiu os três. A segunda não achou nada.
Tudo está na `main`, e a Vercel já publicou.

## Como rodar
```
npm install && npm run dev
npm test && npm run lint && npm run build
npm run fluxos
```
O último comando roda os 13 fluxos críticos no navegador, contra o Supabase falso.

## O que está pronto
- **Fase 5, visual em tema** (5.22 a 5.34). Estilo inline foi de 185 para 0, cor fixa no JSX de 8
  para 0 e emoji de 98 para 0, com guardas na suíte que exigem zero. A prova do white-label rodou o
  roteiro de 209 telas com o tema de outro estabelecimento e achou 3 vazamentos de cor, todos
  corrigidos (verificado com: `prova-tema` e testes).
- **Fase 6, organização por domínio** (6.1 a 6.12, mais as rodadas 6.9a a 6.9h, que acrescentei
  porque o critério do plano exigia `components/desktop/views/` vazio). Foram 25 domínios em
  `src/features/`. O roteador saiu de 294 para 22 linhas. A ponte e o bot ganharam README, e a
  documentação de arquitetura descreve o sistema real (verificado com: suíte, lint, build e o roteiro
  de 209 telas sem diferença em cada rodada).
- **Fase F, auditoria.**
  - F.1: métricas.
  - F.2: um subagente releu 88 specs e 415 critérios, sem regressão.
  - F.3: 13 fluxos no navegador, nas duas larguras.
  - F.4: as 4 migrations são `SECURITY INVOKER`, com `search_path` fixo, e nenhuma política de RLS
    foi alterada.
- **Pedidos seus no meio do caminho.**
  - A data da compra e o vencimento do fiado apareciam um dia antes. Agora mostram o dia gravado,
    com teste.
  - A página `kora.codes/patchnotes` ("Novidades do sistema") tem o histórico desde 1º de agosto.
  - Todo push atualiza essas notas. O `.githooks/pre-push` cobra, e foi testado com um e com vários
    commits.

Números finais: 273 arquivos e 4.465 testes, verdes. Build limpo, com o maior pacote em 2.352 kB.
Lint com 0 erros e 25 avisos. São 179 commits desde o começo do plano.

## O que está mockado ou local
| Parte | Contorno | Pendência |
|---|---|---|
| Fluxos críticos (F.3) | rodam contra o Supabase falso do roteiro, que não guarda gravação. A prova é a tela chegar ao fim e a gravação sair com os dados certos | nenhuma, é de propósito: produção não é lugar de teste |
| Venda com NFC-e em homologação | não rodou: depende do certificado A1 e do CSC | P2-06 |

## Suas pendências (em ordem)
1. **P2-04, ativar o gancho das notas na sua máquina** (1 minuto): `git config core.hooksPath .githooks`.
2. **P2-05, decidir o `npm run setup:git`** (5 minutos): ele aponta para um arquivo que só existe num
   commit nunca mesclado ("Guarda de branch por dev").
3. **P2-01, liberar a skill `/ciclo`** para a próxima execução Full Automático: fiz o ciclo à mão,
   em cada rodada.
4. **P2-06, NFC-e em homologação**, quando decidir pagar o certificado A1
   (`docs/NFCE_CHECKLIST_GO_LIVE.md`).
5. **P2-03, apagar a coluna `emoji` de `products`** (opcional, é uma migration).

## Decisões principais
- **Rodadas 6.9a a 6.9h:** acrescentei os domínios que a lista do plano não cobria, porque o "pronto
  quando" exigia `components/desktop/views/` vazio e `src/lib/` sem regra de domínio.
- **`src/lib/` fica com o nome:** ela cumpre o papel de `shared/lib/`, e renomear mexeria em mais de
  140 imports sem ganho.
- **Telas que já moravam em `pages/` ficaram** (celular, cardápio público, site da Kora e Console).
- **Cozinha, Financeiro e Relatório entraram numa rodada só**, para gerar um deploy em vez de três
  sem mudança visível.
- **A cor "Forte" da senha passou para o azul do tema**, porque ciano não é token.
- **Uma rodada sobe num push só**, por causa da regra das notas.

A lista completa está em `.full-auto/DECISOES.md`.

## Erros meus no caminho, já corrigidos
- **Cor do tema na impressão:** na 5.34, passei a escrever a cor do tema no `<style>` da janela de
  impressão sem filtro. A F.4 achou o problema, e agora só entra valor com forma de cor. O risco era
  baixo, porque só a plataforma grava as cores.
- **Gancho de pre-push:** a primeira versão recusava pushes de vários commits mesmo quando um deles
  tinha a nota. Agora ele confere commit por commit.
- **Link de `node_modules`:** um link criado numa cópia de trabalho entrou num commit local e trocou
  a pasta de dependências por ele. O commit não chegou a subir. Refiz o commit, reinstalei as
  dependências, e o `.gitignore` agora ignora o link também.

## Bloqueios
- Nenhuma tarefa ficou bloqueada. O fluxo 3 da F.3 depende de dinheiro (o certificado) e fica com
  você.

## Verificação final
- Instalação limpa: ok (`npm ci`, 647 pacotes, na recuperação do `node_modules`).
- Build: ok.
- Testes: 4.465 passando de 4.465.
- Fluxo principal testado no navegador: sim. São 13 fluxos com `npm run fluxos`, incluindo abrir o
  caixa, vender, fechar o caixa, lançar pelo Palm e vender sem internet.

## Pendências finais, feitas depois do encerramento (T25 a T29)
- Os três ganchos de domínio saíram de `src/utils/hooks.js` para as features.
- O lint ficou com 0 erros e 0 avisos. Eram 25 avisos:
  - 15 diretivas inúteis saíram;
  - 1 aviso de dependência foi corrigido;
  - 8 foram mantidos de propósito, com o motivo escrito ao lado;
  - 1 diretiva estava na linha errada e foi posta no lugar.
- A decisão 038 registra que o TanStack Query continua fora, com os gatilhos para reavaliar.
- O site da Kora e as pautas entraram no roteiro: 225 telas, e as 209 de antes não mudaram.
- `npm run cenarios-banco` roda, num Postgres local montado das 125 migrations, os cenários das
  quatro funções atômicas da fase 1: 58 conferências, 0 falhas. Ele também achou uma migration fora
  de ordem (`20260725` altera uma função que só a `20260748` cria). Não afeta produção, mas montar
  do zero dá esse aviso.

## Próximos passos sugeridos
- Os itens TD021 a TD027 de `docs/09_BACKLOG/tech-debt.md`, achados durante a refatoração.
  - O TD026 deixa fonte serifada nas janelas abertas por portal.
  - O TD024 esconde do cozinheiro o erro de "Iniciar preparo".
  - Os dois são os mais visíveis para quem usa.
- As janelas de abrir e fechar o caixa não têm `role="dialog"`, então o leitor de tela não as anuncia
  como janela. Vi isso ao escrever os fluxos. É pequeno, e vale uma rodada de acessibilidade.
