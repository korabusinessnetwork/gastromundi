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

## Cenários de `importar_nota_fiscal` (2026-11-23, todos conforme)

```
sudo -u postgres psql -q -f supabase/tests/importar_nota_fiscal_base.sql
sudo -u postgres psql -q -d teste_nf -f supabase/migrations/20260901_entrada_estoque_atomica.sql
sudo -u postgres psql -q -d teste_nf -f supabase/migrations/20261124_importar_nota_fiscal_atomica.sql
sudo -u postgres psql -q -d teste_nf -f supabase/tests/importar_nota_fiscal_cenarios.sql
```

1. Gerente importa nota com dois itens vinculados e um sem vínculo: saldos somados, custo do histórico dividido pelo fator, data da emissão no histórico.
2. Mesma chave de acesso de novo: recusa `23505`, e o saldo não soma de novo.
3. Falha no meio (produto de outro estabelecimento no segundo item): nada fica, nem a nota nem a soma do primeiro item.
4. A reimportação depois da falha funciona.
5. Item vinculado com quantidade 0: recusa `P0001` antes de gravar.
6. Nota sem item vinculado: grava e devolve só o id da nota.
7. Caixa (pode somar saldo, não pode gravar nota): recusa `42501`, nada muda.
8. Formato inválido: recusa `P0001`.
9. Estado final confere com os passos acima.
10. Anônimo não executa a função.

## Cenários de `excluir_unidade_medida` (2026-11-23, todos conforme)

```
sudo -u postgres psql -q -f supabase/tests/excluir_unidade_medida_base.sql
sudo -u postgres psql -q -d teste_unidade -f supabase/migrations/20261125_excluir_unidade_medida_atomica.sql
sudo -u postgres psql -q -d teste_unidade -f supabase/tests/excluir_unidade_medida_cenarios.sql
```

1. Gerente tenta excluir: recusa `42501`, e nenhum produto perde a unidade. Era o defeito de antes.
2. Caixa: recusa `42501`, nada muda.
3. Admin exclui `kg`: some da unidade de estoque, de consumo e da lista de compra; o produto do outro estabelecimento fica igual.
4. Admin exclui `cx`: sai da lista de compra dos dois produtos, o resto da lista fica.
5. Unidade que não existe mais: recusa `P0002`.
6. Unidade de outro estabelecimento: invisível, recusa `P0002`, nada muda.
7. Anônimo não executa a função.
