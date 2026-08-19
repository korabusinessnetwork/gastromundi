# Prompts — posts de Instagram da KORA

Dois prompts prontos para colar no **Claude (skill de design)** quando quisermos gerar
peças para o Instagram da KORA. Cada prompt é **autocontido**: leva a marca, a identidade
visual real (tokens do código), o que o produto de fato faz e o tom de voz — para a peça
sair fiel ao produto, sem inventar funcionalidade.

- **Prompt 1** — post sobre **o sistema PDV** (o que a Frente de Caixa faz).
- **Prompt 2** — post sobre **o que é a KORA** (a plataforma por trás dos sistemas).

**Como usar:** abra uma conversa nova, cole **um** prompt por vez, e mande. Peça ajustes
depois ("card 3 com menos texto", "capa mais escura") em vez de reescrever o prompt.

**Ao mudar preço, módulo ou identidade, atualize aqui também.** Fontes de verdade:
`memory/identity.md` (posicionamento e tom), `src/pages/apex/ApexPlanos.jsx` (preços
públicos), `src/styles/tema.css` (cores do produto), `src/pages/apex/ApexPage.css`
(cores do site), `src/components/shared/KoraMonograma.jsx` (símbolo oficial).

---

## Prompt 1 — Post: o que é o PDV da KORA

````
Você é diretor de arte e redator da KORA. Crie um post de Instagram (carrossel)
explicando o que é a Frente de Caixa (PDV) da KORA.

## Quem é a KORA
KORA é uma plataforma de software para o balcão de restaurantes, bares, cafés, padarias
e mercados. Vendemos o sistema white-label: cada estabelecimento roda o sistema com a
marca dele, assinado "by Kora" embaixo. O Instagram é o da KORA (a plataforma), não o de
um restaurante específico — nunca use nome, logo ou dado de cliente nenhum.

Manifesto da marca: "Do balcão à decisão, tudo num lugar só."

## O que o post precisa comunicar
A Frente de Caixa é o coração do sistema — a tela onde a venda acontece. E a grande
sacada: **a venda é a transação-fonte**. Ela não morre no caixa; ela se espalha sozinha
para o resto do sistema. É esse "uma venda, tudo atualizado" que o post tem que vender.

O que a Frente de Caixa faz (tudo isto já existe e roda em cliente real — não invente
nada além desta lista):
- Vende de quatro jeitos: **balcão, mesa/comanda, retirada e delivery**.
- Recebe em **dinheiro, cartão, Pix e fiado** — e aceita **pagamento dividido** (parte
  no cartão, parte no Pix, na mesma venda).
- Fiado vira **conta a receber** no Financeiro automaticamente, com o cliente vinculado.
- **Baixa o estoque** no momento em que a venda fecha.
- Alimenta o **Caixa** (abertura, sangria, fechamento com conferência), o **Financeiro**,
  os **Relatórios** e o **Jarvas** (nossa camada de IA) — sem ninguém redigitar nada.
- Emite **NFC-e em um toque**, com contingência.
- **Funciona offline**: a KORA Ponte é um programinha no PC do caixa que mantém o pedido
  entrando e a comanda imprimindo quando a internet cai. O movimento não para.
- Desconto tem limite por cargo; venda em dinheiro exige caixa aberto. O sistema previne
  o erro antes de ele acontecer.

Ângulo do post (o inimigo): o "PDV genérico" registra a venda e para por aí — o dono
ainda vai pra planilha no fim do dia. Na KORA a venda já chega no estoque, no financeiro
e no relatório. Use esse contraste, sem citar concorrente pelo nome.

## Formato
- Carrossel de **5 cards**, cada um **1080 × 1350 px** (4:5).
- Sugestão de roteiro (pode ajustar, mantendo 5 cards):
  1. **Capa** — a promessa em poucas palavras + o mock da tela. Tem que fazer sentido
     sozinha no feed, em miniatura.
  2. **Como se vende** — balcão, mesa/comanda, retirada, delivery.
  3. **Como se recebe** — dinheiro, cartão, Pix, fiado + pagamento dividido.
  4. **O que acontece depois da venda** — estoque, caixa, financeiro, relatórios, Jarvas.
     Este é o card mais importante: mostre o efeito dominó de uma venda só.
  5. **Fechamento** — NFC-e em um toque + funciona offline + chamada para ação.
