# S1-3-IDENTIDADE — identidade do estabelecimento editável pelo próprio tenant

> Rodada 8 do ciclo · 2026-08-01

## 1. Escopo

Uma aba **"Identidade"** em Configurações (só admin do estabelecimento) onde ele define o **nome de
exibição** e o **logo** da própria marca — o logo enviado do computador ou do celular, sem colar URL
—, gravados em `tenants.tema` por uma RPC `SECURITY DEFINER` escopada ao tenant de quem chama.

## 2. Fora de escopo

- **Paleta e layout** (`accent`, cores, fontes, `tema.layout`): continuam sendo escolha da plataforma
  pelo Console (`alterar_layout_tenant`, `20260801`). A RPC desta rodada não toca nessas chaves e a
  tela não as mostra. Não é omissão: trocar layout apaga os overrides de paleta de propósito, e as
  duas pontas escrevendo o mesmo jsonb se sobrescreveriam sem que ninguém percebesse.
- **Nome cadastral** (`tenants.nome`) e **slug**: são o cadastro do cliente na plataforma, não a
  marca; quem muda é o Console.
- Recorte/rotação do logo, galeria de logos anteriores, favicon, logo separado para cupom impresso.
- Bucket novo de Storage (ver §4 — reusamos o que já existe).

## 3. Origem e decisões que este item honra

- **`docs/09_BACKLOG/sprint_pre_venda.md`, S1-3** — "identidade/tema (logo, cores, nome)". Dos três
  pedaços do S1-3, usuários e impressão **já estão entregues** (aba "Usuários" com CRUD completo e
  aba "Impressão" em `ConfiguracoesView.jsx`); identidade é o que sobrou, e hoje só muda por SQL.
- **Decisão 017 (white-label)** — a marca vem do tenant, nunca hardcodada. Esta rodada é o único
  caminho de o próprio estabelecimento exercer isso.
- **ADR-005 / ADR-008 §7** — `tenants` não tem policy de UPDATE: escrita só por RPC ou migration.
  Honrado: a tela não faz `update`, chama RPC.
- **ADR-007 §2** — a lista de chaves aceitas em `tenants.tema` é fechada (`accent`, `nome_exibicao`,
  `logo_url`). Escrevemos só duas delas.
- **Decisão 018** — CSS separado do JSX na tela nova.
- **Custo zero**: compressão no `<canvas>` e Supabase Storage no plano gratuito, iguais ao Delivery.

## 4. Arquivos afetados

**Migration (nova, roda manual no SQL Editor)**
- `supabase/migrations/20260914_identidade_tenant.sql` — RPC
  `public.atualizar_identidade_tenant(p_nome_exibicao text, p_logo_url text)`:
  - `SECURITY DEFINER`, `SET search_path = public`;
  - **sem parâmetro de tenant** — o alvo é sempre `public.tenant_do_usuario_atual()` (helper já
    criado em `20260826`), então não existe forma de mirar outro estabelecimento;
  - guarda: `gastro_role = 'admin'` no JWT **e** tenant resolvido não nulo; `IS NOT TRUE` para tratar
    NULL e false igual, como em `20260729`;
  - grava por merge (`tema || jsonb_build_object(...)`), preservando `layout`, `accent` e qualquer
    outra chave existente; valor vazio **remove** a chave (`tema - 'logo_url'`);
  - valida no servidor: nome com no máximo 40 caracteres depois do trim; `logo_url` só
    `http://`, `https://` ou `data:image/` — mesma allowlist de `logoUrlSegura`;
  - `REVOKE EXECUTE ... FROM PUBLIC, anon` + `GRANT ... TO authenticated`.

**Storage** — nenhuma policy nova. O logo vai para o bucket **`delivery-fotos`** que já existe, no
caminho `{tenant_id}/identidade/logo.png`. As policies de `20260826` casam pela **primeira** pasta
(`(storage.foldername(name))[1] = tenant`), então o caminho aninhado já está autorizado e isolado; o
bucket já é `public = true`, que a tela de login (pré-autenticação) precisa para exibir o logo.
Trade-off assumido: o nome do bucket fica menos literal, em troca de zero passo manual novo em
produção e de não repetir a armadilha de deadlock documentada na `20260826`.

