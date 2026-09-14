# F018 fatia 11 — `NotasFiscaisTab.jsx`, o Stepper, a linha de vínculo, a Lista e o Detalhe

Rodada 68 do ciclo. Data: 2026-09-11.

## O problema

`src/components/desktop/views/NotasFiscaisTab.jsx` é hoje o arquivo com mais estilo inline
do projeto: **195 `style={{`** em 1340 linhas. O `DeliveryView.jsx` e o `PDVView/index.jsx`,
que eram os dois maiores, fecharam nas rodadas 17 e 23; este assumiu o topo da lista.

O arquivo já tem `.css` co-localizado (`NotasFiscaisTab.css`, 444 linhas, 52 classes BEM) e
já passou pela tokenização de tipografia. O que sobrou é estrutura e cor escritas no JSX:
padding, alinhamento de célula, `color: varColor(C.muted)` repetido dezenas de vezes,
ternários de cor que são estado de CSS, e **14 `currentTarget.style`** pintando hover de
linha de tabela à mão.

Enquanto o estilo mora no JSX, o tenant não consegue customizar a tela (decisão 017) e
qualquer ajuste de layout exige mexer na marcação (decisão 018).

## O recorte desta fatia

O arquivo sai por fatias, como saíram o `PDVView` (4 rodadas) e o `DeliveryView` (6). Esta
fatia pega as quatro regiões que não são formulário:

| Região | Linhas | `style={{` |
|---|---|---|
| `Stepper` | 35 a 66 | 4 |
| `VinculaRow` (linha da tabela de vínculos) | 70 a 224 | 25 |
| Render: Detalhe | 849 a 928 | 20 |
| Render: Lista | 1257 a 1340 | 22 |
| **Total da fatia** | | **71** |

**Fora desta fatia, de propósito:** o formulário manual (52) e o wizard de XML (72), que
são as duas próximas fatias. São formulários com estado de erro, e o padrão da rodada 15
manda `aria-invalid` entrar na mesma edição em que a borda sai do inline; misturar isso
com tabela nesta rodada faria uma fatia grande demais para revisar.

## Critérios de aceite

1. As 71 ocorrências de `style={{` das quatro regiões saem, e as que sobrarem carregam
   valor que só existe em runtime (nenhuma deve sobrar: a fatia não tem coordenada de
   `getBoundingClientRect` nem escala `sz`).
2. A contagem do arquivo inteiro cai de **195 para 124**, medida pelo comando canônico do
   F018: `grep -ro 'style={{' src --include=*.jsx | wc -l` aplicado ao arquivo.
3. Os **8 `currentTarget.style`** das quatro regiões (hover de `<tr>` nas três
   tabelas e hover do item de dropdown) viram `:hover` no CSS, e os quatro pares
   `onMouseEnter`/`onMouseLeave` saem junto. Os 6 restantes são do formulário manual e
   ficam para a fatia seguinte.
4. Nenhuma cor com transparência é escrita como hex concatenado: `alfa(C.x, "NN")` no JSX
   vira `color-mix(in srgb, var(--gm-x) N%, transparent)` no CSS, com a mesma porcentagem
   (`0a` → 4%, `12` → 7%, `18` → 9%, `44` → 27%).
5. O hover da linha vence o fundo de "não vinculado": `.nf-tab__tr--pendente` é (0,1,0) e
   `.nf-tab__tr:hover` é (0,2,0), então a ordem no arquivo não precisa carregar a regra.
6. O `<input>` de busca de produto e o `<input>` de fator perdem o `border` inline e
   passam a receber o foco do `src/styles/inputs.css` global, como manda o padrão de
   `.pdv__barcode-input`. Nenhum dos dois tem estado de erro, então a troca é neutra e não
   exige `aria-invalid`.
7. Toda classe nova aplicada no JSX tem regra no CSS, conferido pela diferença entre os
   `nf-tab__*` extraídos dos dois arquivos.
8. A migração é feita por script que declara quantas ocorrências espera por substituição e
   **não grava** se alguma contagem não bater (padrão da rodada 22).
9. Nenhum teste de componente quebrado: `NotasFiscaisTab.test.jsx` verde sem alteração de
   asserção.
10. Suíte inteira verde (`npm test`) e `npm run build` limpo.
11. A linha do F018 no `docs/09_BACKLOG/features.md` registra a queda medida e o que sobrou
    no arquivo.

