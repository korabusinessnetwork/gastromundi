import { Outlet } from "react-router-dom";
import { useMemo, useState } from "react";
import { useSessao, useConfig, useCaixa } from "@/context/AppContext";
import { logAction } from "@/features/auditoria/dados/logger";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import Sidebar from "@/components/desktop/Sidebar";
import AssinaturaBanner from "@/components/desktop/AssinaturaBanner";
import Notification, { useNotification } from "@/components/shared/Notification";
import JarvasPanel from "@/components/shared/JarvasPanel";
import FechamentoModal from "@/features/caixa/desktop/FechamentoModal";
import AberturaCaixaModal from "@/features/caixa/desktop/AberturaCaixaModal";
import MovimentoCaixaModal from "@/features/caixa/desktop/MovimentoCaixaModal";
import { inicioSessao } from "@/features/caixa/desktop/FechamentoModal";
import { movimentosDaSessao, dinheiroDisponivel, ROTULO_TIPO } from "@/features/caixa/regras/caixaMovimentos";
import { totalPorMetodo } from "@/utils/pagamentos";
import { marcaDoCabecalho } from "@/lib/tema";
import { lerBrandingCache } from "@/lib/brandingCache";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import "./DesktopLayout.css";
import { ehGerencia } from "@/constants/roles";

