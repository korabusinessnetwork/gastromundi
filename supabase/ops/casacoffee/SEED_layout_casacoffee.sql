-- ══════════════════════════════════════════════════════════════════
-- SEED · aplicar o LAYOUT "casa" ao Casa Coffee Colab
-- Sistema de layouts (src/layouts) · ADR-007 (tema) · decisão 017
--
-- Substitui os OVERRIDES de paleta do SEED_tema_casacoffee (que gravava
-- token a token no tema) pelo modelo "casa" do catálogo de layouts: a
-- mesma identidade Casa Coffee, agora com variante DIURNA (creme/café
-- claro) e NOTURNA (café escuro), trocando sozinha às 6h e às 19h.
--
-- O UPDATE espelha exatamente o que a RPC alterar_layout_tenant
-- (20260801) faz — use este seed OU o menu de layout do Console, o
-- resultado é o mesmo:
--   1. remove os overrides de paleta antigos (ficariam POR CIMA do
--      layout e o mascarariam — nada mudaria na tela);
--   2. grava tema.layout = 'casa';
--   3. preserva nome_exibicao (e logo_url/chaves desconhecidas, se
--      existirem) — a identidade não-visual fica intacta.
--
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor. Idempotente (reexecutar
-- produz o mesmo estado). Pré-requisito: front com src/layouts em
-- produção (senão a chave layout é simplesmente ignorada — inofensivo).
-- ══════════════════════════════════════════════════════════════════

UPDATE public.tenants
   SET tema = (coalesce(tema, '{}'::jsonb)
                - 'accent' - 'alow' - 'bg' - 'card' - 'surface' - 'border'
                - 'green' - 'red' - 'blue' - 'text' - 'muted' - 'faint'
                - 'font_titulo' - 'font_texto')
              || jsonb_build_object('layout', 'casa')
 WHERE slug = 'casacoffeecolab';

-- Conferência: tema deve ter layout='casa' e manter nome_exibicao.
SELECT slug, nome, tema FROM public.tenants WHERE slug = 'casacoffeecolab';
