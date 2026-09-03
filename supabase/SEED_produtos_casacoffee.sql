-- ══════════════════════════════════════════════════════════════════
-- SEED · CARDÁPIO do Casa Coffee Colab (produtos + preços)
-- Fonte: "Cadastro de preços por loja e grupo" (loja 1-CASA COFFEE
-- COLAB, tabela Geral, materiais ativos) — relatório do PDV antigo,
-- emitido em 03/09/2026. 272 itens, 29 categorias.
--
-- É a carga inicial do cardápio do tenant (decisão 017 · multi-tenant):
-- nada aqui é global — todo produto nasce amarrado ao tenant de slug
-- 'casacoffeecolab' e a RLS de products faz o resto.
--
-- O QUE FOI PRESERVADO E O QUE FOI TRADUZIDO
--   • Nome do produto: EXATAMENTE como no relatório (inclusive as
--     abreviações do sistema antigo, que tinha limite de 30 caracteres
--     — ex. "SANDUICHE PARMA, BUFALA E PEST"). Renomear é 1 clique em
--     Produtos; inventar o nome completo aqui seria adivinhar.
--   • Preço: idem, sem arredondamento.
--   • Grupo → categoria: o grupo do relatório vira a CATEGORIA do KORA,
--     escrita em português de tela ("CAFES" → "Cafés"), porque categoria
--     é rótulo grande no PDV e caixa-alta sem acento não é rótulo, é
--     dump de dados (CLAUDE.md, princípio nº 1).
--   • Emoji: um por categoria, para o card do PDV ser reconhecível de
--     relance. É decoração, não regra — trocar é 1 clique.
--
-- PONTOS DE ATENÇÃO (o dono decide, nada foi decidido por conta)
--   1. 61 itens vieram com preço R$ 0,00 — são componentes e
--      insumos, não itens de venda (Insumos, Embalagens, Produção-*,
--      as bases/proteínas/toppings do monta-salada, cortesias). Estão
--      cadastrados como o relatório manda, mas vão APARECER no PDV como
--      produto de R$ 0,00. Se a ideia é que não sejam vendáveis, o lugar
--      deles é `subprodutos` (insumo/estoque) ou complemento — vale uma
--      passada depois desta carga.
--   2. A categoria "Desativado" veio assim do sistema antigo (vinhos
--      que saíram de linha). Entram ATIVOS de propósito: o app só
--      carrega produtos com active = true, então nascer inativo é
--      nascer invisível — inclusive na tela de Produtos, onde o dono
--      apagaria. Confira e apague por lá o que não vende mais.
--
-- Itens por categoria:
--   Adega                    6 itens
--   Adicionais              24 itens
--   Adicionais Bebidas      11 itens
--   Base Salad               3 itens
--   Cafés                   26 itens
--   Carbo Salad              6 itens
--   Cerveja                  3 itens
--   Confeitaria             29 itens
--   Cozinha                 42 itens
--   Cozinha Quente           5 itens
--   Desativado               9 itens
--   Diversos                 7 itens
--   Drinks                  10 itens
--   Embalagens               3 itens
--   Especiais                7 itens
--   Fica Mais um Pouco       3 itens
--   Insumos                  9 itens
--   Juices & Sodas          18 itens
--   Matchas                  8 itens
--   Molho Salad              4 itens
--   Produção Café            6 itens
--   Produção Confeitaria     1 itens
--   Produção Cozinha         5 itens
--   Protein Salad            5 itens
--   Saiu do Nosso Forno      1 itens
--   Smoothies                1 itens
--   Sunset Menu             10 itens
--   Toasts                   1 itens
--   Topping Salad            9 itens
--
-- ⚠️ EXECUÇÃO MANUAL no SQL Editor do Supabase, RODANDO O ARQUIVO
-- INTEIRO DE UMA VEZ (o bloco 2 cria uma tabela temporária que os
-- blocos seguintes usam — rodar bloco a bloco a perde).
-- Idempotente: só insere o que ainda não existe (casamento por nome
-- dentro do tenant). Reexecutar depois de uma edição na tela NÃO
-- desfaz a edição — o bloco 4 (re-sincronizar preços) vem comentado.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. CONFERÊNCIA · o tenant existe? ──────────────────────────────
-- Esperado: 1 linha, slug 'casacoffeecolab'. Vazio = provisione o
-- tenant pelo Console da Plataforma antes (docs/05_FLUXOS/
-- ativar-novo-estabelecimento.md) e volte aqui.
SELECT id, nome, slug FROM public.tenants WHERE slug = 'casacoffeecolab';

