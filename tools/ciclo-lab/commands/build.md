---
description: Implementa a partir da spec da rodada, seguindo os padrões do laboratório
---

Spec (opcional; se vazio, use o mais recente em `specs/`): $ARGUMENTS

1. Releia a spec **inteira** antes de tocar em qualquer arquivo.
2. Implemente exatamente o que está no escopo. Nada do que está em "fora de
   escopo" — nem "já que estou aqui", nem "é só uma linha".
3. Padrões do laboratório, sem perguntar:
   - **Dinheiro sempre em centavos inteiros.** Nenhum float em cálculo de valor,
     em nenhuma etapa, nem em arredondamento intermediário.
   - JS em camelCase, componentes React em PascalCase, um componente por arquivo.
   - Nomes de domínio em português (`adicionarItem`, `fecharVenda`), nomes
     técnicos em inglês (`handleSubmit`, `useEffect`).
   - **CSS fora do JSX**: `.css` co-localizado ao lado do componente. Nada de
     estilo inline novo, nada de cor literal — use os tokens já definidos.
   - **Toda função pura nova nasce com teste**, no arquivo `.test.js` ao lado.
   - Persistência local sempre com try/catch: storage pode estar cheio, negado
     ou corrompido, e o balcão não pode parar por causa disso.
   - Nada de `console.log` esquecido. Nada de `TODO` sem justificativa escrita.
4. Intuitividade não é passo separado, é como você constrói: rótulo em português
   do balcão, a próxima ação é o elemento mais visível da tela, e todo estado
   (vazio, carregando, erro, sucesso) tem resposta visível. Ação destrutiva
   pede confirmação.
5. Não rode teste de aprovação aqui — isso é do `/review`. Este comando só
   constrói. (Rodar `npm test` para se orientar durante a implementação está
   ótimo; o julgamento é que fica para depois.)
6. Ao final, reporte em três blocos curtos:
   - Arquivos criados/modificados
   - Quais critérios de aceite você acredita já cobertos
   - Qualquer desvio da spec que você teve que fazer, e por quê

Termine com: `Build concluído.`
