# BASELINE

Como se verifica que o sistema está verde. Toda rodada de refino começa e termina
passando por esta lista inteira. Qualquer piora aqui reverte o commit na hora.

## Comandos de verificação

| # | Passo | Comando | Resultado esperado |
|---|-------|---------|--------------------|
| 1 | Instalação limpa | `npm ci` | termina sem erro |
| 2 | Suíte | `npm test` | 265 arquivos, 4415 testes, todos verdes |
| 3 | Build | `npm run build` | `✓ built`, sem erro (o aviso de chunk grande é conhecido, item de backlog) |
| 4 | App sobe | `npm run dev` | Vite serve em 5173 sem erro de módulo |
| 5 | Fluxos anônimos | navegador em `/login`, `/cardapio`, apex | tela renderiza, sem erro não tratado no console |

## Medidas de 2026-09-12 (depois da rodada 3; entre parênteses, o início da sessão)

| Medida | Valor |
|--------|-------|
| Arquivos de teste | 265 (eram 238) |
| Testes | 4415 (eram 4191) |
| Tempo da suíte | 137,31 s (eram 78,65 s, com 224 testes a mais) |
| Tempo do build | 2,10 s |
| Bundle principal (`index-*.js`) | 2.214,40 kB, gzip 640,79 kB |
| Precache do PWA | 71 entradas, 3.906,38 KiB |
| Arquivos JS/JSX em `src/` | 564 |
| Linhas de JSX (sem teste) | 49.531 |
| `style={{` em `src/` | 1516 |

## Limite conhecido desta varredura

Não existe `.env.local` nem instância Supabase alcançável neste ambiente, e não há
Supabase CLI instalado. Então os fluxos que exigem sessão (PDV, caixa, delivery,
estoque, financeiro, fiscal, console) foram verificados por leitura de código,
pelos testes de componente existentes e pelos guards da suíte, não por navegação
autenticada. As superfícies anônimas (login, cardápio público, landing do apex)
foram abertas de verdade no navegador. Isso está registrado como limite, não como
aprovação.

## Observação da rodada 2: a suíte não é confiável com as frentes rodando

Medido em 2026-09-12, durante a rodada 2. Com quatro frentes paralelas rodando
suítes completas no mesmo container, o `npm test` da cópia principal passou de
76 s para quase 600 s, e o tempo de "environment" de 66 s para 583 s. Nesse
estado apareceram falhas que NÃO são de código:

| Execução | Falhas |
|---|---|
| Primeira, com 4 frentes rodando | 4 arquivos |
| Segunda, com menos frentes | 1 arquivo |
| Os mesmos arquivos isolados | 0, em 21 s |

São testes de componente estourando prazo, não defeito. A conclusão prática, que
vale para as próximas rodadas: **a verificação que conta é a do fim, com as
frentes paradas.** Verde medido durante o paralelismo não prova nada, e vermelho
também não, nos dois casos porque o relógio está mentindo.