- Se preferir entregar uma imagem única, use só o card 1 — mas o padrão é o carrossel.
- Cada card precisa ser legível no tamanho de miniatura: no máximo ~12 palavras de
  título, texto de apoio curto, respiro generoso. Nada de parágrafo em post.

## Identidade visual (use o visual DO PRODUTO — tema escuro)
Este post mostra o sistema, então use as cores reais da interface (`src/styles/tema.css`):
- Fundo: `#070b14` · Cartão: `#0e1220` · Superfície elevada: `#161b2c` · Borda: `#28324d`
- Destaque/marca (roxo): `#7c3aed` — é a cor de ação, use com parcimônia
- Sucesso `#10b981` · Alerta `#f59e0b` · Erro `#ef4444` · Info `#3b82f6`
- Texto: `#eef2f7` · Texto secundário: `#9aa8c4`
- Tipografia: **Inter** para tudo. Números de dinheiro, quantidade e horário em
  **JetBrains Mono** com `font-variant-numeric: tabular-nums` (os dígitos precisam
  alinhar em coluna — isso é regra do nosso design system, não capricho).
- Títulos grandes com `letter-spacing: -0.011em`.
- Símbolo da KORA: monograma oficial em SVG, um "K" de três traços arredondados — haste
  vertical roxa, diagonal superior azul, diagonal inferior verde. Reproduza exatamente:

```html
<svg viewBox="-3 -8 36 44" aria-label="KORA">
  <rect x="2" y="0" width="7" height="30" rx="3.5" fill="#B8B0F0"/>
  <rect x="9" y="-4" width="7" height="19" rx="3.5" fill="#3E8DD6" transform="rotate(45 9 15)"/>
  <rect x="9" y="15" width="7" height="19" rx="3.5" fill="#37BFA7" transform="rotate(-45 9 15)"/>
</svg>
```

(em fundo escuro a haste é lilás `#B8B0F0`; azul e verde nunca mudam)

- Estética: premium, calma, operacional — na régua de Linear, Stripe e Notion. Nada de
  gradiente berrante, emoji decorativo, ícone 3D, brilho ou "vetor de restaurante"
  genérico de banco de imagem. Contraste mínimo AA.
- Se for desenhar uma tela mockada, use dados fictícios e plausíveis de restaurante
  (ex.: "Mesa 12 · Comanda aberta", "Burger da casa R$ 34,90", "Total R$ 97,24",
  "Cobrar com Pix"). Nunca dado real de cliente.

## Tom de voz
Português do dia a dia do balcão. Frase curta, afirmativa, sem jargão técnico e sem
promessa vaga. O sistema fala como um colega competente, não como um manual.

✅ "Caixa fechado. Diferença de R$ 0,00. Tudo certo."
❌ "Operação de fechamento de sessão de caixa concluída com êxito."

✅ "Vendeu. O estoque já sabe."
❌ "Sincronização automática de inventário em tempo real."

Nunca escreva "solução completa", "revolucionar", "otimize sua gestão", "potencialize
seus resultados". Fale do que acontece na prática, na terça-feira, às 12h30.

## Quem está do outro lado
Dono de restaurante/bar/café pequeno ou médio, que hoje vive de PDV isolado + planilha +
caderno, e fecha o mês sem saber a margem. Ele não é técnico. Ele quer parar de
redigitar as coisas e confiar no número.

## Não prometa (ainda não está no ar)
Delivery próprio (site de pedidos) e TEF/maquininha integrada estão aprovados mas ainda
não implementados — cite delivery só como forma de venda registrada no PDV, nunca como
"seu site de pedidos". Não cite integração com iFood/Rappi. Não invente número de cliente,
nota de app, prêmio, "+1.000 restaurantes" ou depoimento — não temos, e post com prova
falsa quebra a marca.

