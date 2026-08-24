-- ──────────────────────────────────────────────────────────────────
-- Ponte KORA — bucket público de DOWNLOAD do programa (KoraPonte.exe).
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
--
-- Para que serve
--   As duas telas que pedem o KoraPonte.exe — Configurações → Impressão →
--   "Impressora e papel" (quando o dono escolhe a impressora térmica) e a
--   aba "Pedidos sem Internet" — mostram um botão de download. O endereço
--   do botão vem de VITE_PONTE_DOWNLOAD_URL; este bucket é onde o arquivo
--   fica hospedado.
--
--   Endereço público, que é o que vai na variável (fixo — publicar versão
--   nova é trocar o arquivo mantendo o mesmo nome):
--     {VITE_SUPABASE_URL}/storage/v1/object/public/ponte-download/KoraPonte.exe
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

-- Bucket público, com teto de tamanho e os tipos que um executável de Windows
-- costuma chegar (o navegador rotula o mesmo .exe de um jeito diferente em
-- cada máquina; se o upload for recusado por tipo, é só acrescentar aqui o que
-- o painel reclamar). Os dois de zip ficam prontos para o dia em que o arquivo
-- for publicado compactado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ponte-download',
  'ponte-download',
  true,
  104857600, -- 100 MB (o .exe tem ~58 MB) — mas ver ATENÇÃO abaixo
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

-- ATENÇÃO — teto de upload do projeto (é o que manda de verdade)
--   O limite acima é do bucket, mas quem vale é o MENOR entre ele e o teto
--   global do projeto (Storage → Settings → "Upload file size limit"). No
--   plano gratuito esse teto global é de 50 MB, e o KoraPonte.exe tem ~58 MB:
--   o upload é recusado antes de começar. Ou seja, o bucket sobe hoje, mas o
--   arquivo só entra quando uma destas decisões for tomada (custo, decisão do
--   dono — memory/restrictions.md):
--     a) publicar o programa compactado (um .exe desses costuma cair para bem
--        menos da metade, cabendo nos 50 MB) — mas aí a tela precisa mandar
--        descompactar antes do duplo clique;
--     b) hospedar em asset de Release do GitHub — gratuito, cabe (o teto por
--        arquivo é de 2 GB) e a variável aponta para lá sem mudar uma linha de
--        código. O repositório é público, então o link baixa direto, sem login;
--     c) plano Pago do Supabase (teto vai a 500 GB).
--   Nada disso muda este arquivo: o bucket fica pronto para quando for usado.

-- Conferência (deve devolver 1 linha, com public = true):
select id, public, file_size_limit
from storage.buckets
where id = 'ponte-download';