export default function DesktopLayout() {
  const { currentUser, logout, tenant, users } = useSessao();
  const { limiteSangria } = useConfig();
  const { caixaAberto, setCaixaAberto, setSessaoAbertaEm, sessaoAbertaEm, addFechamento, setFundoAtual, fundoAtual, sales, movimentosCaixa, registrarMovimentoCaixa } = useCaixa();
  // tema.nome_exibicao → nome cadastrado do estabelecimento → cache de marca
  // desta origem (enquanto o bootstrap não responde) → marca neutra da
  // plataforma. Nunca a marca de outro cliente (decisão 017). Sem
  // estabelecimento resolvido, o nome exibido JÁ é o da plataforma — assinar
  // ao lado leria "KORA by Kora".
  const { nome: nomeEstabelecimento, doTenant: marcaDoTenant } = marcaDoCabecalho(tenant, lerBrandingCache());
  const { width } = useResponsive();
  const sz = getSizes(width);
  const { notif, notify } = useNotification();

  const [showFechamento, setShowFechamento] = useState(false);
  const [showAbertura,   setShowAbertura]   = useState(false);
  const [showMovimento,  setShowMovimento]  = useState(false);
  const [menuAberto,     setMenuAberto]     = useState(false);

  // F005 — quanto existe fisicamente na gaveta agora: fundo + o que entrou em
  // dinheiro nesta sessão + reforços − retiradas. É o teto da sangria, então
  // usa a mesma janela de sessão do fechamento.
  const dinheiroNaGaveta = useMemo(() => {
    const inicio = inicioSessao(sessaoAbertaEm);
    const vendasDinheiro = (sales ?? [])
      .filter(s => s && !s.cancelada && new Date(s.at).getTime() >= inicio)
      .reduce((soma, v) => soma + (totalPorMetodo(v).dinheiro ?? 0), 0);
    return dinheiroDisponivel({
      fundo: fundoAtual,
      vendasDinheiro,
      movimentos: movimentosDaSessao(movimentosCaixa, inicio),
    });
  }, [sales, fundoAtual, sessaoAbertaEm, movimentosCaixa]);

  // Só admin/gerente autorizam sangria acima do limite — e autorizam a si
  // mesmos, sem digitar a própria senha.
  const autorizadores = useMemo(
    () => (users ?? []).filter(u => ehGerencia(u) && u.active !== false),
    [users]
  );
  const podeAutorizarSozinho = ehGerencia(currentUser);

  const isMob = width < 768;
  const [sidebarRecolhida, setSidebarRecolhida] = useState(false);
  // Largura do drawer: mínimo 200, máximo 260, nunca mais de 85% da tela
  const drawerWidth = Math.min(260, Math.max(200, Math.floor(width * 0.85)));

  return (
    <div
      className="desktop-layout"
      style={{ "--desktop-sidebar-w": `${sz.sidebarWidth}px`, "--desktop-drawer-w": `${drawerWidth}px` }}
    >
      <Notification notif={notif} />
      <JarvasPanel />

      {/* ── Sidebar desktop (recolhível) ──────────────────────────── */}
      {!isMob && (
        <div className="desktop-layout__lateral">
          {/* Painel da sidebar com transição de largura */}
          <div className={`desktop-layout__painel${sidebarRecolhida ? " desktop-layout__painel--recolhido" : ""}`}>
            <Sidebar
              caixaAberto={caixaAberto}
              onFechamento={() => setShowFechamento(true)}
              onAbertura={() => setShowAbertura(true)}
              onMovimentoCaixa={() => setShowMovimento(true)}
              onLogout={logout}
            />
          </div>

          {/* Botão de recolher/expandir */}
          <button
            onClick={() => setSidebarRecolhida(v => !v)}
            title={sidebarRecolhida ? "Expandir sidebar" : "Recolher sidebar"}
            aria-label={sidebarRecolhida ? "Expandir menu lateral" : "Recolher menu lateral"}
            className="desktop-layout__recolher"
          >
            {sidebarRecolhida
              ? <LuChevronRight size={14} />
              : <LuChevronLeft size={14} />}
          </button>
        </div>
      )}

      {/* ── Sidebar mobile (drawer overlay) ──────────────────────── */}
      {isMob && menuAberto && (
        <>
          <div
            onClick={() => setMenuAberto(false)}
            className="desktop-layout__gaveta-fundo"
          />
          <div className="desktop-layout__gaveta">
            <Sidebar
              caixaAberto={caixaAberto}
              onFechamento={() => { setShowFechamento(true); setMenuAberto(false); }}
              onAbertura={() => { setShowAbertura(true); setMenuAberto(false); }}
              onMovimentoCaixa={() => { setShowMovimento(true); setMenuAberto(false); }}
              onLogout={logout}
              onClose={() => setMenuAberto(false)}
            />
          </div>
        </>
      )}

      {/* ── Área de conteúdo ─────────────────────────────────────── */}
      <div className="desktop-layout__conteudo">

        {/* Top bar mobile */}
        {isMob && (
          <div className="desktop-layout__topo">
            <button
              className="desktop-layout__menu-btn"
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu"
            >
              ☰
            </button>
            <div className="desktop-layout__name-tenant">
              {nomeEstabelecimento.toUpperCase()}
              {/* Assinatura da plataforma — aparece embaixo da marca de todo
                  estabelecimento (white-label, decisão 017) */}
              {marcaDoTenant && <span className="desktop-layout__by-kora"> by Kora</span>}
            </div>
            <span className={`desktop-layout__status-badge desktop-layout__status-badge--${caixaAberto ? "aberto" : "fechado"}`}>
              {caixaAberto ? "● Aberto" : "● Fechado"}
            </span>
          </div>
        )}

        <AssinaturaBanner />

        <main className="desktop-layout__principal">
          <Outlet context={{ notify }} />
        </main>
      </div>

      {showFechamento && (
        <FechamentoModal
          sales={sales}
          fundoAtual={fundoAtual}
          sessaoAbertaEm={sessaoAbertaEm}
          onConfirm={async (data) => {
            const { error } = await addFechamento({ id: Date.now(), at: new Date().toISOString(), user: currentUser.name, role: currentUser.role, fundo: fundoAtual, ...data });
            if (error) {
              // Mantém o modal aberto: o operador precisa saber que o
              // fechamento NÃO foi registrado (antes falhava em silêncio).
              notify("Não foi possível registrar o fechamento, verifique sua permissão e tente novamente.", "err");
              return;
            }
            logAction(currentUser.username, "caixa:fechar", { msg: `Caixa fechado · vendas R$ ${data.totalVendas.toFixed(2)} · conferido R$ ${data.totalConferido.toFixed(2)}`, name: currentUser.name, role: currentUser.role, conferido: data.totalConferido, totalVendas: data.totalVendas });
            const fechou = await setCaixaAberto(false);
            if (fechou?.error) notify("Fechamento registrado, mas o status do caixa não mudou, tente fechar de novo.", "err");
            setShowFechamento(false);
          }}
          onClose={() => setShowFechamento(false)}
        />
      )}

      {showAbertura && (
        <AberturaCaixaModal
          onConfirm={async (fundo) => {
            const agora = new Date().toISOString();
            const resultados = await Promise.all([
              setFundoAtual(fundo),
              setSessaoAbertaEm(agora),
              setCaixaAberto(true),
            ]);
            if (resultados.some(r => r?.error)) {
              // Mantém o modal aberto: sem persistir, outro dispositivo
              // continuaria vendo o caixa fechado (antes falhava em silêncio).
              notify("Não foi possível abrir o caixa, verifique sua permissão e tente novamente.", "err");
              return;
            }
            logAction(currentUser.username, "caixa:abrir", { msg: `Caixa aberto · fundo R$ ${fundo.toFixed(2)}`, name: currentUser.name, role: currentUser.role, fundo });
            setShowAbertura(false);
          }}
          onClose={() => setShowAbertura(false)}
        />
      )}

      {showMovimento && (
        <MovimentoCaixaModal
          disponivel={dinheiroNaGaveta}
          limite={limiteSangria}
          autorizadores={autorizadores}
          podeAutorizarSozinho={podeAutorizarSozinho}
          onConfirm={async (dados) => {
            const resultado = await registrarMovimentoCaixa(dados);
            // O modal fica aberto no erro e mostra a mensagem — aqui só
            // avisamos o sucesso, que some da tela junto com o modal.
            if (!resultado?.error) {
              notify(`Registrado: ${ROTULO_TIPO[dados.tipo]} de R$ ${Number(dados.valor).toFixed(2)}.`, "ok");
            }
            return resultado;
          }}
          onClose={() => setShowMovimento(false)}
        />
      )}
    </div>
  );
}
