# Prompt para o Cowork — versão de apresentação com as fotos reais

Cole o bloco abaixo no Cowork. Ele coleta as fotos do Instagram do Toro e monta a
versão de venda do protótipo.

---

Tarefa: montar a versão de apresentação (para venda) do protótipo de site do Toro
Parrilla e Bar, usando as fotos reais do Instagram da casa.

**Contexto.** O protótipo já existe: `prototipos/toro-parrilla/index.html`, no repositório
`korabusinessnetwork/gastromundi`, branch `claude/site-redesign-prototype-2u6d6n`. É um
arquivo único, sem dependências externas, tema preto e dourado. Os espaços de foto estão
marcados como placeholder — é isso que falta.

**1. Coletar as fotos.** Perfil: https://www.instagram.com/toroparrillaebar/
Baixe as melhores imagens públicas do perfil. Preciso de quatro, nesta ordem de
prioridade:

1. **fachada ao anoitecer** — letreiro com o logo aceso. Vertical, proporção 4:5.
2. **corte na brasa** — a parrilla em ação, fogo ou brasa visível. Quadrada, 1:1.
3. **salão** — ambiente com luz quente, de preferência com mesas ocupadas. Quadrada, 1:1.
4. **prato montado** — a foto mais bonita de comida que existir no perfil, para o topo da
   página. Horizontal, 16:9 ou mais larga.

Critério de escolha: nitidez, luz, sem texto sobreposto, sem print de story, sem foto de
cliente marcado. Entre imagens parecidas, fique com a de maior resolução.

Se o Instagram bloquear o download (exigir login, limitar requisições): **não force e não
use serviço de terceiros para contornar.** Me avise, liste os links dos posts que você
escolheria, e eu salvo as imagens à mão na pasta que você indicar.

**2. Preparar.** Salve em `prototipos/toro-parrilla/fotos/` como `fachada.jpg`,
`brasa.jpg`, `salao.jpg`, `hero.jpg`. Redimensione para no máximo 1600 px no lado maior e
comprima para menos de ~250 KB cada — a proposta vai ser aberta no celular e precisa
carregar rápido.

**3. Colocar na página.** Substitua os três `.shot` da seção "A casa" pelas fotos
correspondentes, respeitando as proporções que o CSS já define (o primeiro é 4:5, os
outros dois 1:1). Coloque `hero.jpg` como fundo do `.hero`, com camada escura por cima o
suficiente para o texto claro e o dourado continuarem legíveis — escureça a foto, não o
texto. Mantenha o canvas de brasas por cima. Toda imagem precisa de `alt` descritivo em
português.

**Atenção:** se a página for publicada como artefato, imagem por caminho relativo **não
carrega** — a política de segurança bloqueia. Nesse caso, embuta cada foto como data URI
base64 dentro do HTML e gere uma segunda cópia do arquivo só para publicação, mantendo o
`index.html` com caminhos relativos para uso normal.

**4. Ajustar o tom para venda.** A faixa do topo hoje diz "Não é o site oficial". Na
versão de apresentação ela deve dizer que é uma proposta de redesign feita para o Toro,
com fotos do próprio Instagram da casa, e que preços e horários definitivos entram na
versão final. Não invente preço, não invente prato, não invente avaliação de cliente.

**5. Entregar.** Publique como artefato e me mande o link, junto com a lista de links dos
posts que você usou — quero poder pedir as originais em alta resolução ao restaurante.
