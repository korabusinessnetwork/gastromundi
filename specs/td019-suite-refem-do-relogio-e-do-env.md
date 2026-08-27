# TD019 — Suíte de testes refém do relógio e do `.env.local` da máquina

## 1. Escopo

Fazer `npm test` passar em **clone novo**, sem `.env.local` e em qualquer fuso,
sem alterar uma linha de código de produção. Duas causas independentes:

1. **9 arquivos morrendo na importação.** `src/lib/supabase.js:13` lança
   `VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY ausentes` no momento do import.
   Qualquer teste que alcance `src/utils/hooks.js` (que importa o client) explode
   antes do primeiro `it()` — mesmo com o Supabase dublado. Sem `.env.local`
   (que não é versionado, e nem deve ser), essas 9 suítes simplesmente não rodam:
   **106 testes invisíveis**, uma suíte que parecia proteger o que não protegia.
2. **4 asserções dependentes do fuso da máquina:** `src/lib/assinatura.test.js:276`
   ("carencia" vindo "ativo") e `:324` (4 vindo 5), `src/lib/console.test.js:970`
   (`diasSemVender` 0 vindo 1) e
   `src/components/console/AnalyticsDashboard.test.jsx:201` ("Ontem" vindo "Hoje").
   Passavam no notebook (UTC-3) e quebravam no contêiner (UTC).

## 2. Fora de escopo

- **Qualquer mudança na lógica de datas do produto.** Vencimento de assinatura,
  "Hoje"/"Ontem" e "dias sem vender" leem o **calendário local de quem opera** —
  é o comportamento certo para o restaurante, e não é isso que está errado.
- Reescrever as 4 asserções para construir data a partir de fuso explícito: é a
  solução mais robusta a longo prazo, mas mexe em teste que hoje descreve bem a
  regra; fica registrada como o caminho para quando existir tenant fora de
  `America/Sao_Paulo`.
- Versionar `.env.example` ou tocar em `src/lib/supabase.js` para afrouxar a
  checagem — a checagem existe para não subir aplicativo sem credencial, e
  enfraquecê-la para agradar o teste é trocar segurança por conveniência.

## 3. Arquivos afetados

- `vitest.config.js` (modificado) — único arquivo.

## 4. Solução

Bloco `test.env` em `vitest.config.js`:

- `TZ: "America/Sao_Paulo"` — fixa o fuso da suíte inteira. As datas fixas já
  escritas nos testes voltam a significar o que quem as escreveu quis dizer, em
  qualquer máquina, sem tocar em produção.
- `VITE_SUPABASE_URL: "http://supabase.teste.invalid"` e
  `VITE_SUPABASE_ANON_KEY: "chave-anon-de-teste"` — credenciais de mentira só
  para satisfazer a checagem de importação. Nenhuma requisição real sai daí: o
  client nunca chega a ser usado, sempre é dublado (`src/test/mockSupabase.js`).
  O host `.invalid` é reservado por RFC 2606 justamente para isso — se algum dia
  alguma chamada escapar do dublê, ela falha em DNS em vez de ir para um servidor
  de verdade.

Cada uma das três variáveis leva comentário no arquivo explicando **por que**
existe, para que a próxima pessoa não as apague achando que é lixo.

## 5. Critérios de aceite

1. `npm test` verde em clone sem `.env.local`.
2. `npm test` verde com o relógio do contêiner em UTC.
3. Os 9 arquivos que morriam na importação passam a executar de fato (a contagem
   total de testes **sobe**, não fica igual).
4. Nenhum arquivo fora de `vitest.config.js` é modificado.
5. Nenhuma credencial real, nenhum host real, nenhuma requisição de rede na suíte.

## 6. Resultado

`207 arquivos / 3612 testes`, todos verdes — contra `13 arquivos falhando |
194 passando` e `4 testes falhando | 3502 passando` antes. Os +106 testes são
exatamente os que estavam mortos.

## 7. Limite declarado

O fuso fixo **esconde bugs reais de fuso**. Enquanto todo tenant estiver em
`America/Sao_Paulo`, o custo é zero. No dia em que o produto atender um
estabelecimento fora desse fuso, o certo é o teste construir as datas a partir
do fuso do tenant, e não o config fixar um para todo mundo.