-- ── 2. A LISTA (tabela temporária, viva só nesta execução) ─────────
CREATE TEMP TABLE itens_cardapio_casa (
  name     text    NOT NULL,
  price    numeric NOT NULL,
  category text    NOT NULL,
  emoji    text
);

INSERT INTO itens_cardapio_casa (name, price, category, emoji) VALUES
  ('ESPUMANTE',                        78.00, 'Adega',                '🍷'),
  ('TAÇA ESPUMANTE',                   38.00, 'Adega',                '🍷'),
  ('TAÇA VINHO BRANCO',                35.00, 'Adega',                '🍷'),
  ('TAÇA VINHO TINTO',                 35.00, 'Adega',                '🍷'),
  ('VINHO BRANCO',                     88.00, 'Adega',                '🍷'),
  ('VINHO TINTO',                      88.00, 'Adega',                '🍷'),
  ('ADD AIOLI DO CASA',                 8.00, 'Adicionais',           '➕'),
  ('ADD BACON 3 FATIAS',               10.00, 'Adicionais',           '➕'),
  ('ADD BOLA DE SORVETE',               8.00, 'Adicionais',           '➕'),
  ('ADD BRIGOUS',                      10.00, 'Adicionais',           '➕'),
  ('ADD CARNE DE PANELA',              16.00, 'Adicionais',           '➕'),
  ('ADD CREAM CHEESE',                  6.00, 'Adicionais',           '➕'),
  ('ADD CREME AVOCADO',                 6.00, 'Adicionais',           '➕'),
  ('ADD DOCE LEITE',                    4.00, 'Adicionais',           '➕'),
  ('ADD FRANGO GRELHADO',              16.00, 'Adicionais',           '➕'),
  ('ADD GELEIA DO CASA FV',             8.00, 'Adicionais',           '➕'),
  ('ADD GORGONZOLA',                   12.00, 'Adicionais',           '➕'),
  ('ADD MANTEIGA',                      8.00, 'Adicionais',           '➕'),
  ('ADD MAPLE',                        10.00, 'Adicionais',           '➕'),
  ('ADD MEL',                          10.00, 'Adicionais',           '➕'),
  ('ADD MINI PANQUECAS',               16.00, 'Adicionais',           '➕'),
  ('ADD OVO FRITO - 1 UN',              4.00, 'Adicionais',           '➕'),
  ('ADD OVOS MEXIDOS - 2UN',            6.00, 'Adicionais',           '➕'),
  ('ADD PANQUECAS AMERICANAS',         16.00, 'Adicionais',           '➕'),
  ('ADD PARMA',                        12.00, 'Adicionais',           '➕'),
  ('ADD PESTO',                         8.00, 'Adicionais',           '➕'),
  ('ADD PÃO',                           8.00, 'Adicionais',           '➕'),
  ('ADD SALMÃO GRAVILAX',              26.00, 'Adicionais',           '➕'),
  ('ADD TOMATE ASSADO',                 6.00, 'Adicionais',           '➕'),
  ('ADD WAFFLE',                        4.00, 'Adicionais',           '➕'),
  ('ADD CALDA CARAMELO',                4.00, 'Adicionais Bebidas',   '➕'),
  ('ADD CALDA CHOCOLATE',               8.00, 'Adicionais Bebidas',   '➕'),
  ('ADD CHANTILY',                     10.00, 'Adicionais Bebidas',   '➕'),
  ('ADD COGUMELO',                     14.00, 'Adicionais Bebidas',   '➕'),
  ('ADD GELEIA MORANGO',               14.00, 'Adicionais Bebidas',   '➕'),
  ('ADD LEITE VAPORIZADO',              8.00, 'Adicionais Bebidas',   '➕'),
  ('ADD LEITE VEGETAL',                 8.00, 'Adicionais Bebidas',   '➕'),
  ('ADD LEITE ZERO LAC',                5.00, 'Adicionais Bebidas',   '➕'),
  ('ADD MUSSARELA',                     8.00, 'Adicionais Bebidas',   '➕'),
  ('ADD POLPA MARACUJA',               14.00, 'Adicionais Bebidas',   '➕'),
  ('ADD XAROPE',                        4.00, 'Adicionais Bebidas',   '➕'),
  ('ALFACE AMERICANO',                  0.00, 'Base Salad',           '🥬'),
  ('MIX FOLHAS VERDES',                 0.00, 'Base Salad',           '🥬'),
  ('RUCULA BABY',                       0.00, 'Base Salad',           '🥬'),
  ('AMERICANO',                        15.00, 'Cafés',                '☕'),
  ('CAPPUCINO ITALIANO MEDIO',         17.50, 'Cafés',                '☕'),
  ('CARAMEL MACHIATTO',                17.50, 'Cafés',                '☕'),
  ('CARIOCA DUPLO',                    12.80, 'Cafés',                '☕'),
  ('CHOCOLATE QUENTE',                 18.80, 'Cafés',                '☕'),
  ('COFFEE LATTE MEDIO',               16.80, 'Cafés',                '☕'),
  ('COFFEE TONIC',                     26.80, 'Cafés',                '☕'),
  ('COFFEE TONIC ZERO',                26.80, 'Cafés',                '☕'),
  ('CORTESIA CAFE',                     0.00, 'Cafés',                '☕'),
  ('ESPRESSO DUPLO',                   12.80, 'Cafés',                '☕'),
  ('ESPRESSO SIMPLES',                 10.80, 'Cafés',                '☕'),
  ('HARIO V60 300ML',                  24.00, 'Cafés',                '☕'),
  ('HARIO V60 500ML',                  30.00, 'Cafés',                '☕'),
  ('ICED BLACK',                       26.80, 'Cafés',                '☕'),
  ('ICED CARAMEL',                     26.80, 'Cafés',                '☕'),
  ('ICED LATTE',                       26.80, 'Cafés',                '☕'),
  ('ICED MOCHA',                       26.80, 'Cafés',                '☕'),
  ('ICED VANILLA',                     26.80, 'Cafés',                '☕'),
  ('ICED VANILLA DREAM',               28.00, 'Cafés',                '☕'),
  ('MACHIATTO DUPLO',                  16.50, 'Cafés',                '☕'),
  ('MOCHA',                            17.50, 'Cafés',                '☕'),
  ('ORANGE COFFEE',                    26.80, 'Cafés',                '☕'),
  ('PASSADO CLASSICO',                 12.80, 'Cafés',                '☕'),
  ('PRENSA FRANCESA 300ML',            24.00, 'Cafés',                '☕'),
  ('PRENSA FRANCESA 500ML',            30.00, 'Cafés',                '☕'),
  ('VANILLA LATTE COFFEE',             17.50, 'Cafés',                '☕'),
  ('ARROZ INTEGRAL MY SALAD',           0.00, 'Carbo Salad',          '🍝'),
  ('CROUTONS DE PAO LEVAIN',            0.00, 'Carbo Salad',          '🍝'),
  ('NACHOS SALAD',                      0.00, 'Carbo Salad',          '🍝'),
  ('PENNE INTEGRAL',                    0.00, 'Carbo Salad',          '🍝'),
  ('QUINOA',                            0.00, 'Carbo Salad',          '🍝'),
  ('TIE (GRAVATINHA)',                  0.00, 'Carbo Salad',          '🍝'),
  ('CHOPP PILSEN',                     15.00, 'Cerveja',              '🍺'),
  ('HEINEKEN LONG NECK',               12.00, 'Cerveja',              '🍺'),
  ('HEINEKEN LONG NECK ZERO',          12.00, 'Cerveja',              '🍺'),
  ('BOLO FATIA CHOCOLATUDO',           35.00, 'Confeitaria',          '🍰'),
  ('BOLO FATIA COFFEE E CARAMEL',      35.00, 'Confeitaria',          '🍰'),
  ('BOLO FATIA MADEMOISELLE',          35.00, 'Confeitaria',          '🍰'),
  ('BOLO FATIA MARACUJA',              35.00, 'Confeitaria',          '🍰'),
  ('BOLO FATIA PISTACHE',              35.00, 'Confeitaria',          '🍰'),
  ('BOLO FATIA RED VELVET',            35.00, 'Confeitaria',          '🍰'),
  ('BOLO GISELE FATIA',                28.00, 'Confeitaria',          '🍰'),
  ('BROWNIE CLASSICO',                 22.00, 'Confeitaria',          '🍰'),
  ('BROWNIE CLASSICO COM SORVETE',     28.00, 'Confeitaria',          '🍰'),
  ('CHEESE COLAB FRUTAS VERMELHAS',    35.00, 'Confeitaria',          '🍰'),
  ('CINNAMON ROLL BRANCO E MORANGO',   28.00, 'Confeitaria',          '🍰'),
  ('CINNAMON ROLL BRIGADEIRO',         28.00, 'Confeitaria',          '🍰'),
  ('CINNAMON ROLL C/ SORVETE',         32.00, 'Confeitaria',          '🍰'),
  ('CINNAMON ROLL C/CREME NEUTRO',     28.00, 'Confeitaria',          '🍰'),
  ('CINNAMON ROLL CHURROS',            28.00, 'Confeitaria',          '🍰'),
  ('CINNAMON ROLL CREME BRULLE',       28.00, 'Confeitaria',          '🍰'),
  ('CINNAMON ROLL GELEIA FV',          28.00, 'Confeitaria',          '🍰'),
  ('CINNAMON ROLL LIMÃO',              28.00, 'Confeitaria',          '🍰'),
  ('CINNAMON ROLL S/CREME',            28.00, 'Confeitaria',          '🍰'),
  ('COOKIE CAFE 80G',                   6.00, 'Confeitaria',          '🍰'),
  ('COOKIE DARK',                      18.00, 'Confeitaria',          '🍰'),
  ('COOKIE DUO',                       18.00, 'Confeitaria',          '🍰'),
  ('COOKIE RED',                       18.00, 'Confeitaria',          '🍰'),
  ('CROISSANT DOCE DE LEITE C/MORA',   36.00, 'Confeitaria',          '🍰'),
  ('PASTEL DE NATA',                   18.00, 'Confeitaria',          '🍰'),
  ('PETIT LAB CAFE',                   28.00, 'Confeitaria',          '🍰'),
  ('PETIT LAB CHOCO C/ MORANGO',       28.00, 'Confeitaria',          '🍰'),
  ('PETIT LAB CREME DE COCO',          28.00, 'Confeitaria',          '🍰'),
  ('PETIT LAB LIMÃO C/ FV',            28.00, 'Confeitaria',          '🍰'),
  ('AMERICAN TOAST',                   38.00, 'Cozinha',              '🍳'),
  ('AVO BRUNCH',                       48.00, 'Cozinha',              '🍳'),
  ('AVOCADO MORNING',                  38.00, 'Cozinha',              '🍳'),
  ('AVOCADO MORNING BACON',            48.00, 'Cozinha',              '🍳'),
  ('AVOCADO MORNING COGUMELO',         58.00, 'Cozinha',              '🍳'),
  ('AVOCADO MORNING SALMÃO',           58.00, 'Cozinha',              '🍳'),
  ('BAGEL - OVOS E BACON',             42.00, 'Cozinha',              '🍳'),
  ('BAGEL CLASSICO',                   22.00, 'Cozinha',              '🍳'),
  ('BAGEL SALMON',                     58.00, 'Cozinha',              '🍳'),
  ('BRUNCH O DE CASA - COMBO',         44.00, 'Cozinha',              '🍳'),
  ('BRUSCHETTA CAPRESE',               58.00, 'Cozinha',              '🍳'),
  ('BRUSCHETTA FIGO E GORGONZOLA',     58.00, 'Cozinha',              '🍳'),
  ('CIABATA CAPRESE',                  28.00, 'Cozinha',              '🍳'),
  ('CREPIOCA',                         38.00, 'Cozinha',              '🍳'),
  ('CROISSANT CLASSICO',               24.00, 'Cozinha',              '🍳'),
  ('CROISSANT PARMA E BRIE',           38.00, 'Cozinha',              '🍳'),
  ('CROISSANT PRESUNTO E QUEIJO',      28.00, 'Cozinha',              '🍳'),
  ('CROISSANT SALMON',                 48.00, 'Cozinha',              '🍳'),
  ('CROISSANT SMASH',                  68.00, 'Cozinha',              '🍳'),
  ('CROQUE MADAME',                    48.00, 'Cozinha',              '🍳'),
  ('CROQUETA DO CASA',                 58.00, 'Cozinha',              '🍳'),
  ('EMPANADA CARNE',                   14.00, 'Cozinha',              '🍳'),
  ('ENGLISH MUFFIN',                   58.00, 'Cozinha',              '🍳'),
  ('FIG E PARMA',                      48.00, 'Cozinha',              '🍳'),
  ('FUNGHI & EGGS',                    38.00, 'Cozinha',              '🍳'),
  ('MINI BRUNCH PANCAKES',             38.00, 'Cozinha',              '🍳'),
  ('MINI BRUNCH TOAST',                38.00, 'Cozinha',              '🍳'),
  ('MISTO QUENTE',                     28.00, 'Cozinha',              '🍳'),
  ('PAO DE QUEIJO',                    14.50, 'Cozinha',              '🍳'),
  ('PLATTER BRUNCH',                   78.00, 'Cozinha',              '🍳'),
  ('PULLED BAGEL',                     48.00, 'Cozinha',              '🍳'),
  ('PÃO NA CHAPA MANTEIGA',            14.00, 'Cozinha',              '🍳'),
  ('QUEIJO QUENTE',                    28.00, 'Cozinha',              '🍳'),
  ('SALMON BRUNCH',                    62.00, 'Cozinha',              '🍳'),
  ('SALMON TOAST',                     52.00, 'Cozinha',              '🍳'),
  ('SANDUICHE CARNE PANELA',           48.00, 'Cozinha',              '🍳'),
  ('SANDUICHE PARMA, BUFALA E PEST',   44.00, 'Cozinha',              '🍳'),
  ('SANDUICHE PRESUNTO E QUEIJO',      38.00, 'Cozinha',              '🍳'),
  ('SUNNY HONEY PANCAKES',             48.00, 'Cozinha',              '🍳'),
  ('TOAST CAPRESE',                    28.00, 'Cozinha',              '🍳'),
  ('TUSKANY MORNING',                  52.00, 'Cozinha',              '🍳'),
  ('VEGAN BRUNCH',                     48.00, 'Cozinha',              '🍳'),
  ('CAPELETTI DO CASA',                48.00, 'Cozinha Quente',       '🍲'),
  ('CREME DE CABOTIA',                 38.00, 'Cozinha Quente',       '🍲'),
  ('GNNOCHI RAGU',                     48.00, 'Cozinha Quente',       '🍲'),
  ('LIMONE PASTA',                     48.00, 'Cozinha Quente',       '🍲'),
  ('PENNE TOSCANA',                    48.00, 'Cozinha Quente',       '🍲'),
  ('CARAMELO + FLOR DE SAL',           26.00, 'Desativado',           '🚫'),
  ('CHOCOLATE + OVOMALTINE',           26.00, 'Desativado',           '🚫'),
  ('VINHO ADELLE PINOTAGE',            98.00, 'Desativado',           '🚫'),
  ('VINHO BACCA NERA',                120.00, 'Desativado',           '🚫'),
  ('VINHO BOLAND ROSE',                98.00, 'Desativado',           '🚫'),
  ('VINHO LADRILHO BRANCO',           108.00, 'Desativado',           '🚫'),
  ('VINHO LADRILHO TINTO',             88.00, 'Desativado',           '🚫'),
  ('VINHO TOURIGA PORT',               98.00, 'Desativado',           '🚫'),
  ('VINHO VEGANO VEGANTE SUPERIORE',   98.00, 'Desativado',           '🚫'),
  ('DIV',                             120.00, 'Diversos',             '🎁'),
  ('PÃO INT FERMENTAÇÃO NAT',          35.00, 'Diversos',             '🎁'),
  ('VALE PRESENTE 100 REAIS',         100.00, 'Diversos',             '🎁'),
  ('VALE PRESENTE 150 REAIS',         150.00, 'Diversos',             '🎁'),
  ('VALE PRESENTE 20 REAIS',           20.00, 'Diversos',             '🎁'),
  ('VALE PRESENTE 50 REAIS',           50.00, 'Diversos',             '🎁'),
  ('VALE PRESENTE 80 REAIS',           80.00, 'Diversos',             '🎁'),
  ('APEROL SPRITZ',                    35.00, 'Drinks',               '🍹'),
  ('CAIPILAB CACHAÇA',                 38.00, 'Drinks',               '🍹'),
  ('CAIPILAB VODKA',                   35.00, 'Drinks',               '🍹'),
  ('GIN TONICA',                       35.00, 'Drinks',               '🍹'),
  ('MARGARITA',                        38.00, 'Drinks',               '🍹'),
  ('MOJITO',                           35.00, 'Drinks',               '🍹'),
  ('MOSCOW MULE',                      38.00, 'Drinks',               '🍹'),
  ('NEGRONI',                          38.00, 'Drinks',               '🍹'),
  ('QUENTAO',                           8.00, 'Drinks',               '🍹'),
  ('VELVET SOUR',                      35.00, 'Drinks',               '🍹'),
  ('KRAFT G',                           0.00, 'Embalagens',           '📦'),
  ('KRAFT M',                           0.00, 'Embalagens',           '📦'),
  ('KRAFT P',                           0.00, 'Embalagens',           '📦'),
  ('BROWNIE ANIVER',                    0.00, 'Especiais',            '⭐'),
  ('BRUNCH ANIVERSARIANTE',             0.00, 'Especiais',            '⭐'),
  ('CAFE GRAO',                        68.00, 'Especiais',            '⭐'),
  ('DIA DAS MAES',                    118.00, 'Especiais',            '⭐'),
  ('INCENSO',                          12.00, 'Especiais',            '⭐'),
  ('SALADA COMPLETA',                  42.00, 'Especiais',            '⭐'),
  ('SALADA LEVE',                      38.00, 'Especiais',            '⭐'),
  ('BRUSCHETTA DO CASA',               58.00, 'Fica Mais um Pouco',   '🍢'),
  ('NACHOS DO CASA',                   48.00, 'Fica Mais um Pouco',   '🍢'),
  ('TORTILLA DO CASA',                 58.00, 'Fica Mais um Pouco',   '🍢'),
  ('PRESUNTO',                          0.00, 'Insumos',              '🧂'),
  ('QUEIJO MUSSARELA',                  0.00, 'Insumos',              '🧂'),
  ('XAROPE BAUNILHA',                   0.00, 'Insumos',              '🧂'),
  ('XAROPE BLUEBERRY',                  0.00, 'Insumos',              '🧂'),
  ('XAROPE FRUTAS VERMELHAS',           0.00, 'Insumos',              '🧂'),
  ('XAROPE LIMAO SICILIANO',            0.00, 'Insumos',              '🧂'),
  ('XAROPE MARACUJA',                   0.00, 'Insumos',              '🧂'),
  ('XAROPE MAÇA VERDE',                 0.00, 'Insumos',              '🧂'),
  ('XAROPE PINK LIMONADE',              0.00, 'Insumos',              '🧂'),
  ('AGUA COM GAS COPA',                 8.00, 'Juices & Sodas',       '🥤'),
  ('AGUA SEM GAS COPA',                 8.00, 'Juices & Sodas',       '🥤'),
  ('BLEND FLOW',                       18.00, 'Juices & Sodas',       '🥤'),
  ('CHA BLEND',                        18.00, 'Juices & Sodas',       '🥤'),
  ('CHA HIBISCO QUENTE',               18.00, 'Juices & Sodas',       '🥤'),
  ('COCA COLA',                         8.00, 'Juices & Sodas',       '🥤'),
  ('COCA COLA ZERO',                    8.00, 'Juices & Sodas',       '🥤'),
  ('GUARANA',                           8.00, 'Juices & Sodas',       '🥤'),
  ('GUARANA ZERO',                      8.00, 'Juices & Sodas',       '🥤'),
  ('HIBISCUS TEA',                     18.00, 'Juices & Sodas',       '🥤'),
  ('KATZE LIMÃO C/ GENGIBRE',           8.00, 'Juices & Sodas',       '🥤'),
  ('ROLHA DO VINHO',                   20.00, 'Juices & Sodas',       '🥤'),
  ('SODA ITALIANA',                    18.00, 'Juices & Sodas',       '🥤'),
  ('SUCO INTEGRAL LARANJA',            15.80, 'Juices & Sodas',       '🥤'),
  ('SUCO INTEGRAL UVA',                15.80, 'Juices & Sodas',       '🥤'),
  ('SUCO VERDE',                       18.00, 'Juices & Sodas',       '🥤'),
  ('TONICA',                            8.00, 'Juices & Sodas',       '🥤'),
  ('TONICA ZERO',                       8.00, 'Juices & Sodas',       '🥤'),
  ('CARAMEL ICED MATCHA',              28.80, 'Matchas',              '🍵'),
  ('HOT LATTE MATCHA',                 22.00, 'Matchas',              '🍵'),
  ('HOT VANILLA MATCHA',               24.00, 'Matchas',              '🍵'),
  ('ICED LATTE MATCHA',                26.80, 'Matchas',              '🍵'),
  ('ORANGE MATCHA',                    26.80, 'Matchas',              '🍵'),
  ('PASSION MATCHA',                   30.00, 'Matchas',              '🍵'),
  ('STRAWBERRY ICED MATCHA',           30.00, 'Matchas',              '🍵'),
  ('VANILLA ICED MATCHA',              28.80, 'Matchas',              '🍵'),
  ('IOGURTE ESPECIAL',                  0.00, 'Molho Salad',          '🫙'),
  ('LIMAO AZEITE E SAL',                0.00, 'Molho Salad',          '🫙'),
  ('MOSTARDA E MEL',                    0.00, 'Molho Salad',          '🫙'),
  ('VINAGRETE DE LARANJA',              0.00, 'Molho Salad',          '🫙'),
  ('PUMP GENGIBRE',                     0.00, 'Produção Café',        '⚙️'),
  ('SABOR FRUTAS VERMELHAS SODA',       0.00, 'Produção Café',        '⚙️'),
  ('SABOR LIMAO SICILIANO SODA',        0.00, 'Produção Café',        '⚙️'),
  ('SABOR MACA VERDE SODA',             0.00, 'Produção Café',        '⚙️'),
  ('SABOR MARACUJA SODA',               0.00, 'Produção Café',        '⚙️'),
  ('SABOR PINK LIMONADE SODA',          0.00, 'Produção Café',        '⚙️'),
  ('BOLO DO DIA GISELE',               28.00, 'Produção Confeitaria', '⚙️'),
  ('CAPONATA DE BERINJELA',             0.00, 'Produção Cozinha',     '⚙️'),
  ('CARNE DE PANELA DO CASA PROD',      0.00, 'Produção Cozinha',     '⚙️'),
  ('COGUMELOS COM CORGONZOLA',          0.00, 'Produção Cozinha',     '⚙️'),
  ('PESTO',                             0.00, 'Produção Cozinha',     '⚙️'),
  ('TOMATE ASSADO',                     0.00, 'Produção Cozinha',     '⚙️'),
  ('ATUM',                              0.00, 'Protein Salad',        '🍗'),
  ('COGUMELOS MY SALAD',                0.00, 'Protein Salad',        '🍗'),
  ('FRANGO CRISPY',                     0.00, 'Protein Salad',        '🍗'),
  ('FRANGO GRELHADO',                   0.00, 'Protein Salad',        '🍗'),
  ('OVO COZIDO',                        0.00, 'Protein Salad',        '🍗'),
  ('Torta bolo grande Pistache',      368.00, 'Saiu do Nosso Forno',  '🎂'),
  ('SMOOTHIE MORANGO',                 26.00, 'Smoothies',            '🍓'),
  ('CORTESIA DRINK SENSORIAL',          0.00, 'Sunset Menu',          '🌅'),
  ('DRINK SENSORIAL',                  38.00, 'Sunset Menu',          '🌅'),
  ('EMPANADA CARNE(2 UNIDADES)',       38.00, 'Sunset Menu',          '🌅'),
  ('SENSORIAL ACIDO',                   0.00, 'Sunset Menu',          '🌅'),
  ('SENSORIAL AMARGO',                  0.00, 'Sunset Menu',          '🌅'),
  ('SENSORIAL CITRICO',                 0.00, 'Sunset Menu',          '🌅'),
  ('SENSORIAL DOCE',                    0.00, 'Sunset Menu',          '🌅'),
  ('SENSORIAL HERBAL',                  0.00, 'Sunset Menu',          '🌅'),
  ('SENSORIAL PICANTE',                 0.00, 'Sunset Menu',          '🌅'),
  ('SOBREMESA GISELE',                  0.00, 'Sunset Menu',          '🌅'),
  ('HOMMUS TOAST',                     44.00, 'Toasts',               '🍞'),
  ('FAROFINHA DE SOJA',                 0.00, 'Topping Salad',        '🌰'),
  ('LAMINA DE AMENDOAS',                0.00, 'Topping Salad',        '🌰'),
  ('LAMINA DE COCO',                    0.00, 'Topping Salad',        '🌰'),
  ('MIRTILO DESIDRATADO',               0.00, 'Topping Salad',        '🌰'),
  ('MIX DE SEMENTES',                   0.00, 'Topping Salad',        '🌰'),
  ('PARMESAO RALADO',                   0.00, 'Topping Salad',        '🌰'),
  ('PEPINO',                            0.00, 'Topping Salad',        '🌰'),
  ('PICLES DE CEBOLA ROXA',             0.00, 'Topping Salad',        '🌰'),
  ('TOMATE CEREJA',                     0.00, 'Topping Salad',        '🌰');

