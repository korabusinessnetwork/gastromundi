/**
 * MobilePage — o /palm do garçom, reconstruído sobre o design mobile
 * (telas 1a–1h). Este arquivo é o SHELL: guarda todo o estado e as regras
 * de negócio (que vêm intactas da versão anterior) e apenas orquestra os
 * componentes puramente apresentacionais em `src/pages/mobile/`.
 *
 * Navegação por abas fixas na base (Pedido · Comandas · Painel · Mais),
 * no lugar do antigo `mode` de três telas. Toda a lógica de lançamento,
 * espera, trava de comanda e guardas de caixa/offline foi preservada.
 *
 * Intuitividade (princípio nº 1): as quatro ações do garçom viram quatro
 * abas sempre visíveis com o polegar; nada fica escondido atrás de menu.
 * O caminho feliz — escolher itens, lançar na comanda — continua em poucos
 * toques, agora com teclado numérico grande e carrinho em folha inferior.
 */
import { LuWifiOff } from "react-icons/lu";

import { logAction } from "@/lib/logger";
import { marcaDoCabecalho } from "@/lib/tema";
import { lerBrandingCache } from "@/lib/brandingCache";
import {
  totalLancamentosGarcom, radarOportunidades
} from "@/lib/painelGarcom";
import {
  removerEspera, totalEspera, resumoEsperas
} from "@/lib/pedidosEmEspera";
import { nomeTrava } from "@/lib/comandaLock";
import { cancelarItemComanda, totalItensAtivos } from "@/lib/comandaItens";

import { fmtComanda, fmtDinheiro } from "@/pages/mobile/fmt";
import { BottomNav, Guarda, Toast } from "@/pages/mobile/chrome";
import PedidoTab from "@/pages/mobile/tabs/pedido/PedidoTab";
import ComandasTab from "@/pages/mobile/tabs/comandas/ComandasTab";
import PainelTab from "@/pages/mobile/tabs/painel/PainelTab";
import MaisTab from "@/pages/mobile/tabs/mais/MaisTab";
import CarrinhoSheet from "@/pages/mobile/sheets/lancamento/CarrinhoSheet";
import LancarSheet from "@/pages/mobile/sheets/lancamento/LancarSheet";
import EsperasSheet from "@/pages/mobile/sheets/comanda/EsperasSheet";
import DetalheComandaSheet from "@/pages/mobile/sheets/comanda/DetalheComandaSheet";
import { temTelaMobile } from "@/pages/mobile/modulos/registro";

import TelaModulo from "./mobile/pagina/TelaModulo";
import { TOTAL_COMANDAS, PAGE, MODULOS_MAIS, formatHoraCurta } from "./mobile/pagina/apoio";
import { useMobilePage } from "@/pages/mobile/hooks/useMobilePage";
import "./MobilePage.css";
import { ticketMedio } from "@/features/caixa/regras/vendas";
import { nomeBateComBusca } from "@/lib/busca";

