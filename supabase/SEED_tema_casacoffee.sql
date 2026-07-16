-- ══════════════════════════════════════════════════════════════════
-- SEED · tema white-label do Casa Coffee Colab (ADR-007 · decisão 017)
-- Derivado do "Social DNA — Casa Coffee Colab" (paleta oﬁcial da marca).
--
-- Direção: CAFÉ (meio-termo escuro) — entre o espresso (quase preto) e o
-- cream (claro). Um marrom-café quente e aconchegante, mais suave que o
-- espresso, mas AINDA ESCURO de propósito: o app foi desenhado assumindo
-- fundo escuro (texto claro sobre superfícies escuras), então manter o
-- tema escuro preserva o contraste em TODAS as telas internas — sem QA
-- claro tela a tela. Troca a identidade GastroMundi (navy #070b14 + roxo
-- #7c3aed) pela do Casa (café/terracota).
--
-- Paleta-fonte (Social DNA): terracota #8c3a2a · marrom-café #5b3c34 ·
-- verde-mata #305429 · caramelo #a56a3a · creme #ead8c1.
--
-- Semânticos (green/red/blue) NÃO são tocados: são universais, legíveis
-- sobre fundo escuro e garantem status/dinheiro/erro consistentes.
--
-- `tema` guarda SÓ os tokens sobrescritos (o resto herda tema.css). O
-- merge (||) preserva chaves já existentes (ex.: logo_url, se houver).
--
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor. Idempotente (reexecutar só
-- reescreve os mesmos valores). Reescreve por cima do tema anterior.
-- ══════════════════════════════════════════════════════════════════

UPDATE public.tenants
SET tema = coalesce(tema, '{}'::jsonb) || jsonb_build_object(
      'nome_exibicao', 'Casa Coffee Colab',
      'accent', '#8c3a2a',                       -- terracota (CTA, destaques)
      'alow',   'rgba(140, 58, 42, 0.18)',       -- overlay do accent (ativo/pressionado)
      'bg',     '#2e2018',                        -- café escuro quente (fundo)
      'card',   '#3a291f',                        -- cartão
      'surface','#48352a',                        -- superfície elevada (campos)
      'border', '#5c4437',                        -- bordas
      'text',   '#f2e8d8',                        -- texto (creme claro)
      'muted',  '#c6ad97',                        -- texto secundário (caramelo suave)
      'faint',  '#5c4437',                        -- linhas/estados apagados
      -- Fontes do Social DNA (carregadas em index.html). Rexton (títulos)
      -- é PAGA → stand-in livre Saira; Sora (texto) é a fonte real, grátis.
      'font_titulo', '"Saira", system-ui, sans-serif',
      'font_texto',  '"Sora", system-ui, sans-serif',
      -- Logo do Casa (versão creme #f2e8d8, fundo transparente) no Supabase
      -- Storage (bucket público `branding`). Login e sidebar trocam o texto
      -- pela imagem quando `logo_url` existe. PNG raster; se um dia vier SVG,
      -- só troca a URL. ⚠️ o PNG precisa ser transparente (senão, caixa branca).
      'logo_url', 'https://jgdvylwiuqgjtavffguc.supabase.co/storage/v1/object/public/branding/casacoffeecolab.png'
    )
WHERE slug = 'casacoffeecolab';

-- Conferência: deve mostrar o tema aplicado ao Casa Coffee.
SELECT slug, nome, tema FROM public.tenants WHERE slug = 'casacoffeecolab';