-- Conferência da lista carregada: esperado 272.
SELECT count(*) AS itens_na_lista FROM itens_cardapio_casa;

-- ── 3. AÇÃO · cadastrar o que ainda não existe ─────────────────────
-- Casamento por nome (products não tem unique em name — nome só é
-- único DENTRO do tenant), normalizado sem espaço/caixa para não
-- duplicar por diferença boba de digitação.
WITH cadastrados AS (
  INSERT INTO public.products (name, price, category, emoji, active, tenant_id)
  SELECT i.name, i.price, i.category, i.emoji, true, t.id
  FROM itens_cardapio_casa i
  CROSS JOIN (SELECT id FROM public.tenants WHERE slug = 'casacoffeecolab') t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.products p
     WHERE p.tenant_id = t.id
       AND lower(btrim(p.name)) = lower(btrim(i.name))
  )
  RETURNING 1
)
SELECT count(*) AS produtos_cadastrados FROM cadastrados;
-- Esperado na 1ª execução: 272. Na 2ª: 0 (idempotente).

-- ── 4. AÇÃO OPCIONAL · re-sincronizar preço/categoria com a tabela ─
-- Só rode (descomentando) se quiser que a tabela do relatório volte a
-- valer POR CIMA do que estiver no sistema. Sobrescreve preço editado
-- na tela — por isso nasce desligado.
-- UPDATE public.products p
--    SET price = i.price, category = i.category
--   FROM itens_cardapio_casa i,
--        (SELECT id FROM public.tenants WHERE slug = 'casacoffeecolab') t
--  WHERE p.tenant_id = t.id
--    AND lower(btrim(p.name)) = lower(btrim(i.name))
--    AND (p.price <> i.price OR p.category IS DISTINCT FROM i.category)
-- RETURNING p.name, p.price, p.category;

-- ── 5. CONFERÊNCIA · como ficou o cardápio do tenant ───────────────
SELECT p.category AS categoria,
       count(*)   AS itens,
       min(p.price) AS menor_preco,
       max(p.price) AS maior_preco
FROM public.products p
JOIN public.tenants t ON t.id = p.tenant_id
WHERE t.slug = 'casacoffeecolab'
GROUP BY p.category
ORDER BY p.category;

DROP TABLE itens_cardapio_casa;
