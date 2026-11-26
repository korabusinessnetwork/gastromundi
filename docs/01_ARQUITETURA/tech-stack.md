# Tech Stack, GastroMundi

## Objetivo
Documentar todas as tecnologias utilizadas no projeto GastroMundi, com justificativas, versões e responsabilidades de cada camada.

## Contexto
Estado real revisado na refatoração 6.12 (2026-11-26). O app é uma SPA em **React + Vite** que fala
**direto com o Supabase** (autenticação, Postgres com RLS, Realtime e funções de borda), sem API
própria (ADR-004). Estilo em CSS co-localizado com variáveis `--gm-*`, sem Tailwind (ADR-007). A
stack com Express, Drizzle e Clerk (ADR-002) é roadmap, não estado atual.

## Regras Gerais
- Mudanças de stack exigem ADR registrado em `docs/08_DECISOES/`
- Bibliotecas novas devem ser avaliadas por: manutenção ativa, tamanho do bundle, licença e popularidade
- Versões de dependências críticas devem ser fixadas (não usar `latest`)

## Validações
- Toda nova dependência deve ser aprovada pelo tech lead antes de entrar em produção
- Dependências com vulnerabilidades conhecidas não podem ser adicionadas

## Permissões
- Devs podem propor mudanças de bibliotecas secundárias
- Mudanças de stack principal exigem decisão coletiva

## Exceções
- Ferramentas de desenvolvimento (linters, formatters) podem ser adicionadas sem ADR

## Auditoria
- Versões devem ser revisadas a cada ciclo de manutenção (recomendado: trimestral)
- Dependências sem uso devem ser removidas

## Eventos
- `stack.updated`, dependência adicionada, atualizada ou removida
- `stack.vulnerability`, vulnerabilidade identificada em dependência

## Configurações Futuras
- Avaliar migração para Bun como runtime
- Avaliar TanStack Router como alternativa ao React Router
- Planejar estratégia de SSR se SEO se tornar crítico

## Casos de Uso
- Onboarding técnico
- Avaliação de upgrade de versões
- Auditoria de segurança de dependências
- Decisões de refatoração

## Critérios de Aceite
- [ ] Todas as tecnologias principais estão listadas com versão e justificativa
- [ ] Responsabilidade de cada ferramenta está descrita
- [ ] Path de upgrade ou substituição está indicado

---

## Frontend

| Tecnologia | Versão | Responsabilidade | Justificativa |
|------------|--------|-----------------|---------------|
| React | 18.3 | UI e estado local | Ecossistema maduro, time familiarizado |
| Vite | 8.x | Build e servidor de desenvolvimento | Velocidade de HMR, simplicidade |
| React Router | 7.x (`createBrowserRouter`) | Roteamento, uma superfície por endereço em `src/app/rotas/` | Padrão do ecossistema React |
| Context API | (React) | Estado global, seis provedores | Sem Redux (decisão 003) |
| CSS co-localizado + `--gm-*` | | Estilo e white-label por estabelecimento | ADR-007, decisões 018 e 023 |
| react-icons (`lu`) | 5.x | Ícones que seguem a cor do tema | O sistema não usa emoji (decisão 037) |
| vite-plugin-pwa | 1.x | App instalável e cache offline | Operação sem internet no PDV |
| Leaflet | 1.9 | Mapa do raio de entrega | Gratuito, OpenStreetMap |
| xlsx, jsPDF | | Planilhas e PDF de relatório e importação | Gratuitos, no navegador |
| pdfjs-dist, tesseract.js | 4.x, 7.x | Ler cardápio em PDF ou imagem | Gratuitos, no navegador |
| @sentry/react | 10.x | Erros em produção | Plano gratuito |

## Backend e dados (Supabase)

| Tecnologia | Responsabilidade | Justificativa |
|------------|-----------------|---------------|
| Supabase Auth | Login (`usuario@<estabelecimento>.local`, ADR-009) | Incluso no Supabase |
| Postgres + RLS | Dados de todos os estabelecimentos, isolados por `tenant_id` | Decisão 002 |
| Funções do banco (RPC) | Gravações atômicas e leituras agregadas, com checagem de tenant | Nada fica pela metade |
| Realtime | Comandas e cozinha ao vivo entre aparelhos | Incluso no Supabase |
| Funções de borda (Deno) | NFC-e, provisionamento de estabelecimento, importação | Segredos fora do navegador |
| `@supabase/supabase-js` 2.x | Cliente usado só pela camada `dados/` e pelos provedores | Lint impede tela de importar |

## Satélites

| Programa | Tecnologia | Responsabilidade |
|----------|-----------|-----------------|
| Ponte KORA (`ponte/`) | Node puro, empacotado em `.exe` | Pedidos do Palm e impressão pela rede local, sem internet |
| Importador de cardápio (`bot/`) | Node | Importa planilha de produtos a partir de uma pasta |

## Ferramentas de Desenvolvimento

| Ferramenta | Responsabilidade |
|------------|-----------------|
| JavaScript com JSDoc | Código; TypeScript só nos tipos gerados do banco (ADR-015, D2) |
| ESLint 9 | Lint, inclusive as fronteiras de camada |
| Vitest 4 + Testing Library | Testes de unidade, de componente e guardas (travessão, emoji, estilo inline, SQL) |
| Playwright | Roteiro de fotos da refatoração contra um Supabase falso |
