# Toro Parrilla e Bar — proposta de redesign (versão de apresentação)

Peça de venda para o Toro Parrilla e Bar, Novo Hamburgo (RS). Arquivo único, sem
dependências, tema preto e dourado. Vive em `prototipos/toro-parrilla/` dentro deste
repositório, mas **não faz parte do produto GastroMundi** — é uma peça comercial
separada, sem relação com o código da aplicação.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página. Referencia as fotos por caminho relativo (`fotos/*.jpg`). É este que se edita. |
| `index.publicacao.html` | Gerado. Cópia com as fotos embutidas em base64, para publicar como artefato — caminho relativo não carrega sob a política de segurança de artefato. **Não editar à mão**; sai do `build_fotos.py`. |
| `fotos/` | Gerado. As quatro fotos recortadas e comprimidas. |
| `originais/` | As quatro fotos como saíram do Instagram, sem recorte. Guardar: é daqui que se refaz qualquer recorte. |
| `build_fotos.py` | Recorta, redimensiona, comprime e regenera o `index.publicacao.html`. |

## Como regenerar

```
python3 build_fotos.py            # lê originais/, escreve fotos/ e index.publicacao.html
python3 build_fotos.py /outro/dir # se os originais estiverem em outro lugar
```

Precisa de Pillow (`pip install pillow`). Sem argumento, procura em `originais/` os
arquivos `toro-01-fachada.jpg`, `toro-02-brasa.jpg`, `toro-03-salao.jpg` e
`toro-04-hero.jpg` (busca recursiva, então subpasta serve).

Cada foto é recortada para a proporção do slot, limitada a 1600 px no lado maior, e
comprimida em passes de qualidade decrescente até ficar abaixo de 250 KB.

O `JOBS` tem um campo para espelhar a foto na horizontal, hoje `False` em todas.
**Nenhuma foto do Toro deve ser espelhada**: o logo da casa usa o R invertido de
propósito ("TOЯO"), o que dá a impressão de foto espelhada quando não é. O teste é o
subtítulo — em foto correta "PARRILLA & BAR" lê da esquerda para a direita.

## De onde vem cada foto

Todas do Instagram público da casa, [@toroparrillaebar](https://www.instagram.com/toroparrillaebar/).
Pedir os originais em alta resolução ao restaurante antes de fechar a versão final.

| Slot | Post | Original | Recorte |
|---|---|---|---|
| `fachada.jpg` | [DCcwiatvYAK](https://www.instagram.com/p/DCcwiatvYAK/) | 1440×1503 | 1202×1503 (4:5) |
| `brasa.jpg` | [DYw0G5Ju5MX](https://www.instagram.com/p/DYw0G5Ju5MX/) | 960×1280 | 960×960 (1:1) |
| `salao.jpg` | [DaNXV6puIJC](https://www.instagram.com/p/DaNXV6puIJC/) | 3072×4096 | 1200×1200 (1:1) |
| `hero.jpg` | [DDvHmSgPsDt](https://www.instagram.com/p/DDvHmSgPsDt/) | 1440×1440 | 1440×810 (16:9) |

Alternativas avaliadas e não usadas:

- [DEatByXvlgF](https://www.instagram.com/p/DEatByXvlgF/) — outro corte fatiado, com taça de vinho desfocada em primeiro plano.
- [DQ_y5LRjoXB](https://www.instagram.com/p/DQ_y5LRjoXB/) — pátio à noite com mesas ocupadas. Descartada por mostrar rostos de clientes reconhecíveis numa peça comercial.
- [DBe7By5vgRO](https://www.instagram.com/p/DBe7By5vgRO/), [DAuDG_jvydI](https://www.instagram.com/p/DAuDG_jvydI/) — exteriores à noite, menos nítidos que a fachada escolhida.

## Pendência aberta

**Não existe foto da parrilla em ação com fogo ou brasa visível** em nenhum dos 130
posts do feed. As únicas peças com fogo são promocionais com texto por cima, que o
critério de escolha exclui. O slot `brasa.jpg` está com o corte fatiado no ponto —
o mais próximo disponível. Essa é a foto que mais vale pedir ao restaurante.

## Decisões de layout

- **Faixa do topo** anuncia proposta de redesign, credita as fotos ao Instagram da casa e avisa que preços e horários definitivos entram na versão final. Nada de preço, prato ou avaliação inventados em nenhum lugar da página.
- **Seção "A casa"**: fachada em 4:5 ocupando a coluna alta; brasa e salão em 1:1 empilhados na segunda coluna. O grid de três colunas iguais deixava um vão embaixo dos quadrados, porque 4:5 é mais alto que 1:1. A proporção das colunas é `1.62fr 1fr`, calculada para as duas fecharem na mesma altura.
- **Celular**: a fachada segue vertical (4:5) em vez do 16:10 do protótipo original — em 16:10 o letreiro dourado sai do corte, que é justamente o assunto da foto.
- **Hero**: `.hero-bg` é um `<img>` real (não `background-image`) para carregar `alt` descritivo; `.hero-shade` escurece a foto por cima, com gradiente mais forte no celular, onde o texto ocupa a largura toda. O canvas de brasas (`#embers`) fica acima da camada escura. Empilhamento: foto `-3`, sombra `-2`, brasas e brilho `-1`, conteúdo acima.
- Toda imagem tem `alt` descritivo em português.

## Verificado

Renderizado com Playwright em 1280×900 e 390×844: texto claro e dourado legíveis
sobre a foto do hero, fachada inteira com o letreiro aceso, colunas da seção "A casa"
fechando na mesma altura, canvas de brasas por cima.
