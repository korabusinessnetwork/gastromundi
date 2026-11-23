# Testes de comportamento das funções SQL

Os guards em `src/lib/*SqlGuard.test.js` leem o **texto** das migrations. Estes
arquivos fazem a outra metade: rodam a função de verdade num Postgres local,
como usuário autenticado, com as policies copiadas de produção.

Nada aqui toca o banco de produção.

## Como rodar

Precisa de um Postgres 15 ou mais novo local (`apt-get install postgresql`).
Da raiz do repositório:

```
sudo -u postgres psql -q -f supabase/tests/salvar_combo_base.sql
sudo -u postgres psql -q -d teste_combo -f supabase/migrations/20261123_salvar_combo_atomico.sql
sudo -u postgres psql -q -d teste_combo -f supabase/tests/salvar_combo_cenarios.sql
```

O arquivo `_base` recria o banco `teste_combo` do zero, com o esquema `auth`
imitando o do Supabase (`auth.jwt()` lê `request.jwt.claims`), as tabelas
envolvidas, as policies de produção e dois estabelecimentos. O arquivo
`_cenarios` troca de papel com `SET request.jwt.claims` e imprime cada caso;
cada cabeçalho `==` diz o que o resultado logo abaixo precisa mostrar.

## Cenários de `salvar_combo` (2026-11-23, todos conforme)

1. Gerente cria combo com subproduto e produto.
2. Edição troca a composição inteira.
3. Falha no meio (subproduto inexistente) desfaz tudo, inclusive os deletes.
4. Combo sem item: recusa `P0001`.
5. Quantidade zero: recusa `P0001`.
6. Combo de outro estabelecimento: invisível, recusa `P0002`, nada muda.
7. Garçom editando: recusa `P0002`.
8. Garçom criando: recusa `42501` da RLS.
9. Estado final confere com os passos acima.
10. Anônimo não executa a função.