## Entregue
1. Os 5 cards como imagens/artes prontas para publicar (1080 × 1350).
2. A **legenda** do post em português: abertura que segura o scroll na primeira linha,
   3 a 5 linhas de texto, chamada para ação ("Chama no direct pra ver o KORA rodando") e
   5 a 8 hashtags relevantes de restaurante/gestão/PDV no fim.
3. Um **texto alternativo (alt)** curto por card, para acessibilidade.
````

---

## Prompt 2 — Post: o que é a KORA

````
Você é diretor de arte e redator da KORA. Crie um post de Instagram (carrossel)
apresentando o que é a KORA — este é o post de apresentação da marca, para quem chega no
perfil sem saber o que a gente faz.

## O que é a KORA (a essência do post)
KORA é a plataforma que roda o sistema do estabelecimento — do balcão à decisão, tudo num
lugar só. Não é "mais um PDV": é o sistema operacional do negócio, e ele sai **com a cara
de cada estabelecimento**.

Três ideias que sustentam o post, nesta ordem de importância:

1. **Tudo num lugar só.** Frente de caixa, caixa, pedidos, mesas e comandas, tela da
   cozinha, estoque, financeiro, clientes, relatórios. A venda entra uma vez e se espalha
   sozinha por todo o resto — sem planilha, sem redigitar, sem "depois eu lanço".

2. **O sistema é seu, não nosso.** A KORA é white-label: o sistema roda com o nome, a
   logo e as cores do estabelecimento — assinado discretamente "by Kora". Cada cliente
   liga só os módulos que usa. A frase da casa é: "do nosso jeito? não — do SEU."

3. **JARVAS, o gerente virtual com IA.** Uma camada de inteligência que observa a
   operação e avisa: queda de venda, ruptura de estoque, divergência no caixa, sugestão
   de compra, resumo do dia. O JARVAS **nunca executa nada sozinho** — ele mostra, a
   pessoa decide. Esse é o nosso diferencial de verdade: os sistemas dessa faixa de preço
   não têm IA.

Provas rápidas que podem entrar (todas verdadeiras):
- **Mesmo dia** vendendo pelo sistema — a gente monta o cardápio junto na demonstração.
- **1 turno** para a equipe dominar o caixa.
- **NFC-e** em um toque, com contingência.
- **Funciona offline** — o movimento não para quando a internet cai.
- **Personalizado** — o sistema com a cara da casa.
- Demonstração ao vivo de 30 min · sem fidelidade · 30 dias de garantia.

Preço (modelo atual, do site): base **Essencial R$ 149/mês** e a partir daí o dono **monta
o plano** ligando os módulos que precisa (estoque, comandas, mesas, cozinha, financeiro,
clientes, relatórios, multi-loja, JARVAS) e os add-ons fiscais. Existem 3 combinações
prontas: **Balcão**, **Restaurante** e **Kora Total** (tudo ligado, com JARVAS e emissão
fiscal). Se for mostrar preço no card, mostre só "a partir de R$ 149/mês, você monta o
seu" — não coloque tabela de preço em post, é ilegível e envelhece rápido.

## Formato
- Carrossel de **4 cards**, cada um **1080 × 1350 px** (4:5).
- Sugestão de roteiro:
  1. **Capa** — "O que é a KORA" respondido em uma frase, com o monograma em destaque.
     Precisa funcionar sozinha, em miniatura, para quem nunca ouviu falar da gente.
  2. **Tudo num lugar só** — os módulos como um sistema conectado (não como lista de
     ícone solto): mostre que a informação circula entre eles.
  3. **Com a sua cara** — a ideia do white-label: o mesmo sistema, marcas diferentes.
     Se desenhar exemplos de marca, invente nomes fictícios de restaurante.
  4. **JARVAS + fechamento** — a IA que avisa e não decide sozinha, mais a chamada para
     ação (demonstração de 30 min, sem fidelidade).