export default function MobilePage() {
  const tela = useMobilePage();
  const {
    aba, setAba, moduloAberto, setModuloAberto, cartItems, setCartItems, salvando, limite, setLimite, catAtiva, setCatAtiva, cartAberto, setCartAberto, toast, setToast, buscaGrid, setBuscaGrid, buscaItens, setBuscaItens, esperas, setEsperas, showEsperas, setShowEsperas, detalheComanda, detalheVisible, currentUser, bootstrapLoading, logout, moduloHabilitado, tenant, redeOnline, ponteEndereco, products, categoriaGrupoMap, updatePending, lancadas, caixaAberto, sales, sessaoAbertaEm, showLancar, setShowLancar, lancComanda, setLancComanda, lancMesa, setLancMesa, lancApelido, setLancApelido, lancErro, setLancErro, bloqueio, navigate, abrirDetalhe, fecharDetalhe, abertas, mapa, emUsoPorOutro, categorias, filtrados, total, qtdTotal, handleAddProduct, handleChangeQty, abrirModalLancar, selecionarComanda, handleLancar, porEmEspera, enviarEsperas,
  } = tela;

  // ── Guardas de tela cheia ─────────────────────────────────────
  if (bootstrapLoading) {
    return <Guarda tipo="loading" />;
  }
  if (!caixaAberto) {
    return <Guarda tipo="caixaFechado" onAcao={() => window.location.reload()} />;
  }

  // ── Adaptadores de dados para as abas ─────────────────────────

  // Barra de esperas (compartilhada por Pedido e Comandas).
  const resumo = resumoEsperas(esperas);
  const barraEsperas = esperas.length
    ? { qtd: resumo.pedidos, total: resumo.total, onClick: () => setShowEsperas(true) }
    : null;

  // (a) PedidoTab
  const qItens = buscaItens.trim().toLowerCase();
  const produtosFiltrados = qItens
    ? filtrados.filter((p) => nomeBateComBusca(p.name, qItens))
    : filtrados;
  const qtdPorId = cartItems.reduce((acc, i) => {
    acc[i.id] = i.qty;
    return acc;
  }, {});

  // (b) ComandasTab
  const estadoDaOrder = (order) => {
    if (!order) return "vazia";
    if (lancadas.has(order.id)) return "lancada";
    const itens = Array.isArray(order.items) ? order.items : [];
    const qtd = itens.reduce((s, it) => s + (it.qty || 1), 0);
    return qtd > 0 ? "comItens" : "vazia";
  };
  const qGrid = buscaGrid.trim().toLowerCase();
  const resultadosGrid = qGrid
    ? abertas.filter((o) => {
        const nome = String(o.comanda).toLowerCase();
        return (
          nome.includes(qGrid) ||
          fmtComanda(o.comanda).toLowerCase().includes(qGrid) ||
          (o.garcom ?? "").toLowerCase().includes(qGrid)
        );
      })
    : null;
  const comandasGrade =
    resultadosGrid !== null
      ? resultadosGrid.map((order) => ({
          numero: order.comanda,
          estado: estadoDaOrder(order),
          emUso: emUsoPorOutro(order),
          nomeTrava: nomeTrava(order),
          total: order.total ?? 0,
          onClick: () => selecionarComanda(order.comanda, order.mesa, order.apelido),
        }))
      : Array.from({ length: limite }, (_, i) => i + 1).map((num) => {
          const order = mapa[String(num)];
          return {
            numero: num,
            estado: estadoDaOrder(order),
            emUso: order ? emUsoPorOutro(order) : false,
            nomeTrava: order ? nomeTrava(order) : "",
            total: order?.total ?? 0,
            onClick: () => selecionarComanda(num, order?.mesa, order?.apelido),
          };
        });
  const temMais = resultadosGrid === null && limite < TOTAL_COMANDAS;

  // (c) PainelTab
  const comandasEVendas = [
    ...abertas,
    ...(Array.isArray(sales) ? sales : []),
  ];
  const meu = totalLancamentosGarcom(comandasEVendas, {
    nome: currentUser?.name,
    username: currentUser?.username,
    desde: sessaoAbertaEm,
  });
  const ticketMedioDoGarcom = ticketMedio(meu.total, meu.comandas);
  const oportunidades = radarOportunidades(
    abertas,
    categoriaGrupoMap,
    products
  ).map((card) => ({
    ...card,
    onClick: () => {
      const o = mapa[String(card.comanda)];
      if (o) abrirDetalhe(o);
    },
  }));

  // (d) MaisTab
  // Mesma marca da sidebar do desktop: enquanto o bootstrap do tenant não
  // responde, o cache de marca desta origem evita o "KORA" piscando por
  // segundos logo depois de o login já ter mostrado o estabelecimento.
  const tenantNome = marcaDoCabecalho(tenant, lerBrandingCache()).nome;
  const usuarioIniciais =
    (currentUser?.name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("") || "?";
  const caixaInfo = {
    aberto: caixaAberto,
    desde: formatHoraCurta(sessaoAbertaEm),
    operador: undefined,
  };
  // Configurações segue a mesma regra dos módulos: só aparece para quem tem a
  // permissão. Sem ela, o botão some (prevenção > erro) — antes ele aparecia
  // sempre e a rota expulsava o usuário sem permissão.
  const podeConfiguracoes = !!currentUser?.permissions?.configuracoes;
  const modulosMais = MODULOS_MAIS.filter(
    (m) =>
      currentUser?.permissions?.[m.perm] &&
      (!m.modulo || moduloHabilitado(m.modulo))
  ).map((m) => {
    // Tela nativa abre dentro do Palm; sem tela nativa, cai na rota de
    // desktop e o cartão avisa. O aviso é derivado, nunca fixo — assim ele
    // some sozinho no dia em que a tela do módulo nascer.
    const nativa = temTelaMobile(m.chave);
    return {
      chave: m.chave,
      rotulo: m.rotulo,
      descricao: m.descricao,
      icone: m.icone,
      habilitado: true,
      melhorNoComputador: !nativa,
      onClick: () => (nativa ? setModuloAberto(m.chave) : navigate(m.rota)),
    };
  });

  // (e) EsperasSheet
  const esperasAdaptadas = esperas.map((esp) => ({
    id: esp.comanda,
    nome: esp.comanda,
    itensTexto: (Array.isArray(esp.items) ? esp.items : [])
      .map((it) => `${it.qty ?? 1}× ${it.name}`)
      .join(", "),
    total: totalEspera(esp),
    erro: esp.erro,
  }));
  const resumoEsperasTexto = `${resumo.pedidos} pedido(s) · ${resumo.itens} item(ns) · ${fmtDinheiro(
    resumo.total
  )}`;

  // ── Wiring das sheets de lançamento ───────────────────────────
  const nomeLanc = lancComanda.trim();
  const existeLanc = mapa[nomeLanc];
  const textoConfirmarLancar =
    cartItems.length === 0
      ? existeLanc
        ? "Abrir Comanda"
        : "Criar Comanda"
      : esperas.length > 0
      ? `Revisar e lançar todos (${esperas.length + 1})`
      : existeLanc
      ? "Adicionar à Comanda"
      : "Criar e Lançar";

  const orderDetalhe = detalheComanda
    ? mapa[String(detalheComanda.comanda)] ?? detalheComanda
    : null;

  return (
    <div className="mobile-page">
      {/* ── Sem internet + ponte configurada → oferece o modo local.
          Pill não-bloqueante: um toque leva à página servida pela ponte
          no Wi-Fi do caixa, onde o pedido continua saindo na impressora.
          Só aparece quando faz sentido (prevenção > erro). ── */}
      {redeOnline === false && ponteEndereco ? (
        <button
          type="button"
          className="mobile-page__offline-pill"
          onClick={() => {
            window.location.href = ponteEndereco;
          }}
        >
          <LuWifiOff aria-hidden="true" />
          <span>Sem internet, lançar pelo Wi-Fi do caixa</span>
        </button>
      ) : null}

      <div className="mobile-page__conteudo">
        {aba === "pedido" && (
          <PedidoTab
            usuarioNome={currentUser?.name?.split(" ")[0]}
            onLogout={logout}
            categorias={categorias}
            catAtiva={catAtiva}
            onCategoria={setCatAtiva}
            busca={buscaItens}
            onBusca={setBuscaItens}
            produtos={produtosFiltrados}
            qtdPorId={qtdPorId}
            onAddProduto={handleAddProduct}
            carrinhoQtd={qtdTotal}
            carrinhoTotal={total}
            onAbrirCarrinho={() => setCartAberto(true)}
            barraEsperas={barraEsperas}
          />
        )}

        {aba === "comandas" && (
          <ComandasTab
            busca={buscaGrid}
            onBusca={setBuscaGrid}
            onVoltar={() => setAba("pedido")}
            comandas={comandasGrade}
            temMais={temMais}
            limite={limite}
            total={TOTAL_COMANDAS}
            onVerMais={() =>
              setLimite((l) => Math.min(l + PAGE, TOTAL_COMANDAS))
            }
            barraEsperas={barraEsperas}
          />
        )}

        {aba === "painel" && (
          <PainelTab
            meu={meu}
            ticketMedio={ticketMedioDoGarcom}
            oportunidades={oportunidades}
          />
        )}

        {aba === "mais" &&
          (moduloAberto ? (
            <TelaModulo
              chave={moduloAberto}
              onVoltar={() => setModuloAberto(null)}
            />
          ) : (
            <MaisTab
              tenantNome={tenantNome}
              usuarioNome={currentUser?.name}
              usuarioIniciais={usuarioIniciais}
              caixa={caixaInfo}
              modulos={modulosMais}
              // Configurações tem tela nativa como qualquer outro módulo: a
              // engrenagem abre dentro do Palm, não joga mais o celular na
              // tela de computador.
              onConfiguracoes={
                podeConfiguracoes ? () => setModuloAberto("configuracoes") : undefined
              }
            />
          ))}
      </div>

      <BottomNav
        ativa={aba}
        // Trocar de aba fecha o módulo aberto: as abas continuam sendo o
        // caminho de volta ao trabalho do garçom, nunca ficam "presas"
        // atrás de uma tela de módulo.
        onNavegar={(destino) => {
          setModuloAberto(null);
          setAba(destino);
        }}
        comandasBadge={abertas.length}
      />

      {/* ── Sheets (fixas, sobrepõem tudo) ── */}
      <CarrinhoSheet
        aberto={cartAberto}
        itens={cartItems}
        onFechar={() => setCartAberto(false)}
        onQtd={handleChangeQty}
        onLimpar={() => {
          setCartItems([]);
          setCartAberto(false);
          setLancComanda("");
          setLancMesa("");
          setLancApelido("");
        }}
        onLancar={() => {
          setCartAberto(false);
          abrirModalLancar();
        }}
        total={total}
        podeConfirmar={cartItems.length > 0}
        textoConfirmar="Lançar pedido"
      />

      <LancarSheet
        aberto={showLancar}
        titulo={cartItems.length === 0 ? "Abrir Comanda" : "Lançar Pedido"}
        comanda={lancComanda}
        mesa={lancMesa}
        nome={lancApelido}
        onComanda={(v) => {
          setLancComanda(v);
          setLancErro("");
        }}
        onMesa={setLancMesa}
        onNome={setLancApelido}
        onConfirmar={handleLancar}
        onEspera={porEmEspera}
        onFechar={() => {
          if (!salvando) setShowLancar(false);
        }}
        erro={lancErro}
        salvando={salvando}
        textoConfirmar={textoConfirmarLancar}
        mostrarEspera={cartItems.length > 0}
      />

      <EsperasSheet
        aberto={showEsperas}
        esperas={esperasAdaptadas}
        resumo={resumoEsperasTexto}
        onFechar={() => setShowEsperas(false)}
        onRemover={(id) =>
          setEsperas((prev) => {
            const depois = removerEspera(prev, id);
            if (depois.length === 0) setShowEsperas(false);
            return depois;
          })
        }
        onEnviarTodos={enviarEsperas}
        enviando={salvando}
      />

      <DetalheComandaSheet
        order={orderDetalhe}
        visivel={detalheVisible}
        onFechar={fecharDetalhe}
        onAdicionar={() => {
          const o = detalheComanda
            ? mapa[String(detalheComanda.comanda)] ?? detalheComanda
            : null;
          if (!o) return;
          fecharDetalhe();
          setTimeout(() => {
            setLancComanda(String(o.comanda));
            setLancMesa(o.mesa || "");
            setLancApelido(o.apelido || "");
            setLancErro("");
            setAba("pedido");
          }, 320);
        }}
        onExcluirItem={async (indice, motivo) => {
          // A comanda viva (mapa) é a fonte — o snapshot detalheComanda pode
          // estar defasado de lançamentos de outro dispositivo.
          const o = orderDetalhe;
          if (!o) return;
          const anteriores = Array.isArray(o.items) ? o.items : [];
          const alvo = anteriores[indice];
          const por = currentUser?.name || currentUser?.username || "";
          const novos = cancelarItemComanda(anteriores, indice, { motivo, por });
          if (novos === anteriores) return; // nada mudou (índice/estado inválido)
          const { error } = await updatePending(
            o.id,
            { items: novos, total: totalItensAtivos(novos) },
            { baseItems: anteriores }
          );
          if (error) {
            setToast("Não foi possível excluir o item. Tente de novo.");
            return;
          }
          logAction(currentUser?.username, "item:cancelar", {
            comanda: o.comanda,
            item: alvo?.name,
            motivo: motivo.trim(),
            por,
          });
          setToast("Item excluído da comanda.");
        }}
        travada={!!(bloqueio || (orderDetalhe && emUsoPorOutro(orderDetalhe)))}
        nomeTrava={
          bloqueio?.nome ?? (orderDetalhe ? nomeTrava(orderDetalhe) : "")
        }
      />

      <Toast msg={toast} />
    </div>
  );
}