**Front**
- `src/lib/identidadeTenant.js` (novo) — funções puras (`caminhoLogoTenant`, `nomeExibicaoValido`,
  `limparNomeExibicao`, `identidadeMudou`) + `enviarLogoTenant` e `salvarIdentidadeTenant` (RPC),
  reusando `tipoImagemAceito`, `calcularDimensoes`, `TAMANHO_MAX_ORIGINAL`, `ACCEPT_IMAGEM`,
  `urlComVersao` e `BUCKET_FOTOS` de `src/lib/deliveryFotos.js`.
  **Compressão própria (`comprimirLogo`), não o `comprimirImagem` do Delivery:** aquele pinta fundo
  BRANCO e emite JPEG de propósito (foto de prato não tem alpha). Logo tem, e a sidebar é escura —
  reusar poria um retângulo branco atrás da marca de todo tenant. Por isso o formato é **PNG** e o
  arquivo é `logo.png`; só a matemática de dimensões (pura e já testada) é compartilhada.
- `src/lib/identidadeTenant.test.js` (novo) — testes das funções puras.
- `src/components/desktop/views/IdentidadeTab.jsx` + `.css` + `.test.jsx` (novos).
- `src/components/desktop/views/ConfiguracoesView.jsx` — nova aba `identidade` (`adminOnly: true`),
  ícone e render.
- `src/context/AppContext.jsx` — recarregar o tenant depois de salvar, para sidebar e login
  refletirem na hora (usar o recarregamento que já existir; não criar mecanismo novo).

## 5. Critérios de aceite

1. A aba "Identidade" aparece em Configurações **apenas** para admin (`adminOnly: true`), como as
   abas de Impressão e Importar/Exportar.
2. A tela não executa `update`/`insert` em `tenants` — toda escrita passa pela RPC.
3. A RPC resolve o tenant por `tenant_do_usuario_atual()` e **não aceita** id de tenant como
   parâmetro; um usuário de outro estabelecimento não tem como alterar identidade alheia.
4. A RPC recusa quem não é `admin` com `insufficient_privilege`, tratando JWT sem claim (NULL) igual
   a negado.
5. O merge preserva as demais chaves de `tenants.tema` — em especial `layout` e `accent`; existe
   comentário na migration provando a intenção e o `||` no código.
6. Nome de exibição é validado nos dois lados: nome só de espaços nunca é gravado como marca (o
   trim o transforma em vazio, e vazio **remove** a chave, voltando ao nome cadastrado), e acima de
   40 caracteres é recusado no servidor — e também no cliente, antes de gastar rede.
7. `logo_url` gravada passa pela allowlist de esquema (`http`, `https`, `data:image/`) **no
   servidor**, não só no front.
8. O logo é comprimido no cliente antes de subir, em **PNG com alpha preservado** (nada de fundo
   branco atrás da marca), com o mesmo teto de 8 MB no original; arquivo que não é imagem é recusado
   antes do upload.
9. O caminho do logo é `{tenant_id}/identidade/logo.png` — determinístico, uma imagem por tenant,
   troca sobrescreve, sem órfão.
10. A URL pública recebe versão (`?v=`) ao ser gravada, senão a troca de logo continua mostrando o
    antigo por cache.
11. Toda chamada externa (upload e RPC) é tratada, com erro visível na tela e sem quebrar a aba.
12. Estados de carregando, salvando, erro e sucesso têm feedback imediato; o botão de salvar fica
    desabilitado enquanto não há mudança ou enquanto salva (prevenção de erro > mensagem de erro).
13. Remover o logo é possível e explícito, com confirmação — e a tela volta a mostrar o nome, não um
    quadrado quebrado.
14. Funções puras novas nascem com teste; `npm test` verde no fim.
15. CSS em arquivo separado, só com tokens `--gm-*` — nenhuma cor hardcodada.
16. Nada de marca, nome ou cor de um cliente específico no código (white-label).
17. Nenhum segredo, URL de API ou chave hardcodada; nenhum `select *`; nenhum `console.log`
    esquecido; nenhum dado sensível em log.
18. A tela mostra uma **prévia** de como a marca vai aparecer, para o dono não precisar salvar e ir
    procurar na sidebar para descobrir o resultado.

