# Correção das datas um dia antes e página de novidades (kora.codes/patchnotes)

> Pedidos do dono em 2026-11-26, no meio da execução Full Automático: "Corrigir data da compra um
> dia antes na Área Admin", "inclua também o vencimento do fiado no detalhe do cliente", "cria uma
> page dentro de kora.codes/patchnotes", "com todas as atualizações que tu vai fazendo ir upando pra
> la", "toda vez que for feito um push pro git deve ser atualizado no patch notes também" e
> "adicione tudo que fizemos até agora no patch notes também". Fecha a pendência P2-02.

## A mudança

**Datas um dia antes (pendência P2-02).** A data da compra e o vencimento do fiado são gravados como
dia sem hora (`AAAA-MM-DD`, coluna `date`). As duas telas liam isso com `new Date()`, que entende
meia-noite UTC; no fuso de Brasília ainda é o dia anterior, às 21h. Agora:
- `fmtDt` da Área Admin monta o dia direto do texto (continua no formato curto, 20/11/26);
- o detalhe do cliente usa `rotuloDiaBR`, que já existia em `utils/datas.js` para o mesmo caso.
Teste antes, nos dois: vermelhos com o código antigo ("19/11/26" e o vencimento sem o dia 01/08),
verdes com a correção. A suíte roda no fuso de São Paulo, então os testes seguram o defeito.

**Página de novidades.** `kora.codes/patchnotes` mostra o que mudou no sistema, da atualização mais
nova para a mais antiga.
- Textos num arquivo só, `src/features/apex/regras/notasDeAtualizacao.js`, com teste de
  estrutura (ordem das datas, sem data repetida, tipo conhecido, data válida).
- Página `src/pages/apex/ApexNotasPage.jsx` com o mesmo topo das outras portas do site e o
  rodapé, com teste de componente; rota `/patchnotes` só no site da Kora (fora dele, cai no login,
  como as outras rotas do site); link "Novidades do sistema" no rodapé do site.
- Na tela o nome é "Novidades do sistema", e não "patch notes", pelo Princípio nº 1 (rótulo em
  português do dia a dia). O endereço fica `/patchnotes`, como pedido.
- O histórico do projeto entrou nas notas, a partir de `specs/_loop.md` e do histórico do git.

**Por que a página é intuitiva:** uma coluna só, lida de cima para baixo; data por extenso em cada
bloco; cada mudança com uma etiqueta curta (Novo, Melhoria, Corrigido, Por dentro), com ícone e cor
próprios, para achar o que interessa passando o olho; texto sobre o que mudou para quem usa, sem
termo técnico; a saída de volta ao site no mesmo lugar das outras portas.

**Regra do push.** Escrita no CLAUDE.md e cobrada por `.githooks/pre-push`, que recusa o push
quando nenhum commit enviado mexe no arquivo das notas. Conferido num repositório de teste: push
sem nota recusado, com nota aceito, e o push seguinte sem nota recusado de novo. Na máquina do dono
vale depois de `git config core.hooksPath .githooks` (o mesmo passo do `post-commit` que já existe).

## Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Compra e vencimento do fiado mostram o dia gravado | testes novos, vermelho e depois verde |
| 2 | `/patchnotes` mostra as notas no site da Kora, legível no computador e no celular | teste de componente e fotos nas duas larguras |
| 3 | Push sem nota é recusado | repositório de teste com o hook |
| 4 | Suíte verde, build limpo, lint 0 erros, sem travessão nem emoji em texto novo | comandos e guardas |

## Diferenças

36 telas da Área Admin e de Clientes contra a main: nenhuma diferença acima de 0,1% e 7 leves, todas
nas datas. As compras de demonstração gravadas em 19/11, 15/11 e 02/11 apareciam como 18, 14 e
01, e agora aparecem no dia gravado; o fiado com vencimento em 20/12 aparecia como 19/12 e agora
aparece como 20/12 (conferido lado a lado). A página de novidades não tem foto no roteiro (só abre
no site da Kora); foi fotografada à parte, no computador e no celular, com a prévia do site ligada.

## Revisão

- Spec: 4 de 4 em sim. Suíte 272 arquivos e 4456 testes, verde; build limpo; lint 0 erros e 25
  avisos. Notas: 21 blocos, de 1º de agosto a 26 de novembro de 2026.
- Qualidade: nenhum crítico ou importante. O histórico das notas foi escrito a partir do
  `_loop.md` e do git; as rodadas só de organização interna viraram um item "Por dentro" por dia.
