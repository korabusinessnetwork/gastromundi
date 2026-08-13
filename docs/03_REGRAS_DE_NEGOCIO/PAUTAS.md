# Pautas da Kora — ferramenta interna dos sócios

> **Não é um módulo do produto.** As Pautas não pertencem a nenhum estabelecimento,
> não aparecem no PDV, não têm `tenant_id` e não entram no gating por plano. É a
> ferramenta interna dos sócios da Kora (Matheus, Guilherme e Bonato) para
> combinar o que vai ser programado. Vive em um **subdomínio próprio**
> (`pautas.kora.codes`), como o Console.

## Objetivo

Tirar da conversa de WhatsApp as três coisas que sempre se perdem numa pauta de
desenvolvimento: **o que é**, **para que serve** e **o que já sabemos**. Cada
pauta tem uma situação visível (pendente / em progresso / finalizado) e pode ter
um ou mais sócios envolvidos.

## Modelo

`public.pautas` (migration `20260919_pautas.sql`)

| Campo | Tipo | Regra |
|-------|------|-------|
| `id` | uuid | PK, `gen_random_uuid()` |
| `titulo` | text | Obrigatório, 1–120 caracteres |
| `intuito` | text | Obrigatório, 1–1000 caracteres — "para que serve" |
| `contexto` | text | Opcional, até 5000 caracteres — o que já se sabe |
| `envolvidos` | text[] | Slugs de `pautas_pessoas`; vazio = ninguém marcado |
| `status` | text | `pendente` (default) · `em_progresso` · `finalizado` |
| `criada_por` / `atualizada_por` | text | Slug do sócio |
| `created_at` / `updated_at` | timestamptz | `updated_at` via trigger `pautas_updated_at` |
| `finalizada_em` | timestamptz | Carimbada ao finalizar, zerada ao reabrir |

`public.pautas_pessoas` (slug PK, nome, ativo, ordem) — os sócios, semeados com
`matheus`, `guilherme` e `bonato`. Tabela em vez de enum para que entrar ou sair
um sócio seja um `INSERT`/`UPDATE`, sem migration nem deploy.

## Regras

1. **Título e intuito são obrigatórios.** Uma pauta sem "para que serve" é um
   recado, não uma pauta. Validado no front (`validarPauta`) e no banco (CHECK).
2. **Vários envolvidos por pauta** — a mesma pauta pode ser de dois ou três, e
   pode não ser de ninguém em particular (fica sem marcação).
3. **Qualquer sócio muda o estado de qualquer pauta.** São três pessoas; um
   fluxo de dono/aprovação seria burocracia sem ganho.
4. **Finalizar carimba `finalizada_em`;** reabrir (voltar a pendente ou em
   progresso) apaga o carimbo — o rodapé do card sempre reflete a verdade.
5. **Nada é apagado.** Não existe policy de `DELETE`: pauta que não vale mais é
   finalizada. Histórico de decisão é o valor da ferramenta.

## Acesso e segurança

- **Login próprio por sócio.** Contas no Supabase Auth no namespace
  `<slug>@pautas.local` (`matheus@pautas.local` etc.), criadas à mão no painel.
  O e-mail é montado pelo front (`emailDoSocio`), o sócio digita só o usuário.
- **A fronteira real é a RLS**, não o subdomínio: as policies de `pautas` e
  `pautas_pessoas` exigem `public.eh_socio_pautas()` — JWT autenticado cujo
  e-mail termina em `@pautas.local`. Credencial de tenant não lê nem escreve
  nada aqui, e a credencial de sócio não autentica em nenhum estabelecimento.
- **Inerte por design.** O recurso só existe com `VITE_PAUTAS_SUBDOMAIN` +
  `VITE_ROOT_DOMAIN` configurados. Sem eles, `pautasAtivo()` é falso, o
  `main.jsx` nunca entra no branch das pautas e o app roda idêntico ao de hoje.
- **Fora do multi-tenancy** de propósito: nenhuma coluna `tenant_id`, nenhum
  `assinatura_ativa`, nenhum módulo de plano. Ver ADR-011.

## Telas

| Tela | Arquivo | O que faz |
|------|---------|-----------|
| Login | `src/pages/pautas/PautasLoginPage.jsx` | Usuário + senha do sócio |
| Lista | `src/pages/pautas/PautasPage.jsx` | Filtros (situação, pessoa, busca) e lista |
| Card | `src/components/pautas/PautaCard.jsx` | Uma pauta, com os três botões de situação |
| Formulário | `src/components/pautas/PautaForm.jsx` | Criar/editar |

Camada de dados em `src/lib/pautas.js`, sessão em `src/lib/pautasAuth.js`,
estado em `src/context/PautasContext.jsx`, detecção de host em
`src/lib/pautasHost.js`.

## Por que é intuitiva (Princípio nº1)

- Uma tela, uma lista, uma ação principal sempre visível ("Nova pauta").
- A situação de cada pauta é o botão aceso — mudar é **um toque**, sem menu,
  sem confirmação, sem tela intermediária.
- Os filtros mostram o número do que existe atrás deles antes do clique.
- Os campos são perguntas em português ("Para que serve?", "Quem entra nessa?"),
  não nomes de coluna.
- Os quatro estados têm tratamento humano: carregando, vazio (com convite),
  erro (com "Tentar de novo") e sucesso (a pauta nova já aparece no topo).
- Salvar só liga quando dá para salvar — prevenção de erro antes da mensagem.

## Passos manuais (uma vez)

1. Rodar `supabase/migrations/20260919_pautas.sql` no SQL Editor.
2. Conferir no painel que a **RLS está ligada** em `pautas` e `pautas_pessoas`.
3. Criar as 3 contas em Authentication → Users com "Auto Confirm User" ligado:
   `matheus@pautas.local`, `guilherme@pautas.local`, `bonato@pautas.local`.
4. Apontar `pautas.kora.codes` para o mesmo projeto da Vercel.
5. Definir `VITE_PAUTAS_SUBDOMAIN=pautas` (com `VITE_ROOT_DOMAIN=kora.codes`) e
   refazer o build.
