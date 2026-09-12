/**
 * Até onde vai o dado que o app carrega na abertura.
 *
 * O bootstrap não traz a base inteira: `sales` vem só dos últimos 90 dias, e
 * isso não é detalhe interno do contexto. Toda tela que soma, compara ou
 * exporta vendas precisa saber onde o dado termina, senão afirma coisas sobre
 * um período que ela não tem: o card de lucro do Financeiro chegava a mostrar
 * prejuízo num mês antigo, porque a receita vinha vazia e a despesa vinha
 * cheia, e o atalho mais largo dos Relatórios exportava 90 dias com o
 * cabeçalho "Todo o período" para quem manda o arquivo ao contador.
 *
 * Mora aqui, e não no `AppContext`, por dois motivos: não é estado, e módulo de
 * constante não é substituído por dublê nos testes de tela, então as telas leem
 * o mesmo número que o bootstrap usa, sem cada arquivo de teste ter de
 * reexportá-lo.
 */
export const DIAS_JANELA_BOOTSTRAP = 90;
