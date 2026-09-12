# BASELINE

Como se verifica que o sistema está verde. Toda rodada de refino começa e termina
passando por esta lista inteira. Qualquer piora aqui reverte o commit na hora.

## Comandos de verificação

| # | Passo | Comando | Resultado esperado |
|---|-------|---------|--------------------|
| 1 | Instalação limpa | `npm ci` | termina sem erro |
| 2 | Suíte | `npm test` | 241 arquivos, 4212 testes, todos verdes |
| 3 | Build | `npm run build` | `✓ built`, sem erro (o aviso de chunk grande é conhecido, item de backlog) |
| 4 | App sobe | `npm run dev` | Vite serve em 5173 sem erro de módulo |
| 5 | Fluxos anônimos | navegador em `/login`, `/cardapio`, apex | tela renderiza, sem erro não tratado no console |

## Medidas de 2026-09-12 (depois da rodada 1; entre parênteses, antes dela)

| Medida | Valor |
|--------|-------|
| Arquivos de teste | 241 (era 238) |
| Testes | 4212 (era 4191) |
| Tempo da suíte | 75,69 s (era 78,65 s) |
| Tempo do build | 2,99 s |
| Bundle principal (`index-*.js`) | 2.442,98 kB, gzip 702,49 kB |
| Precache do PWA | 64 entradas, 3.877,99 KiB |
| Arquivos JS/JSX em `src/` | 546 |
| Linhas de JSX (sem teste) | 49.531 |
| `style={{` em `src/` | medido na rodada, ver F018 |

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
