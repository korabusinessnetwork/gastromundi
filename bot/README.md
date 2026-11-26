# Bots do KORA

Programas que rodam **fora do sistema web**, cada um na sua pasta, com o próprio `package.json`.

| Pasta | O que faz | Como rodar |
|---|---|---|
| `importador-cardapio/` | Vigia uma pasta e importa para o KORA as planilhas de produtos (CSV ou XLSX) que caírem nela, movendo cada arquivo para `processados/` ou `erros/` | `cd importador-cardapio && npm install && cp .env.example .env` (preencher o `.env`) e `npm start`. Detalhes no README da pasta |

## Relação com o app (código compartilhado)

O importador **reusa o código do app**, não copia: importa direto de
`src/features/importacao/` (`planilha.js`, `plano.js` e `xlsxEntrada.js`) por caminho relativo. Assim
a planilha é validada, deduplicada e protegida contra fórmula maliciosa exatamente como na tela de
importar do app, e os testes dessa lógica (em `src/features/importacao/`) valem para os dois.

Consequência: **mudar `src/features/importacao/` muda o bot também.** Ao mover ou renomear esses
arquivos, atualize os imports de `importador-cardapio/src/core.js` na mesma rodada (o script de
mudança de pasta da refatoração já reescreve esses imports, porque olha a pasta `bot/`).

Não é workspace npm (refatoração 6.11): o bot só lê arquivos do app, não divide dependência com
ele, e o app não importa nada do bot.

## Segurança

O bot faz login como um usuário real do estabelecimento e grava com as mesmas regras de acesso do
app; nunca usa chave de serviço. O que é sensível é a senha desse usuário, no `.env`, que não vai
para o git. Mais em `importador-cardapio/README.md`.
