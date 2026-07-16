# Apex institucional (kora.codes)

## O que é

A raiz do domínio da plataforma (`kora.codes` e `www.kora.codes`) passa a mostrar uma página institucional —
vitrine comercial do produto — em vez de cair direto no login do GastroMundi.

Subdomínios de tenant (ex: `casacoffeecolab.kora.codes`, `gastromundi.kora.codes`) **continuam indo direto
ao login do estabelecimento**, sem mudança.

## Como funciona

### Detecção

Função `ehApexInstitucional(hostname)` em `src/lib/apex.js`:

- Retorna `true` apenas quando **ambas** as condições forem verdadeiras:
  1. `VITE_ROOT_DOMAIN` está configurado
  2. Host é exatamente o apex (`kora.codes`) ou www (`www.kora.codes`)
- Sem `VITE_ROOT_DOMAIN` (dev, preview Vercel, IP) → `false`, comportamento antigo intacto (inerte por design)
- Preview local: rode com `VITE_APEX_PREVIEW=1`

### Roteamento

- `/` **no apex** renderiza a página institucional; **nos demais hosts** redireciona para `/login` como sempre
- `/login` continua funcionando no apex (fallback GastroMundi) — clientes antigos com bookmark não quebram,
  só ganham um clique ("Entrar")

## Página

**Arquivo**: `src/pages/apex/ApexPage.jsx` (+ CSS separado, decisão 018)

- Estática — nenhum fetch de dados no carregamento
- Usa tokens de CSS do tema padrão (`--gm-*`) — sem cor hardcodada
- Nenhum dado específico de estabelecimento hardcodado
- Link de contato comercial é opcional: se `VITE_CONTATO_URL` vazio, botão não aparece

## Variáveis de Ambiente

| Variável | Tipo | Descrição | Exemplo |
|----------|------|-----------|---------|
| `VITE_ROOT_DOMAIN` | string | Domínio raiz da plataforma; liga a detecção | `kora.codes` |
| `VITE_APEX_PREVIEW` | flag | Força a página institucional em dev local (preview sem domínio) | `VITE_APEX_PREVIEW=1` |
| `VITE_CONTATO_URL` | string | URL de contato (WhatsApp, mailto, etc); opcional | `https://wa.me/5500999999999` |

## O que NÃO muda

- Autenticação: Supabase Auth continua igual
- RLS: isolamento por tenant intacto
- Resolução de tenant por subdomínio: busca no hostname como antes
- Console da plataforma (admin, dashboards, etc): sem impacto

## Por que é intuitivo (princípio nº 1)

- **Visitante vê vitrine**: chega em `kora.codes` e conhece o produto antes de logar — conota profissionalismo
- **Cliente vê seu login direto**: `casacoffeecolab.kora.codes` vai direto ao login — nenhuma confusão
- **Um clique separa os dois**: botão "Entrar" no apex leva ao login GastroMundi — transição clara, sem detour