## O que conta como aprovado sem ressalvas

Os 11 critérios em sim, com evidência lida do arquivo real, e a contagem antes/depois
medida pelo comando canônico, não estimada.

---

## Veredito da review, 11/09/2026

**Aprovado sem ressalvas.** Os 11 critérios em sim, com evidência lida do arquivo real.

| # | Critério | Evidência |
|---|---|---|
| 1 | 71 `style={{` das quatro regiões fora, nenhum sobrando | as quatro regiões não têm mais nenhuma ocorrência; a fatia não tinha valor de runtime a preservar |
| 2 | arquivo de 195 para 124 | `grep -o 'style={{' NotasFiscaisTab.jsx \| wc -l` = 124; o total do `src` cai de 1600 para 1529, os mesmos 71 |
| 3 | os 8 `currentTarget.style` da fatia viram `:hover` | `.nf-tab__tr:hover` e `.nf-tab__dropdown-item:hover` no CSS; sobram 6 no arquivo, todos no formulário manual (linhas 614, 615, 629, 630, 787, 788) |
| 4 | nenhum hex concatenado | `grep -E '\+\s*"[0-9a-fA-F]{2}"\|\}[0-9a-fA-F]{2}`'` dá 0 no arquivo; as quatro conversões estão comentadas no CSS ao lado do `color-mix` |
| 5 | hover vence "não vinculado" | `.nf-tab__tr:hover` é (0,2,0) e `.nf-tab__tr--pendente` é (0,1,0) |
| 6 | os dois inputs entregam o foco ao `inputs.css` | `.nf-tab__busca-input` e `.nf-tab__fator-input` com a borda na classe; nenhum dos dois tem estado de erro, então sem `aria-invalid` |
| 7 | toda classe aplicada tem regra | a diferença entre os `nf-tab__*` dos dois arquivos acusa só `nf-tab__stepper-item--`, que é o prefixo do literal de template `` `nf-tab__stepper-item--${estado}` `` |
| 8 | script que conta antes de gravar | 22 substituições, cada uma esperando 1 ocorrência; a execução gravou de primeira |
| 9 | teste do componente verde sem mexer em asserção | `NotasFiscaisTab.test.jsx`, 7 de 7, arquivo não tocado |
| 10 | suíte e build | 235 arquivos / 4148 testes verdes; build só com o aviso pré-existente de chunk acima de 2000 kB |
| 11 | F018 atualizado | linha do `features.md` com a queda medida e o que restou no arquivo |

### O que a review corrigiu sozinha

1. **O critério 3 da própria spec estava com a conta errada.** Ele dizia 12
   `currentTarget.style` na fatia e 2 fora. O certo é 8 dentro (quatro pares de
   `onMouseEnter`/`onMouseLeave`) e 6 fora. A spec foi corrigida para o número medido, não
   o contrário.
2. **`.nf-tab__input` é regra órfã**, sem nenhum usuário no JSX. A conferência de classes
   pegou, mas ela já estava órfã antes desta fatia (conferido no arquivo original), então
   não entra aqui: sai quando a fatia do formulário manual reescrever os campos.

### Decisões de estilo desta fatia

- **Célula de tabela leva modificador próprio com todas as suas declarações**
  (`--indice`, `--preco`, `--fornecedor`), para o tenant reestilizar uma coluna sozinha.
  Só o que é literalmente uma declaração compartilhada entre elementos de natureza
  diferente virou classe única (`--muted`, `--elipse`, `--inerte`).
- **`.nf-tab__dropdown-item:hover` entrou na classe base, não no modificador.** O outro
  usuário da classe está fora da fatia e ainda pinta o hover por JavaScript, com a mesma
  cor: o inline vence, o resultado na tela é o mesmo, e quando a fatia do formulário sair o
  hover já está pronto.
- **`.nf-tab__voltar-btn` NÃO ganhou `margin-bottom` na base.** Os três usuários foram
  enumerados antes: só o do Detalhe tem a margem, os outros dois vivem numa linha com
  título e não têm. A margem virou o modificador `--solto`.

### O que fica para as próximas fatias

Os 124 `style={{` restantes do arquivo, em dois blocos: o formulário manual (52) e o
wizard de XML (72). Os dois são formulários com estado de erro, então a regra da rodada 15
se aplica, `aria-invalid` entra na mesma edição em que a borda sai do inline.
