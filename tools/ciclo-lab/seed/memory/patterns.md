# Padrões descobertos

Jeitos de fazer que vale repetir.

## Dinheiro em centavos inteiros

Quando trabalhar com valores monetários, sempre usar centavos inteiros. Função pura
em `src/lib/dinheiro.js` com operações seguras (soma, subtração, multiplicação,
divisão igualmente).

Nada de float, nada de parseFloat no resultado final, nada de arredondamento
intermediário — o inteiro é exato, e a exatidão é crítica em pagamento.
