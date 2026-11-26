import {
  LuPlus, LuTriangleAlert, LuCircleCheck, LuBuilding2, LuPalette, LuPuzzle, LuSearch, LuBanknote, LuReceipt, LuFilter, LuCopy, LuTag, LuExternalLink
} from "react-icons/lu";
import {
  FILTROS_SITUACAO, montarMensagemPrimeiroAcesso
} from "@/lib/console";
import { formatarReais } from "@/features/delivery/dados/deliveryPedidos";
import { urlDoCardapioPublico, urlDeAcessoDoTenant } from "@/lib/tenantSlug";
import SeloStatus from "@/components/console/SeloStatus";
import { ROTULOS_FILTRO, BLOCO_LISTA, formatarData, formatarVencimento, rotularPlano, rotularLayout, rotularAddons } from "./apoio";

// Aba Estabelecimentos: a lista da base de clientes, com busca, recortes e o cartão de primeiro acesso.
export default function AbaEstabelecimentos({ tela }) {
  const {
    tenants, planos, erroPlanos, erroAssinaturas, erroAddons, setQuantidade, setModalAberto, addonsPorTenant, sucesso, setSucesso, copiado, copiaFalhou, acessoCopiadoId, acessoFalhouId, busca, setBusca, situacaoPorTenant, idsPrecisamAtencao, filtroSituacao, escolherFiltro, filtroPlano, escolherPlano, carregar, aoAlterarPlano, aoAlterarLayout, aoAbrirAddons, aoRegistrarPagamento, aoVerPagamentos, aoDefinirMensalidade, semPlanos, online, motivoOffline, tenantsVisiveis, tenantsNaTela, restantes, contagens, contagensPlano, mostrarAtalhosPlano, descricaoRecorte, temRecorte, enderecoDeEntrada, enderecoDoCardapio, planoDoAcesso, usuarioDoAcesso, mensagemDeAcesso, copiarAcesso, copiarAcessoDoTenant, limparRecortes, quantosPrecisamAtencao,
  } = tela;
  return (
          <>
            <div className="console__cabecalho">
              <div>
                <h1 className="console__h1">Estabelecimentos</h1>
                <p className="console__subtitulo">
                  Cada estabelecimento é um cliente com seus próprios dados, plano e usuários.
                </p>
              </div>
              <button
                className="console__novo"
                onClick={() => setModalAberto(true)}
                disabled={semPlanos || !online}
                title={semPlanos ? "É preciso ter um plano disponível para cadastrar" : motivoOffline}
              >
                <LuPlus size={18} aria-hidden /> Novo estabelecimento
              </button>
            </div>

            {semPlanos && (
              <div className="console__aviso" role="status">
                <LuTriangleAlert size={18} aria-hidden />
                <span>
                  {erroPlanos
                    ? "Não foi possível carregar a lista de planos. Enquanto isso não é possível cadastrar um estabelecimento, e o plano de cada card aparece pelo código."
                    : "Nenhum plano disponível no catálogo. Ative um plano para poder cadastrar estabelecimentos."}
                </span>
                {/* `() => carregar()`, não `carregar`: o evento do clique
                    chegaria como o primeiro argumento, que hoje é o modo
                    silencioso (CONSOLE-UX 27) — e o dono não veria o
                    "carregando…" da recarga que ele mesmo pediu. */}
                {erroPlanos && (
                  <button type="button" className="console__aviso-acao" onClick={() => carregar()}>
                    Tentar de novo
                  </button>
                )}
              </div>
            )}

            {sucesso?.criado ? (
              <section className="console__acesso" aria-label="Dados de primeiro acesso">
                <div className="console__acesso-topo">
                  <LuCircleCheck size={18} aria-hidden />
                  <div className="console__acesso-intro">
                    <p className="console__acesso-titulo" role="status">
                      <strong>{sucesso.nome}</strong> criado.
                    </p>
                    <p className="console__acesso-texto">
                      Entregue estes dados ao responsável, é com eles que ele entra no sistema.
                    </p>
                  </div>
                  <button
                    className="console__sucesso-fechar"
                    onClick={() => setSucesso(null)}
                    aria-label="Dispensar"
                  >
                    ×
                  </button>
                </div>

                {/* Criação e preço são duas escritas. Se só a segunda falhou,
                    o estabelecimento existe e o cartão continua valendo — o
                    que o dono precisa saber é que o preço ficou de fora e
                    onde defini-lo, não que "deu erro". */}
                {/* Terceira escrita possível: dar baixa no pedido do site.
                    O estabelecimento existe de qualquer jeito — o risco aqui
                    é o dono ver o pedido ainda pendente amanhã e criar o
                    mesmo cliente duas vezes. */}
                {sucesso.filaFalhou && (
                  <p className="console__acesso-alerta" role="alert">
                    <LuTriangleAlert size={16} aria-hidden /> O estabelecimento foi criado, mas o
                    pedido continua na fila. Recuse-o em "Pedidos de conta" para não criar o
                    mesmo cliente de novo.
                  </p>
                )}

                {sucesso.mensalidadeFalhou && (
                  <p className="console__acesso-alerta" role="alert">
                    <LuTriangleAlert size={16} aria-hidden /> O estabelecimento foi criado, mas a
                    mensalidade não foi salva. Defina o valor em "Planos e assinaturas".
                  </p>
                )}

                <dl className="console__acesso-dados">
                  <div>
                    <dt>Estabelecimento</dt>
                    <dd>{sucesso.nome}</dd>
                  </div>
                  {planoDoAcesso && (
                    <div>
                      <dt>Plano</dt>
                      <dd>{planoDoAcesso}</dd>
                    </div>
                  )}
                  {/* A mensalidade fica no cartão, mas NÃO entra na mensagem
                      copiada: aquele texto é para o cliente entrar no sistema,
                      não é fatura. Aqui ela serve para o dono conferir que o
                      preço combinado foi mesmo gravado. */}
                  {sucesso.mensalidade > 0 && (
                    <div>
                      <dt>Mensalidade</dt>
                      <dd>{formatarReais(sucesso.mensalidade)} por mês</dd>
                    </div>
                  )}
                  {enderecoDeEntrada && (
                    <div>
                      <dt>Endereço de entrada</dt>
                      <dd>{enderecoDeEntrada}</dd>
                    </div>
                  )}
                  {/* A loja pública já nasce no ar junto com o estabelecimento,
                      e este é o minuto em que o dono está com o cliente na
                      linha. Link de verdade, em aba nova: dá para conferir na
                      hora que o cardápio abre antes de mandar o endereço. */}
                  {enderecoDoCardapio && (
                    <div>
                      <dt>Endereço do cardápio</dt>
                      <dd>
                        <a
                          className="console__acesso-link"
                          href={enderecoDoCardapio}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir a loja pública deste estabelecimento em nova aba"
                        >
                          {enderecoDoCardapio}
                        </a>
                      </dd>
                    </div>
                  )}
                  {usuarioDoAcesso && (
                    <div>
                      <dt>Usuário</dt>
                      <dd>{usuarioDoAcesso}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Senha</dt>
                    <dd>A que você definiu no cadastro. Mande em uma mensagem separada.</dd>
                  </div>
                </dl>

                <div className="console__acesso-acoes">
                  <button type="button" className="console__novo" onClick={copiarAcesso}>
                    <LuCopy size={18} aria-hidden /> Copiar dados de acesso
                  </button>
                  {copiado && (
                    <span className="console__acesso-ok" role="status">
                      Copiado!
                    </span>
                  )}
                </div>

                {copiaFalhou && (
                  <div className="console__acesso-manual">
                    <p className="console__acesso-texto">
                      Não deu para copiar sozinho. Selecione o texto abaixo e copie à mão:
                    </p>
                    <textarea
                      className="console__acesso-mensagem"
                      readOnly
                      rows={7}
                      value={mensagemDeAcesso}
                      aria-label="Mensagem de primeiro acesso"
                    />
                  </div>
                )}
              </section>
            ) : sucesso ? (
              <div className="console__sucesso" role="status">
                <LuCircleCheck size={18} aria-hidden />
                <span>
                  {sucesso.planoAlterado ? (
                    <>Plano de <strong>{sucesso.nome}</strong> atualizado para <strong>{sucesso.planoAlterado}</strong>.</>
                  ) : sucesso.layoutAlterado ? (
                    <>Layout de <strong>{sucesso.nome}</strong> trocado para <strong>{sucesso.layoutAlterado}</strong>.</>
                  ) : sucesso.pagamentoAte ? (
                    <>Pagamento de <strong>{sucesso.nome}</strong> registrado. Vence agora
                    em <strong>{formatarVencimento(sucesso.pagamentoAte)}</strong>.</>
                  ) : sucesso.mensalidadeDefinida !== undefined ? (
                    <>Mensalidade de <strong>{sucesso.nome}</strong> definida
                    em <strong>{formatarReais(sucesso.mensalidadeDefinida)}</strong> por mês.</>
                  ) : (
                    <>Add-ons de <strong>{sucesso.nome}</strong> atualizados.</>
                  )}
                </span>
                <button className="console__sucesso-fechar" onClick={() => setSucesso(null)} aria-label="Dispensar">×</button>
              </div>
            ) : null}

            {tenants.length === 0 ? (
              <div className="console__estado">
                <LuBuilding2 size={30} aria-hidden />
                <p className="console__vazio-titulo">Nenhum estabelecimento ainda</p>
                <p className="console__vazio-texto">Crie o primeiro para começar a vender o sistema.</p>
                <button
                  className="console__novo"
                  onClick={() => setModalAberto(true)}
                  disabled={semPlanos || !online}
                  title={semPlanos ? "É preciso ter um plano disponível para cadastrar" : motivoOffline}
                >
                  <LuPlus size={18} aria-hidden /> Criar o primeiro
                </button>
              </div>
            ) : (
              <>
                {/* Buscar pelo nome ou pelo endereço: com a base crescendo,
                    rolar a lista inteira deixa de ser caminho. Filtra enquanto
                    digita, sem botão de "buscar" — nada a confirmar. O endereço
                    entra no rótulo porque é o dado com que o cliente se
                    identifica ao dono — quem não sabe que pode, não usa. */}
                <div className="console__busca">
                  <LuSearch size={17} aria-hidden className="console__busca-icone" />
                  <input
                    type="search"
                    className="console__busca-campo"
                    placeholder="Buscar pelo nome ou endereço"
                    aria-label="Buscar estabelecimento pelo nome ou endereço"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>

                {/* Atalhos de situação: a busca responde "onde está o Fulano",
                    estes respondem "quem eu preciso cobrar hoje". A contagem
                    fica no próprio botão para que clicar não seja aposta. Com a
                    leitura das assinaturas quebrada não há situação confiável —
                    e um recorte errado esconderia quem está devendo. */}
                {!erroAssinaturas && (
                  <div className="console__filtros" role="group" aria-label="Filtrar por situação de cobrança">
                    {FILTROS_SITUACAO.map((f) => (
                      <button
                        key={f}
                        type="button"
                        className="console__filtro"
                        aria-pressed={filtroSituacao === f}
                        onClick={() => escolherFiltro(f)}
                      >
                        {ROTULOS_FILTRO[f]}
                        <span className="console__filtro-conta">{contagens[f]}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Atalhos de plano: a pergunta que faltava é "quem está no
                    plano mais barato", candidato natural a upgrade. Os botões
                    saem do catálogo do banco — nenhum nome de plano escrito
                    aqui (decisão 017) — e cada um traz sua contagem sobre a
                    base inteira. */}
                {mostrarAtalhosPlano && (
                  <div className="console__filtros" role="group" aria-label="Filtrar por plano">
                    <button
                      type="button"
                      className="console__filtro"
                      aria-pressed={filtroPlano === "todos"}
                      onClick={() => escolherPlano("todos")}
                    >
                      Todos os planos
                      <span className="console__filtro-conta">{contagens.todos}</span>
                    </button>
                    {planos.map((p) => (
                      <button
                        key={p.codigo}
                        type="button"
                        className="console__filtro"
                        aria-pressed={filtroPlano === p.codigo}
                        onClick={() => escolherPlano(p.codigo)}
                      >
                        {p.nome ?? p.codigo}
                        <span className="console__filtro-conta">{contagensPlano[p.codigo] ?? 0}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* A ordem da lista não pode ser mágica: se algo subiu para o
                    topo, a tela diz quantos são e por quê. */}
                {quantosPrecisamAtencao > 0 && (
                  <p className="console__ordem-aviso">
                    {quantosPrecisamAtencao === 1
                      ? "1 estabelecimento precisa de atenção e aparece primeiro."
                      : `${quantosPrecisamAtencao} estabelecimentos precisam de atenção e aparecem primeiro.`}
                  </p>
                )}
              {tenantsVisiveis.length === 0 && temRecorte ? (
                // Vazio do RECORTE — o dono precisa saber que a tela está
                // filtrando, senão "sumiu tudo" vira susto. Quando há busca
                // junto, o texto nomeia os cortes na ordem em que agem.
                <div className="console__estado">
                  <LuFilter size={30} aria-hidden />
                  <p className="console__vazio-titulo">
                    {busca.trim()
                      ? `Nenhum estabelecimento com “${busca.trim()}” em “${descricaoRecorte}”`
                      : filtroPlano === "todos"
                        ? filtroSituacao === "atencao"
                          ? "Nenhum estabelecimento precisa de atenção agora"
                          : "Nenhum estabelecimento está em dia agora"
                        : `Nenhum estabelecimento em “${descricaoRecorte}”`}
                  </p>
                  <p className="console__vazio-texto">
                    A lista está filtrada por “{descricaoRecorte}”.
                  </p>
                  <button type="button" className="console__novo" onClick={limparRecortes}>
                    Ver todos
                  </button>
                </div>
              ) : tenantsVisiveis.length === 0 ? (
                // Vazio de BUSCA — diferente do vazio de base: aqui existem
                // estabelecimentos, só nenhum com esse nome ou endereço.
                <div className="console__estado">
                  <LuSearch size={30} aria-hidden />
                  <p className="console__vazio-titulo">
                    Nenhum estabelecimento com “{busca.trim()}”
                  </p>
                  <p className="console__vazio-texto">
                    Confira o nome ou o endereço, ou limpe a busca para ver todos.
                  </p>
                  <button type="button" className="console__novo" onClick={() => setBusca("")}>
                    Limpar busca
                  </button>
                </div>
              ) : (
              <ul className="console__lista">
                {tenantsNaTela.map((t) => {
                  const situacao = situacaoPorTenant.get(t.id);
                  // Cobrar aparece só em quem precisa de ação — mesma régua da
                  // ordem da lista (`idsPrecisamAtencao`), sem segunda cópia do
                  // critério. Fora: quem está em dia (nada a fazer), cancelado
                  // (renovar o descancelaria em silêncio, e ele nunca entra no
                  // conjunto) e sem assinatura, que a RPC recusaria — para esse
                  // o caminho é definir a mensalidade na aba de cobrança.
                  const podeCobrar =
                    idsPrecisamAtencao.has(t.id) && situacao?.status !== "sem_assinatura";
                  // Histórico existe para qualquer um que tenha assinatura —
                  // inclusive cancelado, que é onde mais se confere o que foi
                  // pago antes. Sem assinatura não há o que listar, e com a
                  // leitura quebrada não há nem `tenantId` para consultar.
                  const temHistorico =
                    !erroAssinaturas && !!situacao && situacao.status !== "sem_assinatura";
                  // Sem mensalidade definida (CONSOLE-UX 13). A régua é a MESMA
                  // do `kpis.semPreco`: só quem está sendo cobrado (ativo ou em
                  // carência) e vale zero — senão a lista e o aviso da aba de
                  // cobrança discordariam sobre quem está sem preço. Bloqueado,
                  // cancelado e sem assinatura têm outro problema, que os selos
                  // já contam. Sem saber a situação, não se afirma nada.
                  const semMensalidade =
                    !erroAssinaturas &&
                    (situacao?.status === "ativo" || situacao?.status === "carencia") &&
                    (situacao?.valorMensal ?? 0) <= 0;
                  // Endereço da vitrine pública deste estabelecimento
                  // (CONSOLE-UX 15). Null quando o tenant não tem slug
                  // utilizável — aí o atalho nem aparece.
                  const urlCardapio = urlDoCardapioPublico(t.slug);
                  // Porta de entrada da EQUIPE deste estabelecimento
                  // (CONSOLE-UX 16). Hoje, sem domínio raiz, é a mesma porta
                  // por onde o dono entrou; com subdomínio ligado, é o do
                  // tenant — e null quando não dá para afirmar nenhuma.
                  const urlDeEntrada = urlDeAcessoDoTenant(t.slug);
                  const mensagemDeAcessoDoCard =
                    urlDeEntrada === null
                      ? ""
                      : montarMensagemPrimeiroAcesso({
                          estabelecimento: t.nome,
                          plano: t.plano_codigo ? rotularPlano(planos, t.plano_codigo) : "",
                          endereco: urlDeEntrada,
                        });
                  return (
                  // Botões IRMÃOS (não aninhados — HTML inválido): o card troca
                  // o plano, o botão de paleta troca o layout e o de peça
                  // liga/desliga os add-ons pagos.
                  <li key={t.id} className="console__item">
                    <button
                      type="button"
                      className="console__card console__card--clicavel"
                      onClick={() => aoAlterarPlano(t)}
                      title="Trocar o plano deste estabelecimento"
                    >
                      <span className="console__card-icone" aria-hidden><LuBuilding2 size={20} /></span>
                      <span className="console__card-info">
                        <span className="console__card-nome">{t.nome}</span>
                        {/* Situação da cobrança na própria lista: é o que decide
                            a próxima ação do dono (renovar, cobrar, liberar) e
                            até aqui só existia na outra aba. Quando a leitura das
                            assinaturas falha, a tela diz que não sabe em vez de
                            mostrar "Ativo" para todo mundo. */}
                        <span className="console__card-situacao">
                          {erroAssinaturas ? (
                            <span className="console__card-sem-situacao">Situação indisponível</span>
                          ) : (
                            <>
                              <SeloStatus status={situacao?.status} dias={situacao?.diasParaVencer} />
                              {(situacao?.status === "ativo" || situacao?.status === "carencia") && situacao?.dataVencimento && (
                                <span className="console__card-vencimento">
                                  vence {formatarVencimento(situacao.dataVencimento)}
                                </span>
                              )}
                              {semMensalidade && (
                                <span className="console__card-sem-preco">Sem mensalidade</span>
                              )}
                            </>
                          )}
                        </span>
                        <span className="console__card-data">
                          Criado em {formatarData(t.created_at)}
                        </span>
                        {/* Endereço do estabelecimento (CONSOLE-UX 17): até aqui
                            ele só existia escondido no link do cardápio e no
                            texto copiado. Na tela ele faz dois trabalhos —
                            distingue dois cards de nome parecido e mostra o que
                            digitar na busca quando o cliente diz "meu link é
                            fulano". Tenant sem slug não ganha a linha: não há o
                            que afirmar. */}
                        {t.slug && (
                          <span
                            className="console__card-endereco"
                            title="Endereço deste estabelecimento nos links do sistema (cardápio e acesso)"
                          >
                            Endereço: {t.slug}
                          </span>
                        )}
                      </span>
                      {t.plano_codigo && (
                        <span className="console__plano">{rotularPlano(planos, t.plano_codigo)}</span>
                      )}
                    </button>
                    {podeCobrar && (
                      <button
                        type="button"
                        className="console__cobrar"
                        onClick={() => aoRegistrarPagamento(situacao)}
                        disabled={!online}
                        aria-label={`Registrar pagamento de ${t.nome}`}
                        title={motivoOffline ?? "Registrar o pagamento da mensalidade e empurrar o vencimento"}
                      >
                        <LuBanknote size={17} aria-hidden />
                        <span className="console__cobrar-nome">Registrar pagamento</span>
                      </button>
                    )}
                    {semMensalidade && (
                      <button
                        type="button"
                        className="console__preco"
                        onClick={() => aoDefinirMensalidade(situacao)}
                        disabled={!online}
                        aria-label={`Definir mensalidade de ${t.nome}`}
                        title={motivoOffline ?? "Definir quanto este estabelecimento paga por mês"}
                      >
                        {/* Etiqueta de preço, não a nota de dinheiro do "Registrar
                            pagamento": os dois botões podem aparecer no MESMO card
                            (vencendo e sem preço), e dois ícones iguais lado a lado
                            fariam o dono clicar no errado. */}
                        <LuTag size={17} aria-hidden />
                        <span className="console__preco-nome">Definir mensalidade</span>
                      </button>
                    )}
                    {temHistorico && (
                      <button
                        type="button"
                        className="console__pagamentos"
                        onClick={() => aoVerPagamentos(situacao)}
                        aria-label={`Ver pagamentos de ${t.nome}`}
                        title="Ver os pagamentos já lançados e cancelar um lançamento errado"
                      >
                        <LuReceipt size={17} aria-hidden />
                        <span className="console__pagamentos-nome">Pagamentos</span>
                      </button>
                    )}
                    {urlCardapio && (
                      <a
                        className="console__cardapio"
                        href={urlCardapio}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Ver cardápio de ${t.nome} em nova aba`}
                        title="Abrir a loja pública deste estabelecimento em nova aba"
                      >
                        {/* Seta de "sai daqui": é o único atalho do card que
                            leva para fora do Console, e o ícone precisa dizer
                            isso antes do clique — nenhum dos vizinhos (nota,
                            etiqueta, recibo, paleta, peça) abre outra aba. */}
                        <LuExternalLink size={17} aria-hidden />
                        <span className="console__cardapio-nome">Ver cardápio</span>
                      </a>
                    )}
                    {urlDeEntrada !== null && (
                      <button
                        type="button"
                        className="console__copiar"
                        onClick={() => copiarAcessoDoTenant(t.id, mensagemDeAcessoDoCard)}
                        aria-label={`Copiar acesso de ${t.nome}`}
                        title="Copiar nome, plano e endereço de entrada para mandar ao cliente"
                      >
                        {/* Duas folhas: o gesto é "levar este texto daqui para
                            a conversa com o cliente". Não repete nenhum ícone
                            do card — a seta ao lado sai do Console, esta fica. */}
                        <LuCopy size={17} aria-hidden />
                        <span className="console__copiar-nome">Copiar acesso</span>
                      </button>
                    )}
                    {acessoCopiadoId === t.id && (
                      <span className="console__copiar-ok" role="status">
                        Copiado!
                      </span>
                    )}
                    {acessoFalhouId === t.id && (
                      <div className="console__copiar-manual">
                        <p className="console__copiar-aviso">
                          Não deu para copiar sozinho. Selecione o texto abaixo e copie à mão:
                        </p>
                        <textarea
                          className="console__copiar-texto"
                          readOnly
                          rows={6}
                          value={mensagemDeAcessoDoCard}
                          aria-label={`Acesso de ${t.nome}`}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      className="console__layout"
                      onClick={() => aoAlterarLayout(t)}
                      disabled={!online}
                      title={motivoOffline ?? "Trocar o layout deste estabelecimento"}
                    >
                      <LuPalette size={17} aria-hidden />
                      <span className="console__layout-nome">{rotularLayout(t.tema)}</span>
                    </button>
                    <button
                      type="button"
                      className="console__addons"
                      onClick={() => aoAbrirAddons(t)}
                      disabled={!online}
                      title={motivoOffline ?? "Ligar ou desligar os add-ons pagos deste estabelecimento"}
                    >
                      <LuPuzzle size={17} aria-hidden />
                      <span className="console__addons-nome">
                        {rotularAddons(addonsPorTenant[t.id], erroAddons)}
                      </span>
                    </button>
                  </li>
                  );
                })}
              </ul>
              )}
              {/* Rodapé do bloco: primeiro a conta ("está vendo 20 de 47"),
                  depois a ação. Sem essa linha, uma lista cortada é
                  indistinguível de uma base menor do que ela é — e o dono
                  acharia que perdeu cliente. */}
              {restantes > 0 && (
                <div className="console__mais">
                  <p className="console__mais-conta">
                    Mostrando {tenantsNaTela.length} de {tenantsVisiveis.length} estabelecimentos.
                  </p>
                  <button
                    type="button"
                    className="console__mais-botao"
                    onClick={() => setQuantidade((q) => q + BLOCO_LISTA)}
                  >
                    Ver mais {Math.min(restantes, BLOCO_LISTA)}
                    {Math.min(restantes, BLOCO_LISTA) === 1 ? " estabelecimento" : " estabelecimentos"}
                  </button>
                </div>
              )}
              </>
            )}
          </>
  );
}
