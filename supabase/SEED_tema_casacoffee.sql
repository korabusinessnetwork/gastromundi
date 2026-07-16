-- ══════════════════════════════════════════════════════════════════
-- SEED · tema white-label do Casa Coffee Colab (ADR-007 · decisão 017)
-- Derivado do "Social DNA — Casa Coffee Colab" (paleta oﬁcial da marca).
--
-- Direção: CREAM (claro) — a cara literal do DNA (café-casa, acolhedor).
-- Fundo creme, texto café, CTA terracota. É a identidade mais fiel do
-- Casa; como o app foi desenhado assumindo fundo escuro, esta direção
-- pede QA de contraste tela a tela (ver ADR-007 / nota de theming claro).
--
-- Paleta-fonte (Social DNA): terracota #8c3a2a · marrom-café #5b3c34 ·
-- verde-mata #305429 · caramelo #a56a3a · creme #ead8c1.
--
-- Semânticos: só `green` é sobrescrito para o verde-mata do DNA (#305429),
-- que lê melhor sobre creme que o verde default (claro demais p/ fundo
-- claro). `red`/`blue` herdam o default (legíveis sobre o creme).
--
-- `tema` guarda SÓ os tokens sobrescritos (o resto herda tema.css). O
-- merge (||) preserva chaves já existentes (ex.: logo_url, se houver).
--
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor. Idempotente (reexecutar só
-- reescreve os mesmos valores).
-- ══════════════════════════════════════════════════════════════════

UPDATE public.tenants
SET tema = coalesce(tema, '{}'::jsonb) || jsonb_build_object(
      'nome_exibicao', 'Casa Coffee Colab',
      'accent', '#8c3a2a',                       -- terracota (CTA, destaques)
      'alow',   'rgba(140, 58, 42, 0.12)',       -- overlay do accent (ativo/pressionado)
      'bg',     '#ead8c1',                        -- creme (fundo)
      'card',   '#f7efe3',                        -- cartão (creme claro)
      'surface','#ffffff',                        -- superfície elevada (campos)
      'border', '#d8c3a8',                        -- bordas (bege)
      'text',   '#3a2118',                        -- texto (café escuro)
      'muted',  '#8a6a52',                        -- texto secundário (café médio)
      'faint',  '#cbb89c',                        -- linhas/estados apagados
      'green',  '#305429'                         -- verde-mata do DNA (contraste sobre creme)
    )
WHERE slug = 'casacoffeecolab';

-- Conferência: deve mostrar o tema aplicado ao Casa Coffee.
SELECT slug, nome, tema FROM public.tenants WHERE slug = 'casacoffeecolab';