- Se preferir entregar uma imagem única, use só o card 1.
- No máximo ~12 palavras de título por card. Respiro > densidade.

## Identidade visual (use a identidade DA PLATAFORMA)
Paleta oficial do site da KORA (`src/pages/apex/ApexPage.css`):
- Roxo (marca): `#473CA8` · Azul: `#3E8DD6` · Verde: `#37BFA7`
- Tinta (fundo escuro): `#1B1930` · Rodapé mais escuro: `#14121F`
- Grafite (texto): `#3F3E52` · Névoa (texto fraco): `#77768A`
- Linha: `#E6E5EE` · Fundo claro: `#F8F8FB`
- Sucesso `#19B575` · Alerta `#E8A23B` · Erro `#DE3F32`
- Tipografia: **Sora** em títulos e botões, **Space Grotesk** no corpo do texto.
- Símbolo oficial da KORA — "K" de três traços arredondados, haste roxa, diagonal
  superior azul, diagonal inferior verde. Reproduza exatamente esta geometria:

```html
<svg viewBox="-3 -8 36 44" aria-label="KORA">
  <rect x="2" y="0" width="7" height="30" rx="3.5" fill="#473CA8"/>
  <rect x="9" y="-4" width="7" height="19" rx="3.5" fill="#3E8DD6" transform="rotate(45 9 15)"/>
  <rect x="9" y="15" width="7" height="19" rx="3.5" fill="#37BFA7" transform="rotate(-45 9 15)"/>
</svg>
```

(em fundo escuro, troque a haste roxa por lilás `#B8B0F0` para manter o contraste; azul e
verde nunca mudam)

- **Ritmo do carrossel**: capa e card final em fundo tinta `#1B1930`; cards do meio em
  fundo claro `#F8F8FB`. É o mesmo ritmo do nosso site — e mantém a capa escura, igual à
  dos outros posts, para o feed ficar coerente.
- Se algum card mostrar a tela do produto, aí sim use o tema escuro do sistema
  (fundo `#070b14`, cartão `#0e1220`, destaque `#7c3aed`, texto `#eef2f7`, fonte Inter
  com números tabulares) — é o produto de verdade aparecendo, não uma peça genérica.
- Estética: premium, calma, confiante. Referências: Linear, Stripe, Notion. Nada de
  gradiente berrante, emoji decorativo, ícone 3D ou foto de banco de imagem. Contraste
  mínimo AA.

## Tom de voz
Português do dia a dia de quem trabalha em restaurante. Direto, humano, sem jargão e sem
superlativo de agência.

✅ "Do balcão à decisão, tudo num lugar só."
✅ "O sistema é seu. A gente só assina embaixo."
❌ "A solução completa e inovadora para revolucionar a gestão do seu negócio."

## Quem está do outro lado
Dono de restaurante, bar, café, padaria ou mercado — pequeno ou médio. Hoje ele usa um
PDV isolado, planilhas e caderno; fecha o mês sem saber a margem real. Não é técnico,
tem pouco tempo, e já se decepcionou com sistema que prometeu demais.

## Não prometa (ainda não está no ar)
Site próprio de delivery e TEF/maquininha integrada estão aprovados mas ainda não
implementados — não anuncie. Não cite integração com iFood/Rappi. Não invente número de
clientes, avaliação, prêmio, "+1.000 restaurantes" nem depoimento: não temos, e prova
falsa quebra a marca. Não use o nome de nenhum estabelecimento cliente sem autorização.

## Entregue
1. Os 4 cards como imagens/artes prontas para publicar (1080 × 1350).
2. A **legenda** do post em português: primeira linha que prende o scroll, 3 a 5 linhas
   explicando a KORA em linguagem de dono de restaurante, chamada para ação ("Chama no
   direct e a gente marca uma demonstração de 30 minutos") e 5 a 8 hashtags no fim.
3. Um **texto alternativo (alt)** curto por card, para acessibilidade.
````
