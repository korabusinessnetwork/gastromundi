import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LuPlus, LuStore, LuLogOut, LuTriangleAlert, LuCircleCheck, LuLoaderCircle, LuBuilding2,
  LuPalette, LuChartColumn, LuActivity, LuPuzzle, LuSearch, LuBanknote, LuReceipt, LuFilter,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import {
  listarEstabelecimentos, listarPlanos, listarAssinaturas,
  listarAddonsPorTenant, contarAddonsPorTenant, resumirPlataforma, ordenarPorUrgencia,
  filtrarEstabelecimentos, filtrarPorSituacao, FILTROS_SITUACAO, normalizarFiltroSituacao,
} from "@/lib/console";
import { LAYOUTS, layoutDoTema } from "@/layouts";
import NovoEstabelecimentoModal from "@/components/console/NovoEstabelecimentoModal";
import AlterarPlanoModal from "@/components/console/AlterarPlanoModal";
import AlterarLayoutModal from "@/components/console/AlterarLayoutModal";
import AddonsModal from "@/components/console/AddonsModal";
import PlanosDashboard from "@/components/console/PlanosDashboard";
import AnalyticsDashboard from "@/components/console/AnalyticsDashboard";
import SeloStatus from "@/components/console/SeloStatus";
import ConfirmarRenovacaoModal from "@/components/console/ConfirmarRenovacaoModal";
import HistoricoPagamentosModal from "@/components/console/HistoricoPagamentosModal";
import "./ConsolePage.css";

/**
 * Console da Plataforma (S1-2, ADR-008 §7).
 *
 * Painel do super-admin `plataforma` (dono do SaaS): lista os
 * estabelecimentos (tenants) e cria novos. É a tela que efetivamente
 * "liga" o multi-tenant comercial — o 2º cliente em diante nasce aqui.
 *
 * Por que é intuitiva (Princípio nº1): uma coisa só na tela — a lista de
 * estabelecimentos — e uma única ação principal, sempre visível no topo
 * ("Novo estabelecimento"). Cada um dos quatro estados tem tratamento
 * humano e explícito: carregando (esqueleto/spinner), vazio (convite a
 * criar o primeiro), erro (aviso + "Tentar de novo") e sucesso (faixa
 * verde confirmando o que foi criado). Nada de jargão: "estabelecimento",
 * "plano", "responsável".
 */

/**
 * Rótulos dos atalhos de situação, na linguagem do dono — nunca os nomes
 * técnicos dos status (`carencia`, `bloqueado`). A ordem de `FILTROS_SITUACAO`
 * é a ordem na tela: o recorte mais largo primeiro.
 */
const ROTULOS_FILTRO = {
  todos: "Todos",
  atencao: "Precisam de atenção",
  em_dia: "Em dia",
};

