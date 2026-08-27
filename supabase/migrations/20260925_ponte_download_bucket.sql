-- ──────────────────────────────────────────────────────────────────
-- NÃO É MAIS USADA — leia antes de rodar.
--
--   Este bucket foi criado, mas o KoraPonte.zip acabou publicado no bucket
--   `branding`, que já existia. É de lá que o app baixa hoje:
--     {VITE_SUPABASE_URL}/storage/v1/object/public/branding/KoraPonte.zip
--   O passo a passo de publicação está em ponte/README.md e aponta para o
--   `branding`. Este arquivo fica como registro do que já foi aplicado no
--   banco (o bucket `ponte-download` existe lá, vazio) — rodar de novo não
--   quebra nada, só recria um bucket que ninguém usa. Para limpar, veja o
--   comando comentado no fim.
--
--   O resto do texto abaixo descreve o desenho original e continua valendo
--   como explicação de POR QUE o arquivo mora num bucket sem policy de
--   escrita — o `branding` também não tem nenhuma, que é o que segura o
--   executável no lugar.
-- ──────────────────────────────────────────────────────────────────
--
-- Ponte KORA — bucket público de DOWNLOAD do programa (KoraPonte.zip).
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
--
-- Para que serve
--   As duas telas que pedem o programa da Ponte — Configurações → Impressão →
--   "Impressora e papel" (quando o dono escolhe a impressora térmica) e a
--   aba "Pedidos sem Internet" — mostram um botão de download. O endereço
--   do botão vem de VITE_PONTE_DOWNLOAD_URL; este bucket é onde o arquivo
--   fica hospedado.
--
--   O que se publica aqui é o executável COMPACTADO (ver ATENÇÃO no fim).
--   Endereço público, que é o que vai na variável (fixo — publicar versão
--   nova é trocar o arquivo mantendo o mesmo nome):
--     {VITE_SUPABASE_URL}/storage/v1/object/public/ponte-download/KoraPonte.zip
--
-- Por que NÃO é por tenant
--   É o mesmo executável para todos os estabelecimentos (ponte/README.md):
--   quem diz de quem ele é são as credenciais digitadas no painel da ponte,
--   não o binário. O arquivo é da plataforma, não do estabelecimento — daí
--   um caminho só, sem pasta de tenant (ao contrário de `delivery-fotos`).
--
-- Segurança (multi-tenant, decisão 002)
--   • Leitura: bucket PÚBLICO. O dono precisa baixar o programa ANTES de ter
--     qualquer coisa instalada, às vezes de outro computador, e o arquivo não
--     guarda segredo nenhum — é o mesmo instalador que já circula por e-mail
--     e pen drive.
--   • Escrita: NENHUMA policy, de propósito. `storage.objects` já vem com RLS
--     ligada, e sem policy de insert/update/delete nem `anon` nem
--     `authenticated` conseguem gravar aqui. Publicar versão nova é trabalho
--     da plataforma, pelo painel do Supabase (a `service_role` passa por cima
--     da RLS) — nunca pelo app, nunca pelo estabelecimento. Sem isso, um
--     tenant qualquer poderia trocar o executável que TODOS baixam.
--
-- Idempotente: pode rodar de novo sem erro.
-- ──────────────────────────────────────────────────────────────────

-- Bucket público, com teto de tamanho e os tipos que valem aqui: os dois de
-- zip, que é como o arquivo é publicado hoje, e os de executável de Windows,
-- para o dia em que o .exe puder subir cru. São vários porque o navegador
-- rotula o mesmo arquivo de um jeito diferente em cada máquina; se o upload
-- for recusado por tipo, é só acrescentar aqui o que o painel reclamar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ponte-download',
  'ponte-download',
  true,
  104857600, -- 100 MB — mas quem manda é o teto do projeto; ver ATENÇÃO abaixo
  array[
    'application/octet-stream',
    'application/x-msdownload',
    'application/vnd.microsoft.portable-executable',
    'application/x-msdos-program',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ATENÇÃO — por que o arquivo vai compactado
--   O limite acima é do bucket, mas quem vale é o MENOR entre ele e o teto
--   global do projeto (Storage → Settings → "Upload file size limit"). No
--   plano gratuito esse teto global é de 50 MB, e o KoraPonte.exe tem ~58 MB:
--   cru, o upload é recusado antes de começar. Por decisão do dono (custo —
--   memory/restrictions.md), a saída escolhida foi publicar COMPACTADO, sem
--   sair do plano gratuito: sobe `KoraPonte.zip`, e as duas telas do app
--   mandam descompactar antes do duplo clique.
--
--   Este arquivo não muda por causa disso: o bucket é o mesmo, e `zip` já está
--   entre os tipos aceitos acima — quem já rodou esta migration NÃO precisa
--   rodar de novo. Muda só o nome do objeto que se envia pelo painel.
--
--   Se um dia o .zip também não couber nos 50 MB, as saídas continuam sendo:
--     a) asset de Release do GitHub — gratuito, cabe (teto de 2 GB por
--        arquivo) e a variável aponta para lá sem mudar uma linha de código.
--        O repositório é público, então o link baixa direto, sem login;
--     b) plano Pago do Supabase (teto vai a 500 GB).

-- Conferência (deve devolver 1 linha, com public = true):
select id, public, file_size_limit
from storage.buckets
where id = 'ponte-download';

-- Limpeza opcional — some com o bucket vazio que ficou sobrando. Só rode
-- depois de conferir que ele está mesmo vazio (Storage → ponte-download): o
-- delete falha se houver qualquer arquivo dentro, e é assim que tem de ser.
-- delete from storage.buckets where id = 'ponte-download';
