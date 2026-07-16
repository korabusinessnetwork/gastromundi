-- ══════════════════════════════════════════════════════════════════
-- SEED · tema white-label do Casa Coffee Colab (ADR-007 · decisão 017)
-- Derivado do "Social DNA — Casa Coffee Colab" (paleta oﬁcial da marca).
--
-- Direção: ESPRESSO QUENTE (dark). Mantém o app escuro — baixo risco com
-- os componentes atuais, desenhados para fundo escuro — e troca a
-- IDENTIDADE GastroMundi (navy #070b14 + roxo #7c3aed) pela do Casa
-- (café/terracota). Verde/vermelho/azul semânticos (status, dinheiro,
-- erro) NÃO são tocados: são universais e garantem legibilidade.
--
-- Paleta-fonte (Social DNA): terracota #8c3a2a · marrom-café #5b3c34 ·
-- verde-mata #305429 · caramelo #a56a3a · creme #ead8c1.
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
      'alow',   'rgba(140, 58, 42, 0.16)',       -- overlay do accent (ativo/pressionado)
      'bg',     '#17100c',                        -- espresso quase preto (fundo)
      'card',   '#22160f',                        -- cartão
      'surface','#30211a',                        -- superfície elevada
      'border', '#4a3327',                        -- bordas
      'text',   '#f0e5d4',                        -- texto (creme claro)
      'muted',  '#b59d86',                        -- texto secundário
      'faint',  '#4a3327'                         -- linhas/estados apagados
    )
WHERE slug = 'casacoffeecolab';

-- Conferência: deve mostrar o tema aplicado ao Casa Coffee.
SELECT slug, nome, tema FROM public.tenants WHERE slug = 'casacoffeecolab';