export default function ConsolePage() {
  const { currentUser, logout } = useApp();

  const [tenants, setTenants] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [assinaturas, setAssinaturas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [erroPlanos, setErroPlanos] = useState(false);
  const [erroAssinaturas, setErroAssinaturas] = useState(false);
  const [erroAddons, setErroAddons] = useState(false);
  const [aba, setAba] = useState("estabelecimentos"); // 'estabelecimentos' | 'planos' | 'uso'
  const [modalAberto, setModalAberto] = useState(false);
  const [tenantSelecionado, setTenantSelecionado] = useState(null);
  const [tenantLayoutSelecionado, setTenantLayoutSelecionado] = useState(null);
  const [tenantAddonsSelecionado, setTenantAddonsSelecionado] = useState(null);
  // Linha de cobrança (do `resumirPlataforma`) que está sendo renovada pelo
  // card. Guarda a LINHA, não o tenant, porque é o que o modal de renovação
  // já sabe consumir na outra aba.
  const [linhaRenovacao, setLinhaRenovacao] = useState(null);
  // Linha cujo histórico de pagamentos está aberto. Mesmo formato do
  // `linhaRenovacao` — os dois modais consomem a linha do `resumirPlataforma`.
  const [linhaHistorico, setLinhaHistorico] = useState(null);
  const [addonsPorTenant, setAddonsPorTenant] = useState({});
  const [addonsMudaram, setAddonsMudaram] = useState(false);
  const [sucesso, setSucesso] = useState(null);
  const [busca, setBusca] = useState("");
  // Recorte da lista por situação de cobrança: todos | atencao | em_dia.
  //
  // Mora na URL, não em estado local: recarregar a página, favoritar o
  // endereço ou abrir o Console em outra aba devolve a mesma lista — o dono
  // deixa aberto em "precisam de atenção" e volta nele. O termo da busca,
  // esse sim, fica só na tela: é transitório e poria nome de cliente no
  // histórico do navegador.
  //
  // Com a leitura das assinaturas quebrada, o parâmetro é ignorado: não há
  // situação confiável para recortar, e a tela também não mostra os atalhos —
  // o dono veria uma lista curta sem nada explicando o corte.
  const [searchParams, setSearchParams] = useSearchParams();
  const filtroSituacao = erroAssinaturas
    ? "todos"
    : normalizarFiltroSituacao(searchParams.get("situacao"));

  // "Todos" apaga o parâmetro em vez de escrever `situacao=todos`: é o
  // estado natural da tela, e endereço limpo é o que se copia sem pensar.
  // `replace` porque trocar de recorte não é navegar — sem isso, o "voltar"
  // do navegador desfaria filtro por filtro em vez de sair do Console.
  const escolherFiltro = (f) => {
    setSearchParams(
      (atual) => {
        const proximo = new URLSearchParams(atual);
        if (f === "todos") proximo.delete("situacao");
        else proximo.set("situacao", f);
        return proximo;
      },
      { replace: true }
    );
  };

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    const [
      { data: listaTenants, error: eTenants },
      { data: listaPlanos, error: ePlanos },
      { data: listaAssinaturas, error: eAssinaturas },
      { data: listaAddons, error: eAddons },
    ] = await Promise.all([
      listarEstabelecimentos(),
      listarPlanos(),
      listarAssinaturas(),
      listarAddonsPorTenant(),
    ]);
    if (eTenants) {
      setErro("Não foi possível carregar os estabelecimentos. Verifique a conexão e tente de novo.");
      setCarregando(false);
      return;
    }
    setTenants(listaTenants);
    setPlanos(listaPlanos);
    setAssinaturas(listaAssinaturas ?? []);
    // Guardamos só a CONTAGEM por tenant: o card precisa de um número, e a
    // lista completa quem lê é o modal, que a busca de novo ao abrir.
    setAddonsPorTenant(contarAddonsPorTenant(listaAddons));
    // As duas leituras secundárias falham devolvendo lista vazia — e lista
    // vazia é indistinguível de "não tem nenhum". Guardamos a falha para a
    // tela dizer que não sabe, em vez de afirmar zero (R$ 0 de receita,
    // ninguém precisando de atenção) como se fosse a verdade.
    setErroPlanos(Boolean(ePlanos));
    setErroAssinaturas(Boolean(eAssinaturas));
    setErroAddons(Boolean(eAddons));
    setCarregando(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const aoCriar = (data) => {
    setModalAberto(false);
    setSucesso(data);
    carregar();
  };

  const aoAlterarPlano = (tenant) => {
    setSucesso(null);
    setTenantSelecionado(tenant);
  };

  const aoPlanoAlterado = (tenant) => {
    setTenantSelecionado(null);
    setSucesso({
      nome: tenant.nome,
      planoAlterado: rotularPlano(planos, tenant.plano_codigo),
    });
    carregar();
  };

  const aoAlterarLayout = (tenant) => {
    setSucesso(null);
    setTenantLayoutSelecionado(tenant);
  };

  const aoLayoutAlterado = (tenant) => {
    setTenantLayoutSelecionado(null);
    setSucesso({
      nome: tenant.nome,
      layoutAlterado: rotularLayout(tenant.tema),
    });
    carregar();
  };

  const aoAbrirAddons = (tenant) => {
    setSucesso(null);
    setTenantAddonsSelecionado(tenant);
  };

  // O modal de add-ons não fecha a cada troca (dá para ligar dois seguidos),
  // e a faixa de sucesso ficaria escondida atrás dele. Então o retorno da
  // ação aparece na própria linha do modal, e aqui só marcamos que houve
  // mudança para recontar a lista quando ele fechar.
  const aoAddonAlterado = () => {
    setAddonsMudaram(true);
  };

  const aoFecharAddons = () => {
    const tenant = tenantAddonsSelecionado;
    setTenantAddonsSelecionado(null);
    if (!addonsMudaram) return;
    setAddonsMudaram(false);
    setSucesso({ nome: tenant?.nome, addonsAtualizados: true });
    carregar();
  };

  const aoRegistrarPagamento = (linha) => {
    setSucesso(null);
    setLinhaRenovacao(linha);
  };

  const aoPagamentoConfirmado = (assinatura) => {
    const nome = linhaRenovacao?.nome;
    setLinhaRenovacao(null);
    setSucesso({ nome, pagamentoAte: assinatura?.data_vencimento ?? null });
    carregar();
  };

  const aoVerPagamentos = (linha) => {
    setSucesso(null);
    setLinhaHistorico(linha);
  };

  // Sem catálogo de planos não há o que escolher no cadastro (o plano é
  // obrigatório): a ação principal fica desabilitada e a tela diz por quê,
  // em vez de abrir um formulário sem saída — prevenção de erro > mensagem
  // de erro (Princípio nº1).
  const semPlanos = planos.length === 0;

  // Situação da cobrança por tenant, para o card da lista. Vem da MESMA
  // função da aba "Planos e assinaturas" (`resumirPlataforma`, que recalcula
  // o status pela data em vez de confiar no campo em cache): duas contas
  // diferentes acabariam mostrando "Ativo" aqui e "Em atraso" ali para o
  // mesmo estabelecimento, e o dono não teria como saber qual acreditar.
  // Sem consulta nova — `carregar()` já traz as assinaturas.
  //
  // A mesma passada resolve a ORDEM da lista: quem precisa de ação sobe
  // para o topo (`ordenarPorUrgencia`, a régua do alerta de validade), para
  // o bloqueado não se esconder no meio da base conforme ela cresce. Com a
  // leitura das assinaturas quebrada não há dado para ordenar: mantém a
  // ordem do banco e não afirma nada — sem legenda.
  const { situacaoPorTenant, tenantsOrdenados, idsPrecisamAtencao } = useMemo(() => {
    const { linhas, precisamAtencao } = resumirPlataforma(tenants, planos, assinaturas);
    return {
      situacaoPorTenant: new Map(linhas.map((l) => [l.tenantId, l])),
      tenantsOrdenados: erroAssinaturas ? tenants : ordenarPorUrgencia(tenants, linhas),
      idsPrecisamAtencao: new Set(erroAssinaturas ? [] : precisamAtencao.map((l) => l.tenantId)),
    };
  }, [tenants, planos, assinaturas, erroAssinaturas]);

  // Recorte por situação — o filtro corta primeiro, a busca procura DENTRO do
  // recorte. A ordem importa para a leitura da tela: "vendo os que precisam de
  // atenção, procurando o Fulano" é a frase que o dono monta clicando; o
  // contrário ("procurando o Fulano entre os que precisam") esconderia o
  // resultado da busca sem explicação.
  const tenantsDoFiltro = useMemo(
    () => filtrarPorSituacao(tenantsOrdenados, filtroSituacao, idsPrecisamAtencao),
    [tenantsOrdenados, filtroSituacao, idsPrecisamAtencao]
  );

  // Busca por nome — a lista vem inteira do banco, então filtrar é local e
  // instantâneo (nenhuma consulta nova). Filtrar não reordena: o resultado
  // continua com quem precisa de ação no topo.
  const tenantsVisiveis = useMemo(
    () => filtrarEstabelecimentos(tenantsDoFiltro, busca),
    [tenantsDoFiltro, busca]
  );

  // Contagem de cada atalho: sempre sobre a base inteira, não sobre o que a
  // busca deixou na tela — o número no atalho precisa dizer quantos EXISTEM
  // naquele recorte, senão clicar nele mostraria mais do que o botão prometia.
  const contagens = useMemo(() => {
    const atencao = tenantsOrdenados.filter((t) => idsPrecisamAtencao.has(t.id)).length;
    return { todos: tenantsOrdenados.length, atencao, em_dia: tenantsOrdenados.length - atencao };
  }, [tenantsOrdenados, idsPrecisamAtencao]);

  // Conta só quem está NA TELA: durante uma busca, anunciar pendências que o
  // filtro escondeu mandaria o dono procurar um card que não está ali.
  const quantosPrecisamAtencao = useMemo(
    () => tenantsVisiveis.filter((t) => idsPrecisamAtencao.has(t.id)).length,
    [tenantsVisiveis, idsPrecisamAtencao]
  );

  return (
    <div className="console">
      <header className="console__topo">
        <div className="console__marca">
          <LuStore size={22} aria-hidden />
          <div>
            {/* Console é da PLATAFORMA (multi-tenant) — marca Kora, não a de um cliente */}
            <div className="console__marca-titulo">KORA</div>
            <div className="console__marca-sub">Console da Plataforma</div>
          </div>
        </div>
        <div className="console__usuario">
          <span className="console__usuario-nome">{currentUser?.name ?? "Plataforma"}</span>
          <button className="console__sair" onClick={logout} aria-label="Sair">
            <LuLogOut size={16} aria-hidden /> Sair
          </button>
        </div>
      </header>

      <main className="console__conteudo">
        {/* Abas: gestão da base (estabelecimentos), quem paga (planos +
            assinaturas) e quem usa (uso e faturamento). Sempre visíveis —
            trocar de aba é a navegação principal do Console (Princípio nº1). */}
        <nav className="console__abas" aria-label="Seções do console">
          <button
            type="button"
            className={`console__aba${aba === "estabelecimentos" ? " console__aba--ativa" : ""}`}
            onClick={() => setAba("estabelecimentos")}
          >
            <LuBuilding2 size={16} aria-hidden /> Estabelecimentos
          </button>
          <button
            type="button"
            className={`console__aba${aba === "planos" ? " console__aba--ativa" : ""}`}
            onClick={() => setAba("planos")}
          >
            <LuChartColumn size={16} aria-hidden /> Planos e assinaturas
          </button>
          <button
            type="button"
            className={`console__aba${aba === "uso" ? " console__aba--ativa" : ""}`}
            onClick={() => setAba("uso")}
          >
            <LuActivity size={16} aria-hidden /> Uso e faturamento
          </button>
        </nav>

        {carregando ? (
          <div className="console__estado">
            <LuLoaderCircle size={26} className="console__spin" aria-hidden />
            <p>Carregando…</p>
          </div>
        ) : erro ? (
          <div className="console__estado console__estado--erro">
            <LuTriangleAlert size={26} aria-hidden />
            <p>{erro}</p>
            <button className="console__novo" onClick={carregar}>Tentar de novo</button>
          </div>
        ) : (aba === "planos" || aba === "uso") && erroAssinaturas ? (
          // Preferimos não mostrar nada a mostrar número errado: sem a
          // leitura da cobrança, o dashboard diria "receita R$ 0" e
          // "ninguém precisa de atenção" para uma base que pode estar
          // toda em atraso. Vale igual para a aba de uso, que só sabe quem
          // "paga e não está vendendo" se souber quem paga.
          <div className="console__estado console__estado--erro">
            <LuTriangleAlert size={26} aria-hidden />
            <p>
              Não foi possível carregar a cobrança dos estabelecimentos. Isso não quer
              dizer que ninguém está pagando — os números só aparecem quando a leitura
              funcionar.
            </p>
            <button className="console__novo" onClick={carregar}>Tentar de novo</button>
          </div>
        ) : aba === "uso" ? (
          // A leitura do uso é da própria aba (RPC `analytics_plataforma`):
          // nada é pedido ao banco enquanto ninguém abrir "Uso e
          // faturamento", então uma base sem a 20260912 aplicada continua
          // com o resto do Console funcionando igual.
          <AnalyticsDashboard tenants={tenants} assinaturas={assinaturas} />
        ) : aba === "planos" ? (
          <PlanosDashboard
            tenants={tenants}
            planos={planos}
            assinaturas={assinaturas}
            // Quem deu baixa no pagamento fica gravado em
            // `assinaturas_pagamentos.confirmado_por` — o histórico precisa
            // dizer quem confirmou, não só que alguém confirmou.
            confirmadoPor={currentUser?.name ?? null}
            onAtualizado={carregar}
          />
        ) : (
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
                disabled={semPlanos}
                title={semPlanos ? "É preciso ter um plano disponível para cadastrar" : undefined}
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
                {erroPlanos && (
                  <button type="button" className="console__aviso-acao" onClick={carregar}>
                    Tentar de novo
                  </button>
                )}
              </div>
            )}

            {sucesso && (
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
                  ) : sucesso.addonsAtualizados ? (
                    <>Add-ons de <strong>{sucesso.nome}</strong> atualizados.</>
                  ) : (
                    <><strong>{sucesso.nome}</strong> criado. O responsável já pode entrar com o
                    usuário <strong>{sucesso.admin?.username}</strong>.</>
                  )}
                </span>
                <button className="console__sucesso-fechar" onClick={() => setSucesso(null)} aria-label="Dispensar">×</button>
              </div>
            )}

            {tenants.length === 0 ? (
              <div className="console__estado">
                <LuBuilding2 size={30} aria-hidden />
                <p className="console__vazio-titulo">Nenhum estabelecimento ainda</p>
                <p className="console__vazio-texto">Crie o primeiro para começar a vender o sistema.</p>
                <button
                  className="console__novo"
                  onClick={() => setModalAberto(true)}
                  disabled={semPlanos}
                  title={semPlanos ? "É preciso ter um plano disponível para cadastrar" : undefined}
                >
                  <LuPlus size={18} aria-hidden /> Criar o primeiro
                </button>
              </div>
            ) : (
              <>
                {/* Buscar pelo nome: com a base crescendo, rolar a lista
                    inteira deixa de ser caminho. Filtra enquanto digita, sem
                    botão de "buscar" — nada a confirmar. */}
                <div className="console__busca">
                  <LuSearch size={17} aria-hidden className="console__busca-icone" />
                  <input
                    type="search"
                    className="console__busca-campo"
                    placeholder="Buscar estabelecimento pelo nome"
                    aria-label="Buscar estabelecimento pelo nome"
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

                {/* A ordem da lista não pode ser mágica: se algo subiu para o
                    topo, a tela diz quantos são e por quê. */}
                {quantosPrecisamAtencao > 0 && (
                  <p className="console__ordem-aviso">
                    {quantosPrecisamAtencao === 1
                      ? "1 estabelecimento precisa de atenção e aparece primeiro."
                      : `${quantosPrecisamAtencao} estabelecimentos precisam de atenção e aparecem primeiro.`}
                  </p>
                )}
              {tenantsVisiveis.length === 0 && filtroSituacao !== "todos" ? (
                // Vazio do RECORTE — o dono precisa saber que a tela está
                // filtrando, senão "sumiu tudo" vira susto. Quando há busca
                // junto, o texto nomeia os dois cortes na ordem em que agem.
                <div className="console__estado">
                  <LuFilter size={30} aria-hidden />
                  <p className="console__vazio-titulo">
                    {busca.trim()
                      ? `Nenhum estabelecimento com “${busca.trim()}” em “${ROTULOS_FILTRO[filtroSituacao]}”`
                      : filtroSituacao === "atencao"
                        ? "Nenhum estabelecimento precisa de atenção agora"
                        : "Nenhum estabelecimento está em dia agora"}
                  </p>
                  <p className="console__vazio-texto">
                    A lista está filtrada por “{ROTULOS_FILTRO[filtroSituacao]}”.
                  </p>
                  <button type="button" className="console__novo" onClick={() => escolherFiltro("todos")}>
                    Ver todos
                  </button>
                </div>
              ) : tenantsVisiveis.length === 0 ? (
                // Vazio de BUSCA — diferente do vazio de base: aqui existem
                // estabelecimentos, só nenhum com esse nome.
                <div className="console__estado">
                  <LuSearch size={30} aria-hidden />
                  <p className="console__vazio-titulo">
                    Nenhum estabelecimento com “{busca.trim()}”
                  </p>
                  <p className="console__vazio-texto">Confira o nome ou limpe a busca para ver todos.</p>
                  <button type="button" className="console__novo" onClick={() => setBusca("")}>
                    Limpar busca
                  </button>
                </div>
              ) : (
              <ul className="console__lista">
                {tenantsVisiveis.map((t) => {
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
                            </>
                          )}
                        </span>
                        <span className="console__card-data">
                          Criado em {formatarData(t.created_at)}
                        </span>
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
                        aria-label={`Registrar pagamento de ${t.nome}`}
                        title="Registrar o pagamento da mensalidade e empurrar o vencimento"
                      >
                        <LuBanknote size={17} aria-hidden />
                        <span className="console__cobrar-nome">Registrar pagamento</span>
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
                    <button
                      type="button"
                      className="console__layout"
                      onClick={() => aoAlterarLayout(t)}
                      title="Trocar o layout deste estabelecimento"
                    >
                      <LuPalette size={17} aria-hidden />
                      <span className="console__layout-nome">{rotularLayout(t.tema)}</span>
                    </button>
                    <button
                      type="button"
                      className="console__addons"
                      onClick={() => aoAbrirAddons(t)}
                      title="Ligar ou desligar os add-ons pagos deste estabelecimento"
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
              </>
            )}
          </>
        )}
      </main>

      {modalAberto && (
        <NovoEstabelecimentoModal
          planos={planos}
          onFechar={() => setModalAberto(false)}
          onCriado={aoCriar}
        />
      )}

      {linhaRenovacao && (
        <ConfirmarRenovacaoModal
          linha={linhaRenovacao}
          vencimentoAtual={formatarVencimento(linhaRenovacao.dataVencimento)}
          confirmadoPor={currentUser?.name ?? null}
          onFechar={() => setLinhaRenovacao(null)}
          onConfirmado={aoPagamentoConfirmado}
        />
      )}

      {linhaHistorico && (
        <HistoricoPagamentosModal
          linha={linhaHistorico}
          confirmadoPor={currentUser?.name ?? null}
          onFechar={() => setLinhaHistorico(null)}
          // Estornar mexe em `data_vencimento` e `status`: sem recarregar, o
          // card atrás do modal seguiria mostrando o vencimento antigo. O
          // modal fica aberto — a lista dele já se atualiza sozinha.
          onEstornado={() => carregar()}
        />
      )}

      {tenantSelecionado && (
        <AlterarPlanoModal
          tenant={tenantSelecionado}
          planos={planos}
          onFechar={() => setTenantSelecionado(null)}
          onAlterado={aoPlanoAlterado}
        />
      )}

      {tenantLayoutSelecionado && (
        <AlterarLayoutModal
          tenant={tenantLayoutSelecionado}
          onFechar={() => setTenantLayoutSelecionado(null)}
          onAlterado={aoLayoutAlterado}
        />
      )}

      {tenantAddonsSelecionado && (
        <AddonsModal
          tenant={tenantAddonsSelecionado}
          onFechar={aoFecharAddons}
          onAlterado={aoAddonAlterado}
        />
      )}
    </div>
  );
}

function formatarData(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

// `data_vencimento` é `date` puro (YYYY-MM-DD), sem hora. Passar por
// new Date() faria o navegador ler como UTC e recuar um dia no fuso do
// Brasil (-03) — "vence 04/08" para um vencimento em 05/08, justamente o
// número que o dono usa para decidir se cobra hoje. Formata pela string.
function formatarVencimento(iso) {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

// Mostra o nome amigável do plano (do catálogo), com o código como
// fallback caso o catálogo não tenha carregado.
function rotularPlano(planos, codigo) {
  return planos.find((p) => p.codigo === codigo)?.nome ?? codigo;
}

// Nome amigável do layout atual do tenant (catálogo src/layouts).
// layoutDoTema já degrada para "padrao" quando o tema não define layout.
function rotularLayout(tema) {
  const codigo = layoutDoTema(tema);
  return LAYOUTS[codigo]?.nome ?? codigo;
}

// O botão diz QUANTOS add-ons estão ligados, não "Add-ons": o dono precisa
// enxergar da lista quem já contratou algo, sem abrir estabelecimento por
// estabelecimento (Princípio nº1 — estado sempre visível).
// Quando a leitura falha a contagem vem vazia, e vazio é indistinguível de
// "não tem nenhum" — o dono leria "Sem add-ons" em todos os cards e poderia
// desligar cobrança de quem tem módulo ligado. A tela diz que não sabe.
function rotularAddons(quantos, erro) {
  if (erro) return "Add-ons indisponíveis";
  const n = Number(quantos) || 0;
  if (n === 0) return "Sem add-ons";
  if (n === 1) return "1 add-on";
  return `${n} add-ons`;
}
