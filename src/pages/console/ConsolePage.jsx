import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LuPlus, LuStore, LuLogOut, LuTriangleAlert, LuCircleCheck, LuLoaderCircle, LuBuilding2,
  LuPalette, LuChartColumn, LuActivity, LuPuzzle, LuSearch, LuBanknote, LuReceipt, LuFilter,
  LuCopy, LuTag, LuExternalLink, LuWifiOff, LuPencil, LuShieldCheck,
} from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { useStatusRede } from "@/hooks/useStatusRede";
import {
  listarEstabelecimentos, listarPlanos, listarAssinaturas,
  listarAddonsPorTenant, contarAddonsPorTenant, resumirPlataforma, ordenarPorUrgencia,
  filtrarEstabelecimentos, filtrarPorSituacao, FILTROS_SITUACAO, normalizarFiltroSituacao,
  normalizarAba, ABAS_CONSOLE, normalizarPeriodo, PERIODO_PADRAO,
  filtrarPorPlano, normalizarFiltroPlano, contarPorPlano, montarMensagemPrimeiroAcesso,
} from "@/lib/console/console";
import { formatarReais } from "@/lib/delivery/deliveryPedidos";
import { urlDoCardapioPublico, urlDeAcessoDoTenant } from "@/lib/host/tenantSlug";
import { LAYOUTS, layoutDoTema } from "@/layouts";
import NovoEstabelecimentoModal from "@/components/console/modais/NovoEstabelecimentoModal";
import AlterarPlanoModal from "@/components/console/modais/AlterarPlanoModal";
import AlterarLayoutModal from "@/components/console/modais/AlterarLayoutModal";
import AddonsModal from "@/components/console/modais/AddonsModal";
import PlanosDashboard from "@/components/console/paineis/PlanosDashboard";
import AnalyticsDashboard from "@/components/console/paineis/AnalyticsDashboard";
import SeloStatus from "@/components/console/SeloStatus";
import ConfirmarRenovacaoModal from "@/components/console/modais/ConfirmarRenovacaoModal";
import HistoricoPagamentosModal from "@/components/console/modais/HistoricoPagamentosModal";
import DefinirMensalidadeModal from "@/components/console/modais/DefinirMensalidadeModal";
import RenomearEstabelecimentoModal from "@/components/console/modais/RenomearEstabelecimentoModal";
import DadosDoClienteModal from "@/components/console/modais/DadosDoClienteModal";
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

/**
 * Quantos estabelecimentos a lista mostra por vez (CONSOLE-UX 14). Vinte cabe
 * em duas ou três rolagens e já passa da conta de quem precisa de atenção num
 * dia normal — quem quiser o resto pede.
 */
