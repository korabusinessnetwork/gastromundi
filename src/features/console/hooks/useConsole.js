import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useSessao } from "@/context/AppContext";
import { useStatusRede } from "@/hooks/useStatusRede";
import {
  listarEstabelecimentos, listarPlanos, listarAssinaturas, listarAddonsPorTenant, contarAddonsPorTenant, resumirPlataforma, ordenarPorUrgencia, filtrarEstabelecimentos, filtrarPorSituacao, normalizarFiltroSituacao, normalizarAba, ABAS_CONSOLE, normalizarPeriodo, PERIODO_PADRAO, filtrarPorPlano, normalizarFiltroPlano, contarPorPlano, montarMensagemPrimeiroAcesso, listarSolicitacoes, decidirSolicitacao, pendentesPrimeiro, mensagemDeErroDoConsole
} from "@/lib/console";
import { urlDoCardapioPublico, urlDeAcessoDoTenant } from "@/lib/tenantSlug";
import { ROTULOS_FILTRO, BLOCO_LISTA, rotularPlano, rotularLayout } from "@/pages/console/apoio";
import { useEstadoJanelasConsole } from "./useEstadoJanelasConsole";
import { useEstadoCadastroConsole } from "./useEstadoCadastroConsole";

// Estado, carga, recortes da lista e ações do Console da plataforma.
export function useConsole() {
  const { currentUser, logout } = useSessao();

  const [tenants, setTenants] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [assinaturas, setAssinaturas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [erroPlanos, setErroPlanos] = useState(false);
  const [erroAssinaturas, setErroAssinaturas] = useState(false);
  const [erroAddons, setErroAddons] = useState(false);
  const {
    modalAberto, setModalAberto, solicitacoes, setSolicitacoes, erroSolicitacoes,
    setErroSolicitacoes, solicitacaoAprovando, setSolicitacaoAprovando, tenantSelecionado,
    setTenantSelecionado, tenantLayoutSelecionado, setTenantLayoutSelecionado,
    tenantAddonsSelecionado, setTenantAddonsSelecionado, linhaRenovacao, setLinhaRenovacao,
    linhaHistorico, setLinhaHistorico, linhaMensalidade, setLinhaMensalidade,
  } = useEstadoJanelasConsole();

  const {
    addonsPorTenant, setAddonsPorTenant, addonsMudaram, setAddonsMudaram, sucesso, setSucesso,
    copiado, setCopiado, copiaFalhou, setCopiaFalhou, acessoCopiadoId, setAcessoCopiadoId,
    acessoFalhouId, setAcessoFalhouId, busca, setBusca,
  } = useEstadoCadastroConsole();

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

  // A aba aberta ('estabelecimentos' | 'planos' | 'uso') mora na URL pelo
  // mesmo motivo, e escreve do mesmo jeito: a primeira aba apaga o parâmetro,
  // as outras o escrevem, e nunca se empilha histórico. Aba e recorte
  // convivem no mesmo endereço — cada escrita mexe só na própria chave.
  const aba = normalizarAba(searchParams.get("aba"));
  const escolherAba = (a) => {
    setSearchParams(
      (atual) => {
        const proximo = new URLSearchParams(atual);
        if (a === ABAS_CONSOLE[0]) proximo.delete("aba");
        else proximo.set("aba", a);
        return proximo;
      },
      { replace: true }
    );
  };

  // O período da aba de uso (7/30/90 dias) fecha a série: era o último
  // controle do Console que a recarga apagava. Mesmo desenho — 30 dias, o
  // padrão, apaga o parâmetro.
  const dias = normalizarPeriodo(searchParams.get("dias"));
  const escolherPeriodo = (d) => {
    setSearchParams(
      (atual) => {
        const proximo = new URLSearchParams(atual);
        if (d === PERIODO_PADRAO) proximo.delete("dias");
        else proximo.set("dias", String(d));
        return proximo;
      },
      { replace: true }
    );
  };

  // Recorte por plano contratado — responde "quem está no plano mais barato",
  // candidato natural a upgrade, que hoje só dá para saber abrindo card por
  // card. Os códigos válidos saem do CATÁLOGO DO BANCO, nunca de uma lista
  // fixa (decisão 017): plano novo passa a valer sozinho. Sem catálogo
  // confiável (`erroPlanos`) o parâmetro é ignorado, como o de situação
  // quando as assinaturas falham.
  const filtroPlano = erroPlanos
    ? "todos"
    : normalizarFiltroPlano(searchParams.get("plano"), planos);
  const escolherPlano = (codigo) => {
    setSearchParams(
      (atual) => {
        const proximo = new URLSearchParams(atual);
        if (codigo === "todos") proximo.delete("plano");
        else proximo.set("plano", codigo);
        return proximo;
      },
      { replace: true }
    );
  };

  // O Console pode ser fechado no meio de uma leitura — o dono sai da aba
  // enquanto a busca volta. Sem esta guarda, os `setState` do `carregar`
  // cairiam em componente desmontado (CONSOLE-UX 27, critério 9).
  // (O `= true` na entrada não é redundante: em StrictMode o React monta,
  // desmonta e remonta, e sem ele o ref ficaria falso para sempre depois da
  // primeira limpeza.)
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => { montado.current = false; };
  }, []);

  // `silencioso` é a recarga da volta da conexão (CONSOLE-UX 27): mesma busca,
  // sem acender o estado de carregando. Acender apagaria a lista inteira e
  // devolveria o dono ao "carregando…" logo depois de a internet voltar — o
  // contrário do que ele quer, que é ver os mesmos cards com números frescos.
  // Devolve `true`/`false` para quem chamou saber se deu certo; a tela em si
  // continua sendo pintada pelos `setState` daqui.
  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) {
      setCarregando(true);
      setErro("");
    }
    const [
      { data: listaTenants, error: eTenants },
      { data: listaPlanos, error: ePlanos },
      { data: listaAssinaturas, error: eAssinaturas },
      { data: listaAddons, error: eAddons },
      { data: listaSolicitacoes, error: eSolicitacoes },
    ] = await Promise.all([
      listarEstabelecimentos(),
      listarPlanos(),
      listarAssinaturas(),
      listarAddonsPorTenant(),
      listarSolicitacoes(),
    ]);
    if (!montado.current) return !eTenants;
    if (eTenants) {
      // Recarga silenciosa que falha não apaga a tela: o `erro` troca a lista
      // pelo bloco de falha, e quem estava lendo os cards ficaria sem nada por
      // causa de uma atualização que não pediu. Quem avisa nesse caso é a faixa
      // de rede, com o "Tentar de novo" (CONSOLE-UX 27).
      if (!silencioso) {
        setErro("Não foi possível carregar os estabelecimentos. Verifique a conexão e tente de novo.");
        setCarregando(false);
      }
      return false;
    }
    // Sucesso apaga o bloco de falha também na recarga silenciosa: se a
    // primeira carga tinha falhado, agora existe lista para mostrar.
    setErro("");
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
    // A fila falha devolvendo lista vazia, e vazio é indistinguível de "não
    // tem ninguém esperando" — que é justamente a leitura que faria o dono
    // deixar um cliente novo sem resposta. A aba diz que não sabe.
    setSolicitacoes(listaSolicitacoes ?? []);
    setErroSolicitacoes(Boolean(eSolicitacoes));
    // Só apaga o "carregando…" quem o acendeu: na recarga silenciosa ele nunca
    // subiu, e mexer nele aqui desligaria por engano a primeira carga que
    // ainda estivesse em voo.
    if (!silencioso) setCarregando(false);
    return true;
  }, [setAddonsPorTenant, setErroSolicitacoes, setSolicitacoes]);

  useEffect(() => { carregar(); }, [carregar]);

  const aoCriar = async (data) => {
    setModalAberto(false);
    setCopiado(false);
    setCopiaFalhou(false);
    // `criado: true` distingue a criação das outras confirmações (plano,
    // layout, pagamento, add-ons): só ela abre o cartão de primeiro acesso,
    // as demais continuam na faixa de uma linha.
    //
    // Se o estabelecimento nasceu de um PEDIDO do site, o pedido sai da fila
    // agora, vinculado ao tenant que acabou de nascer. São duas escritas: o
    // estabelecimento já existe e nada o desfaz, então uma falha aqui vira
    // AVISO — o cartão de acesso continua valendo, e o dono precisa saber que
    // o pedido continua pendente para não aprovar (e criar) duas vezes.
    const pedido = solicitacaoAprovando;
    setSolicitacaoAprovando(null);
    let filaFalhou = false;
    if (pedido?.id && data?.tenant_id) {
      const { error } = await decidirSolicitacao(pedido.id, "aprovada", {
        tenantId: data.tenant_id,
      });
      filaFalhou = Boolean(error);
    }
    setSucesso({ ...data, criado: true, filaFalhou });
    // O cartão de primeiro acesso — usuário e senha que o cliente precisa —
    // mora na aba dos estabelecimentos. Aprovar a partir da fila e ficar nela
    // esconderia justamente a credencial que acabou de nascer.
    if (pedido) escolherAba("estabelecimentos");
    carregar();
  };

  // Aprovar = criar. O formulário abre com o que a pessoa mandou pelo site
  // (nome do negócio, endereço pedido, responsável), e o resto — plano de
  // verdade, usuário e senha — o dono completa como em qualquer cadastro.
  const aoAprovarSolicitacao = (s) => {
    setSucesso(null);
    setSolicitacaoAprovando(s);
    setModalAberto(true);
  };

  // Devolve o desfecho para a própria fila mostrar no cartão: a faixa de
  // sucesso do Console vive na aba dos estabelecimentos, e quem recusou está
  // olhando para a lista de pedidos.
  const aoRecusarSolicitacao = async (s, observacao) => {
    const { error } = await decidirSolicitacao(s.id, "recusada", { observacao });
    if (error) {
      return {
        ok: false,
        erro: mensagemDeErroDoConsole(error, "Não foi possível recusar agora. Tente de novo."),
      };
    }
    carregar();
    return { ok: true, erro: null };
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

  // CONSOLE-UX 13 — definir o preço de quem entrou sem ele, sem trocar de aba.
  // Quem grava é o `DefinirMensalidadeModal` que já existe (RPC
  // `definir_mensalidade_tenant`); aqui só abrimos com a linha certa.
  const aoDefinirMensalidade = (linha) => {
    setSucesso(null);
    setLinhaMensalidade(linha);
  };

  const aoMensalidadeDefinida = (assinatura) => {
    const nome = linhaMensalidade?.nome;
    setLinhaMensalidade(null);
    setSucesso({ nome, mensalidadeDefinida: Number(assinatura?.valor_mensal) || 0 });
    carregar();
  };

  // Sem catálogo de planos não há o que escolher no cadastro (o plano é
  // obrigatório): a ação principal fica desabilitada e a tela diz por quê,
  // em vez de abrir um formulário sem saída — prevenção de erro > mensagem
  // de erro (Princípio nº1).
  // Quantos pedidos de conta esperam decisão — vira o selo ao lado da aba.
  const pendentesDeConta = useMemo(() => pendentesPrimeiro(solicitacoes).length, [solicitacoes]);

  const semPlanos = planos.length === 0;

  // Sem internet o Console vira só leitura (CONSOLE-UX 26): a lista que já
  // carregou, os filtros e os painéis continuam de pé, mas o que salva fica
  // travado com o motivo à vista — mesma escolha do `semPlanos` acima, pelo
  // mesmo motivo. O aviso de rede nos modais é a segunda linha de defesa,
  // para a conexão que cai depois de o formulário abrir.
  const online = useStatusRede();
  const motivoOffline = online
    ? undefined
    : "Sem conexão com a internet, reconecte para alterar";

  // ── A volta da conexão (CONSOLE-UX 27) ─────────────────────────────
  // Quando a internet voltava, a rodada 52 destravava os botões e sumia com a
  // faixa — mas os números na tela continuavam sendo os de antes da queda, sem
  // nada dizendo isso. Aqui a volta puxa os dados de novo, em silêncio (a lista
  // não pisca), e a faixa narra: atualizando, atualizado, ou não deu.
  //
  // `null` = nada a dizer; os outros três são o que a faixa mostra.
  const [atualizacao, setAtualizacao] = useState(null);
  // Guarda contra duas recargas sobrepostas: o navegador dispara `online` mais
  // de uma vez em troca de rede (cai o Wi-Fi, entra o 4G), e duas respostas
  // fora de ordem escreveriam a lista duas vezes.
  const recarregando = useRef(false);

  const recarregarNaVolta = useCallback(async () => {
    if (recarregando.current) return;
    recarregando.current = true;
    setAtualizacao("atualizando");
    const deuCerto = await carregar(true);
    recarregando.current = false;
    // Desmontado no meio (o dono saiu do Console enquanto atualizava): não há
    // mais faixa para pintar.
    if (!montado.current) return;
    setAtualizacao(deuCerto ? "atualizado" : "falhou");
  }, [carregar]);

  // Só na TRANSIÇÃO de offline para online. O ref nasce com o valor da
  // montagem, então abrir o Console já online não conta como volta — a
  // primeira carga é a do `useEffect` do `carregar`, e só ela.
  const estavaOnline = useRef(online);
  useEffect(() => {
    const antes = estavaOnline.current;
    estavaOnline.current = online;
    if (online && antes === false) recarregarNaVolta();
  }, [online, recarregarNaVolta]);

  // "Atualizado" é recado, não estado: some sozinho depois de o dono ter tempo
  // de ler. "Falhou" fica, porque ali existe uma ação para ele tomar.
  useEffect(() => {
    if (atualizacao !== "atualizado") return undefined;
    const relogio = setTimeout(() => setAtualizacao(null), 4000);
    return () => clearTimeout(relogio);
  }, [atualizacao]);

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

  // Recorte por plano — entra entre a situação e a busca: "vendo os que
  // precisam de atenção, no Básico, procurando o Fulano" é a frase que o dono
  // monta clicando, na mesma ordem em que os cortes agem.
  const tenantsDoPlano = useMemo(
    () => filtrarPorPlano(tenantsDoFiltro, filtroPlano),
    [tenantsDoFiltro, filtroPlano]
  );

  // Busca por nome — a lista vem inteira do banco, então filtrar é local e
  // instantâneo (nenhuma consulta nova). Filtrar não reordena: o resultado
  // continua com quem precisa de ação no topo.
  const tenantsVisiveis = useMemo(
    () => filtrarEstabelecimentos(tenantsDoPlano, busca),
    [tenantsDoPlano, busca]
  );

  // CONSOLE-UX 14 — a lista sai por partes. Renderizar todos os tenants de uma
  // vez é o único ponto do Console que piora conforme a venda dá certo: cada
  // card tem cinco botões e um selo, e a base cresce para sempre.
  //
  // O corte é só de RENDERIZAÇÃO: a leitura do banco, a ordem por urgência, os
  // três recortes, a busca e as contagens continuam sobre a base inteira. Se a
  // consulta é que fosse paginada, todo contador da tela passaria a mentir.
  // Como quem precisa de ação já sobe para o topo, o primeiro bloco é
  // justamente o que o dono veio ver.
  const [quantidade, setQuantidade] = useState(BLOCO_LISTA);

  // Recorte novo, busca nova ou lista recarregada começam do primeiro bloco: a
  // ordem mudou, então "continuar de onde parou" não quer dizer nada aqui.
  useEffect(() => {
    setQuantidade(BLOCO_LISTA);
  }, [filtroSituacao, filtroPlano, busca, tenants]);

  const tenantsNaTela = useMemo(
    () => tenantsVisiveis.slice(0, quantidade),
    [tenantsVisiveis, quantidade]
  );
  const restantes = tenantsVisiveis.length - tenantsNaTela.length;

  // Contagem de cada atalho: sempre sobre a base inteira, não sobre o que a
  // busca deixou na tela — o número no atalho precisa dizer quantos EXISTEM
  // naquele recorte, senão clicar nele mostraria mais do que o botão prometia.
  const contagens = useMemo(() => {
    const atencao = tenantsOrdenados.filter((t) => idsPrecisamAtencao.has(t.id)).length;
    return { todos: tenantsOrdenados.length, atencao, em_dia: tenantsOrdenados.length - atencao };
  }, [tenantsOrdenados, idsPrecisamAtencao]);

  // Contagem por plano, pela mesma régua: sobre a base inteira, não sobre o
  // que a situação ou a busca deixaram na tela.
  const contagensPlano = useMemo(() => contarPorPlano(tenantsOrdenados), [tenantsOrdenados]);

  // Com um plano só no catálogo o recorte não recorta nada — seria uma linha
  // de botões que não muda a lista.
  const mostrarAtalhosPlano = !erroPlanos && planos.length > 1;

  // Como a tela NOMEIA o que está filtrando, na ordem em que os cortes agem.
  // Com um corte só, a frase é a de sempre — o vazio de situação não mudou de
  // texto por causa do plano.
  const descricaoRecorte = [
    filtroSituacao !== "todos" ? ROTULOS_FILTRO[filtroSituacao] : null,
    filtroPlano !== "todos" ? rotularPlano(planos, filtroPlano) : null,
  ]
    .filter(Boolean)
    .join(" e ");
  const temRecorte = descricaoRecorte !== "";

  // Uma volta só: o botão do vazio limpa os dois recortes de uma vez. Deixar
  // o dono clicar duas vezes para reaparecer a lista é o tipo de beco que o
  // Princípio nº1 pede para não existir.
  // Cartão de primeiro acesso (CONSOLE-UX 11 e 18). O endereço sai da mesma
  // função pura que o card da lista usa, e não mais do `window.location`
  // cru: sem domínio raiz configurado ela devolve a própria origem do
  // navegador (a porta por onde o dono acabou de entrar, comportamento de
  // hoje), e com domínio raiz ligado devolve o subdomínio DAQUELE
  // estabelecimento. Cru, o cartão entregaria o endereço do Console ao
  // cliente no dia em que os dois deixassem de ser o mesmo lugar.
  //
  // Endereço que não dá para afirmar (slug ausente ou fora do formato) vira
  // `null`, e aí a linha some — Princípio nº1: prevenir o erro em vez de
  // mostrar um endereço errado com cara de certo.
  const enderecoDeEntrada = urlDeAcessoDoTenant(sucesso?.slug) ?? "";
  const enderecoDoCardapio = urlDoCardapioPublico(sucesso?.slug);
  const planoDoAcesso = sucesso?.plano_codigo ? rotularPlano(planos, sucesso.plano_codigo) : "";
  const usuarioDoAcesso = sucesso?.admin?.username ?? "";
  const mensagemDeAcesso = montarMensagemPrimeiroAcesso({
    estabelecimento: sucesso?.nome,
    plano: planoDoAcesso,
    endereco: enderecoDeEntrada,
    usuario: usuarioDoAcesso,
  });
  const copiarAcesso = async () => {
    try {
      await navigator.clipboard.writeText(mensagemDeAcesso);
      setCopiaFalhou(false);
      setCopiado(true);
    } catch {
      // Sem área de transferência (contexto não seguro, permissão negada): a
      // tela mostra a mensagem para copiar à mão em vez de fingir que copiou.
      setCopiado(false);
      setCopiaFalhou(true);
    }
  };

  // Copiar o acesso de um estabelecimento QUE JÁ EXISTE (CONSOLE-UX 16) —
  // o cartão acima só aparece no minuto seguinte à criação, e o cliente
  // pergunta "onde eu entro?" semanas depois.
  //
  // Sem usuário e sem senha: o usuário do responsável mora em `public.users`,
  // fora do alcance do super-admin na RLS, e senha não circula por área de
  // transferência. Nome, plano e porta de entrada são o que dá para afirmar —
  // e é o que a pergunta pede.
  const copiarAcessoDoTenant = async (tenantId, mensagem) => {
    try {
      await navigator.clipboard.writeText(mensagem);
      setAcessoFalhouId(null);
      setAcessoCopiadoId(tenantId);
    } catch {
      // Mesma regra do cartão de criação: nada de fingir que copiou.
      setAcessoCopiadoId(null);
      setAcessoFalhouId(tenantId);
    }
  };

  const limparRecortes = () => {
    setSearchParams(
      (atual) => {
        const proximo = new URLSearchParams(atual);
        proximo.delete("situacao");
        proximo.delete("plano");
        return proximo;
      },
      { replace: true }
    );
  };

  // Conta só quem está NA TELA: durante uma busca, anunciar pendências que o
  // filtro escondeu mandaria o dono procurar um card que não está ali.
  const quantosPrecisamAtencao = useMemo(
    () => tenantsVisiveis.filter((t) => idsPrecisamAtencao.has(t.id)).length,
    [tenantsVisiveis, idsPrecisamAtencao]
  );

  return {
    tenants, setTenants, planos, setPlanos, assinaturas, setAssinaturas, carregando,
    setCarregando, erro, setErro, erroPlanos, setErroPlanos, erroAssinaturas, setErroAssinaturas,
    erroAddons, setErroAddons, searchParams, setSearchParams, atualizacao, setAtualizacao,
    quantidade, setQuantidade, currentUser, logout, modalAberto, setModalAberto, solicitacoes,
    setSolicitacoes, erroSolicitacoes, setErroSolicitacoes, solicitacaoAprovando,
    setSolicitacaoAprovando, tenantSelecionado, setTenantSelecionado, tenantLayoutSelecionado,
    setTenantLayoutSelecionado, tenantAddonsSelecionado, setTenantAddonsSelecionado,
    linhaRenovacao, setLinhaRenovacao, linhaHistorico, setLinhaHistorico, linhaMensalidade,
    setLinhaMensalidade, addonsPorTenant, setAddonsPorTenant, addonsMudaram, setAddonsMudaram,
    sucesso, setSucesso, copiado, setCopiado, copiaFalhou, setCopiaFalhou, acessoCopiadoId,
    setAcessoCopiadoId, acessoFalhouId, setAcessoFalhouId, busca, setBusca, situacaoPorTenant,
    tenantsOrdenados, idsPrecisamAtencao, filtroSituacao, escolherFiltro, aba, escolherAba, dias,
    escolherPeriodo, filtroPlano, escolherPlano, montado, carregar, aoCriar,
    aoAprovarSolicitacao, aoRecusarSolicitacao, aoAlterarPlano, aoPlanoAlterado, aoAlterarLayout,
    aoLayoutAlterado, aoAbrirAddons, aoAddonAlterado, aoFecharAddons, aoRegistrarPagamento,
    aoPagamentoConfirmado, aoVerPagamentos, aoDefinirMensalidade, aoMensalidadeDefinida,
    pendentesDeConta, semPlanos, online, motivoOffline, recarregando, recarregarNaVolta,
    estavaOnline, tenantsDoFiltro, tenantsDoPlano, tenantsVisiveis, tenantsNaTela, restantes,
    contagens, contagensPlano, mostrarAtalhosPlano, descricaoRecorte, temRecorte,
    enderecoDeEntrada, enderecoDoCardapio, planoDoAcesso, usuarioDoAcesso, mensagemDeAcesso,
    copiarAcesso, copiarAcessoDoTenant, limparRecortes, quantosPrecisamAtencao,
  };
}