## 6. Edge cases conhecidos

- **Tenant ainda em voo no bootstrap** (`tenant` nulo): a aba mostra "carregando", nunca afirma que
  não há identidade — o aprendizado da rodada 7.
- **Tema nulo ou sem as chaves**: a tela abre com o nome cadastrado (`tenant.nome`) como sugestão,
  não em branco.
- **Upload sobe mas a RPC falha**: o arquivo fica no bucket e a identidade não muda. A tela precisa
  dizer que **não salvou** — não pode mostrar sucesso porque o upload deu certo.
- **Navegador sem `<canvas>`** (ambiente de teste, jsdom): `comprimirLogo` rejeita; a tela trata
  como erro de upload comum.
- **Imagem enorme (acima de 8 MB)**: recusada antes de comprimir, com o motivo em português.
- **Nome com espaços nas pontas**: salvo com trim; nome só de espaços vira vazio e **limpa** o nome
  de exibição, em vez de gravar espaços. Limpar é o único jeito de desfazer um nome já escolhido sem
  SQL, e a tela avisa o que vai acontecer ("Deixando em branco, aparece o nome cadastrado: X").
- **Logo removido enquanto outra aba está aberta**: a sidebar deve voltar ao nome sem recarregar a
  página (o recarregamento do tenant cobre isso).
- **Usuário gerente (não admin)**: não vê a aba, e se chamar a RPC direto recebe
  `insufficient_privilege` — os dois lados fecham.

## 7. Definição de "aprovado sem ressalvas"

Todos os 18 critérios em sim com evidência em arquivo e linha, `npm test` verde, sem TODO pendente,
sem `console.log` esquecido, sem regressão nas abas existentes de Configurações e sem nenhuma
escrita direta em `tenants` fora da RPC.

## 8. Por que a tela é intuitiva (Princípio nº 1)

Ela mostra, no topo, **o resultado antes do salvamento** — o mesmo bloco de marca que aparece na
sidebar, atualizando enquanto se digita o nome ou se escolhe a imagem. A ação principal é um único
botão grande ("Enviar logo") que abre a câmera no celular e a galeria no computador, porque o dono
tem a foto no telefone, não uma URL. Não há campo de link, não há formato exigido, não há tamanho a
calcular: o sistema redimensiona e comprime. E o botão de salvar só acende quando há algo novo para
salvar, então não existe o clique que não faz nada.

## 9. Resultado da review (2026-08-01)

**Aprovada sem ressalvas** — 18 de 18 critérios em sim, `npm test` verde (189 arquivos / 2983
testes). O que a review mexeu:

- **Critério 6 reescrito** (o spec estava errado, não o código): nome só de espaços não é "recusado",
  ele **limpa** o nome de exibição e a marca volta ao nome cadastrado. Bloquear o vazio deixaria o
  dono sem como desfazer um nome já escolhido a não ser por SQL — que é justamente o que o S1-3
  existe para acabar. A tela avisa o que vai acontecer antes de salvar.
- Nada mais precisou de correção nesta fase: os quatro defeitos da rodada (import inexistente
  `logoUrlSegura`, guarda `excedeu` calculada e nunca mostrada, banner de sucesso que dependia do
  contexto repintar, e o spec dizendo `logo.jpg` onde o código faz `logo.png`) já tinham sido
  fechados durante o `/build`.

**Fica para uma próxima rodada** (nada disto bloqueia o uso):

- **Logo do cupom impresso** — a impressora térmica precisa de 1-bit monocromático, não do PNG com
  alpha. Hoje o cupom usa o nome escrito.
- **Favicon e ícone de PWA por tenant** — mesma origem para todos enquanto não houver subdomínio por
  estabelecimento (item 2 da fila do dono).
- **Recorte/enquadramento antes de subir** — hoje o logo entra inteiro, redimensionado; imagem muito
  retangular fica pequena no palco de 52px de altura.
- **Limpeza do arquivo no Storage ao remover o logo** — remover tira a chave do `tema`, mas o
  `logo.png` continua no bucket. Sem custo relevante (um arquivo por tenant, sobrescrito na troca) e
  sem exposição nova (o bucket já é público por desenho), mas é lixo.