const BLOCO_LISTA = 20;

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
  const [modalAberto, setModalAberto] = useState(false);
  const [tenantSelecionado, setTenantSelecionado] = useState(null);
  const [tenantLayoutSelecionado, setTenantLayoutSelecionado] = useState(null);
  const [tenantAddonsSelecionado, setTenantAddonsSelecionado] = useState(null);
  // Estabelecimento cujo NOME está sendo corrigido (pré-venda §1.8). Guarda o
  // tenant (e não a linha de cobrança) porque quem é renomeado é o cadastro:
  // o modal precisa de `id`, `nome` e `slug`, e a linha do resumo não os tem.
  const [tenantRenomear, setTenantRenomear] = useState(null);
  // Estabelecimento cujos DADOS estão sendo exportados ou apagados a pedido
  // dele (pré-venda §1.5, LGPD art. 18). Guarda o tenant, como o de renomear:
  // o modal precisa de `id` para chamar as RPCs, de `nome` para o título e de
  // `slug` porque é o slug que se digita para confirmar o apagamento.
  const [tenantDados, setTenantDados] = useState(null);
  // Linha de cobrança (do `resumirPlataforma`) que está sendo renovada pelo
  // card. Guarda a LINHA, não o tenant, porque é o que o modal de renovação
  // já sabe consumir na outra aba.
  const [linhaRenovacao, setLinhaRenovacao] = useState(null);
  // Linha cujo histórico de pagamentos está aberto. Mesmo formato do
  // `linhaRenovacao` — os dois modais consomem a linha do `resumirPlataforma`.
  const [linhaHistorico, setLinhaHistorico] = useState(null);
  // Linha cujo preço está sendo definido pelo card (CONSOLE-UX 13). Mesmo
  // formato dos outros dois — os três modais consomem a linha do resumo.
  const [linhaMensalidade, setLinhaMensalidade] = useState(null);
  const [addonsPorTenant, setAddonsPorTenant] = useState({});
  const [addonsMudaram, setAddonsMudaram] = useState(false);
  const [sucesso, setSucesso] = useState(null);
  // Estado do botão "Copiar dados de acesso" do cartão de primeiro acesso.
  // `copiaFalhou` existe porque engolir a falha seria pior do que não ter o
  // botão: o dono acharia que copiou e mandaria uma mensagem vazia.
  const [copiado, setCopiado] = useState(false);
  const [copiaFalhou, setCopiaFalhou] = useState(false);
  // O mesmo par, agora por CARD da lista (CONSOLE-UX 16): guarda o id do
  // estabelecimento cujo acesso acabou de ser copiado — e não um booleano —
  // porque com um booleano todos os cards diriam "Copiado!" ao mesmo tempo.
  const [acessoCopiadoId, setAcessoCopiadoId] = useState(null);
  const [acessoFalhouId, setAcessoFalhouId] = useState(null);
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
    ] = await Promise.all([
      listarEstabelecimentos(),
      listarPlanos(),
      listarAssinaturas(),
      listarAddonsPorTenant(),
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
    // Só apaga o "carregando…" quem o acendeu: na recarga silenciosa ele nunca
    // subiu, e mexer nele aqui desligaria por engano a primeira carga que
    // ainda estivesse em voo.
    if (!silencioso) setCarregando(false);
    return true;
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const aoCriar = (data) => {
    setModalAberto(false);
    setCopiado(false);
    setCopiaFalhou(false);
    // `criado: true` distingue a criação das outras confirmações (plano,
    // layout, pagamento, add-ons): só ela abre o cartão de primeiro acesso,
    // as demais continuam na faixa de uma linha.
    setSucesso({ ...data, criado: true });
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

  // Pré-venda §1.8 — corrigir o nome digitado errado no cadastro, sem SQL.
  // Quem grava é a RPC `renomear_tenant` (20260919); aqui só abrimos o modal
  // com o estabelecimento certo.
  const aoRenomear = (tenant) => {
    setSucesso(null);
    setTenantRenomear(tenant);
  };

  const aoRenomeado = (tenant) => {
    setTenantRenomear(null);
    setSucesso({ nome: tenant?.nome, nomeAlterado: true });
    carregar();
  };

  // Pré-venda §1.5 — atender por aqui o cliente que pede uma cópia dos dados
  // dele ou pede que sejam apagados. Quem lê e quem apaga são as RPCs
  // `exportar_dados_estabelecimento` e `apagar_dados_estabelecimento`
  // (20260922); aqui só abrimos o modal com o estabelecimento certo.
  const aoAbrirDados = (tenant) => {
    setSucesso(null);
    setTenantDados(tenant);
  };

  // Depois de apagar, o estabelecimento não existe mais: fechar o modal e
  // recarregar é o que tira o card da lista — deixá-lo na tela faria o dono
  // clicar num cadastro que já não está lá.
  const aoApagado = (resumo) => {
    const nome = tenantDados?.nome;
    setTenantDados(null);
    setSucesso({ nome, dadosApagados: Number(resumo?.total_de_linhas ?? 0) });
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
  const semPlanos = planos.length === 0;

  // Sem internet o Console vira só leitura (CONSOLE-UX 26): a lista que já
  // carregou, os filtros e os painéis continuam de pé, mas o que salva fica
  // travado com o motivo à vista — mesma escolha do `semPlanos` acima, pelo
  // mesmo motivo. O aviso de rede nos modais é a segunda linha de defesa,
  // para a conexão que cai depois de o formulário abrir.
  const online = useStatusRede();
  const motivoOffline = online
    ? undefined
    : "Sem conexão com a internet — reconecte para alterar";

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

  return (
    <div className="console">
      {/* Barra superior e faixa de rede grudam juntas no topo: o aviso de
          sem conexão precisa continuar à vista com a lista rolada. */}
      <div className="console__topo-fixo">
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

        {/* Faixa de sem conexão (CONSOLE-UX 26). Fica colada no topo, antes das
            abas, porque o dono precisa saber ANTES de tentar — e diz o que ainda
            dá para fazer, não só o que quebrou. `role="status"` para o leitor de
            tela anunciar sem interromper o que ele estava lendo. */}
        {/* Estar offline manda na faixa (CONSOLE-UX 27): se a conexão voltou e
            caiu de novo no meio da recarga, o que o dono precisa ler é que está
            sem internet — não um "atualizado" de uma busca que não terminou. */}
        {!online ? (
          <div className="console__offline" role="status">
            <LuWifiOff size={18} aria-hidden />
            <span>
              <strong>Sem conexão com a internet.</strong> Dá para ver o que já
              carregou, mas os números podem estar desatualizados; para criar ou
              alterar, reconecte.
            </span>
          </div>
        ) : atualizacao === "atualizando" ? (
          <div className="console__offline console__offline--voltou" role="status">
            <LuLoaderCircle size={18} className="console__spin" aria-hidden />
            <span>
              <strong>Conexão de volta.</strong> Atualizando os dados da tela…
            </span>
          </div>
        ) : atualizacao === "atualizado" ? (
          <div className="console__offline console__offline--voltou" role="status">
            <LuCircleCheck size={18} aria-hidden />
            <span>
              <strong>Dados atualizados.</strong> O que está na tela é o de agora.
            </span>
          </div>
        ) : atualizacao === "falhou" ? (
          <div className="console__offline console__offline--falhou" role="status">
            <LuTriangleAlert size={18} aria-hidden />
            <span>
              <strong>Não foi possível atualizar os dados.</strong> O que está na
              tela é de antes da queda da conexão.
            </span>
            <button
              type="button"
              className="console__offline-acao"
              onClick={recarregarNaVolta}
            >
              Tentar de novo
            </button>
          </div>
        ) : null}
      </div>

      <main className="console__conteudo">
        {/* Abas: gestão da base (estabelecimentos), quem paga (planos +
            assinaturas) e quem usa (uso e faturamento). Sempre visíveis —
            trocar de aba é a navegação principal do Console (Princípio nº1). */}
        <nav className="console__abas" aria-label="Seções do console">
          <button
            type="button"
            className={`console__aba${aba === "estabelecimentos" ? " console__aba--ativa" : ""}`}
            onClick={() => escolherAba("estabelecimentos")}
          >
            <LuBuilding2 size={16} aria-hidden /> Estabelecimentos
          </button>
          <button
            type="button"
            className={`console__aba${aba === "planos" ? " console__aba--ativa" : ""}`}
            onClick={() => escolherAba("planos")}
          >
            <LuChartColumn size={16} aria-hidden /> Planos e assinaturas
          </button>
          <button
            type="button"
            className={`console__aba${aba === "uso" ? " console__aba--ativa" : ""}`}
            onClick={() => escolherAba("uso")}
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
            {/* `() => carregar()` e não `carregar`: o handler receberia o evento
                do clique como primeiro argumento, e o primeiro argumento agora é
                o modo silencioso (CONSOLE-UX 27) — o evento é objeto, logo
                verdadeiro, e a recarga pedida pelo dono não acenderia o
                "carregando…" que ele está esperando ver. */}
            <button className="console__novo" onClick={() => carregar()}>Tentar de novo</button>
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
            <button className="console__novo" onClick={() => carregar()}>Tentar de novo</button>
          </div>
        ) : aba === "uso" ? (
          // A leitura do uso é da própria aba (RPC `analytics_plataforma`):
          // nada é pedido ao banco enquanto ninguém abrir "Uso e
          // faturamento", então uma base sem a 20260912 aplicada continua
          // com o resto do Console funcionando igual.
          <AnalyticsDashboard
            tenants={tenants}
            assinaturas={assinaturas}
            dias={dias}
            aoTrocarPeriodo={escolherPeriodo}
          />
        ) : aba === "planos" ? (
          <PlanosDashboard
            tenants={tenants}
            planos={planos}
            assinaturas={assinaturas}
            // Quem deu baixa no pagamento fica gravado em
            // `assinaturas_pagamentos.confirmado_por` — o histórico precisa
            // dizer quem confirmou, não só que alguém confirmou.
            confirmadoPor={currentUser?.name ?? null}
            onAtualizado={() => carregar()}
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
                      Entregue estes dados ao responsável — é com eles que ele entra no sistema.
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
                  {sucesso.nomeAlterado ? (
                    <>Estabelecimento renomeado para <strong>{sucesso.nome}</strong>.</>
                  ) : sucesso.dadosApagados !== undefined ? (
                    <>Dados de <strong>{sucesso.nome}</strong> apagados —{" "}
                    <strong>{sucesso.dadosApagados}</strong> registros. O acesso da equipe dele
                    também foi removido.</>
                  ) : sucesso.planoAlterado ? (
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
                    {/* Corrigir o nome errado digitado no cadastro. Fica ao
                        lado da paleta e da peça porque, como elas, é ajuste do
                        cadastro — e não da cobrança, que tem seus botões
                        acima. O lápis é o ícone de "editar este texto" e não
                        repete nenhum vizinho do card. */}
                    <button
                      type="button"
                      className="console__renomear"
                      onClick={() => aoRenomear(t)}
                      disabled={!online}
                      aria-label={`Renomear ${t.nome}`}
                      title={motivoOffline ?? "Corrigir o nome deste estabelecimento"}
                    >
                      <LuPencil size={17} aria-hidden />
                      <span className="console__renomear-nome">Renomear</span>
                    </button>
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
                    {/* Exportar/apagar os dados a pedido do cliente (LGPD).
                        É o último da fila de propósito: das ações do card, é
                        a única que pode acabar em algo sem volta, e nada
                        deve levar a mão até ela por engano. O escudo diz
                        "proteção de dados" e não repete nenhum vizinho. */}
                    <button
                      type="button"
                      className="console__lgpd"
                      onClick={() => aoAbrirDados(t)}
                      disabled={!online}
                      aria-label={`Dados de ${t.nome}`}
                      title={motivoOffline ?? "Exportar ou apagar os dados deste estabelecimento"}
                    >
                      <LuShieldCheck size={17} aria-hidden />
                      <span className="console__lgpd-nome">Dados</span>
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
        )}
      </main>

      {modalAberto && (
        <NovoEstabelecimentoModal
          planos={planos}
          // Os endereços já ocupados (CONSOLE-UX 19). Sem consulta nova: a
          // lista de estabelecimentos já traz o `slug` de cada um, e o modal
          // só precisa saber quais nomes não estão livres.
          slugsEmUso={tenants.map((t) => t.slug).filter(Boolean)}
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

      {linhaMensalidade && (
        <DefinirMensalidadeModal
          linha={linhaMensalidade}
          onFechar={() => setLinhaMensalidade(null)}
          onDefinido={aoMensalidadeDefinida}
        />
      )}

      {tenantRenomear && (
        <RenomearEstabelecimentoModal
          tenant={tenantRenomear}
          onFechar={() => setTenantRenomear(null)}
          onRenomeado={aoRenomeado}
        />
      )}

      {tenantDados && (
        <DadosDoClienteModal
          tenant={tenantDados}
          onFechar={() => setTenantDados(null)}
          onApagado={aoApagado}
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
