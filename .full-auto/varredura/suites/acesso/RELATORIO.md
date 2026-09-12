# Suíte acesso

Fluxos: F001, F002, F005, F006, F010, F011, F015. Executada no Chromium, contra o app
buildado na porta 5201 e a ponte de QA na 54321.

| Caso | Fluxo | Status | Observado |
|---|---|---|---|
| A01 | F001 | PASSOU | a tela de login abre com um campo de senha e nenhum erro de console próprio do app |
| A02 | F001 | PASSOU | `qa-admin-a` entra e cai em `/app/pdv` |
| A03 | F002 | PASSOU | senha errada mostra a mensagem e mantém a pessoa no login |
| A04 | F015 | PASSOU | `/app/financeiro` sem sessão volta para `/login` |
| A05 | F011 | PASSOU | `qa-inativo-a` não entra, mesmo com a senha certa |
| A06 | F010 | PASSOU | credencial do estabelecimento B não entra pela porta do A |

Seis de seis. Evidências em `evidencias/A0*.png`.

Bugs: nenhum.

Não deu para testar: F005 (endereço inexistente) exigiria um host diferente do
configurado; a marca do tenant (F006) foi vista nas capturas mas não virou asserção.

Precisei de: nada em arquivo compartilhado.
