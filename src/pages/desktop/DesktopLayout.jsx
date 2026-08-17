import { Outlet } from "react-router-dom";
import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import Sidebar from "@/components/desktop/Sidebar";
import AssinaturaBanner from "@/components/desktop/AssinaturaBanner";
import Notification, { useNotification } from "@/components/shared/Notification";
import JarvasPanel from "@/components/shared/JarvasPanel";
import FechamentoModal from "@/components/modals/FechamentoModal";
import AberturaCaixaModal from "@/components/modals/AberturaCaixaModal";
import MovimentoCaixaModal from "@/components/modals/MovimentoCaixaModal";
import { inicioSessao } from "@/components/modals/FechamentoModal";
import { movimentosDaSessao, dinheiroDisponivel, ROTULO_TIPO } from "@/lib/caixaMovimentos";
import { totalPorMetodo } from "@/utils/pagamentos";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { nomeExibicaoTenant, MARCA_PLATAFORMA } from "@/lib/tema";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import "./DesktopLayout.css";

export default function DesktopLayout() {
  const { currentUser, logout, caixaAberto, setCaixaAberto, setSessaoAbertaEm, sessaoAbertaEm, addFechamento, setFundoAtual, fundoAtual, sales, tenant, users, movimentosCaixa, registrarMovimentoCaixa, limiteSangria } = useApp();
  // tema.nome_exibicao → nome cadastrado do estabelecimento → marca neutra
  // da plataforma. Nunca a marca de outro cliente (decisão 017).
  const nomeEstabelecimento = nomeExibicaoTenant(tenant?.tema, tenant?.nome);
  // Sem estabelecimento resolvido, o nome exibido JÁ é o da plataforma —
  // assinar ao lado leria "KORA by Kora".
  const marcaDoTenant = nomeEstabelecimento !== MARCA_PLATAFORMA;
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
    () => (users ?? []).filter(u => (u.role === "admin" || u.role === "gerente") && u.active !== false),
    [users]
  );
  const podeAutorizarSozinho = currentUser?.role === "admin" || currentUser?.role === "gerente";

  const isMob = width < 768;
  const [sidebarRecolhida, setSidebarRecolhida] = useState(false);
  // Largura do drawer: mínimo 200, máximo 260, nunca mais de 85% da tela
  const drawerWidth = Math.min(260, Math.max(200, Math.floor(width * 0.85)));

  return (
    <div style={{
      display: "flex", height: "100dvh",
      background: varColor(C.bg), fontFamily: "'Inter',system-ui,sans-serif", color: varColor(C.text),
      overflow: "hidden",
    }}>
      <Notification notif={notif} />
      <JarvasPanel />

      {/* ── Sidebar desktop (recolhível) ──────────────────────────── */}
      {!isMob && (
        <div style={{ position: "relative", flexShrink: 0 }}>
          {/* Painel da sidebar com transição de largura */}
          <div style={{
            width: sidebarRecolhida ? 0 : sz.sidebarWidth,
            overflow: "hidden",
            transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
          }}>
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
            style={{
              position: "absolute", right: -13, top: "50%",
              transform: "translateY(-50%)",
              width: 26, height: 44,
              borderRadius: "0 8px 8px 0",
              background: varColor(C.card),
              border: `1px solid var(${C.border})`,
              borderLeft: "none",
              color: varColor(C.muted),
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 20,
              transition: "background 0.15s, color 0.15s",
              padding: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = varColor(C.surface); e.currentTarget.style.color = varColor(C.text); }}
            onMouseLeave={e => { e.currentTarget.style.background = varColor(C.card); e.currentTarget.style.color = varColor(C.muted); }}
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
            style={{
              position: "fixed", inset: 0, zIndex: 299,
              background: "rgba(0,0,0,0.6)",
            }}
          />
          <div style={{
            position: "fixed", left: 0, top: 0,
            width: drawerWidth, height: "100dvh",
            zIndex: 300, overflow: "hidden",
          }}>
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Top bar mobile */}
        {isMob && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: `env(safe-area-inset-top, 0px) 16px 0`,
            minHeight: 52, flexShrink: 0,
            background: varColor(C.card), borderBottom: `1px solid var(${C.border})`,
          }}>
            <button
              className="desktop-layout__menu-btn"
              onClick={() => setMenuAberto(true)}
              style={{
                background: "none", border: `1px solid var(${C.border})`,
                borderRadius: 8, color: varColor(C.text), cursor: "pointer",
                padding: "6px 10px", fontWeight: 700,
                lineHeight: 1,
              }}
            >
              ☰
            </button>
            <div className="desktop-layout__name-tenant" style={{ flex: 1, fontWeight: 900, letterSpacing: "-0.3px", overflowWrap: "break-word" }}>
              {nomeEstabelecimento.toUpperCase()}
              {/* Assinatura da plataforma — aparece embaixo da marca de todo
                  estabelecimento (white-label, decisão 017) */}
              {marcaDoTenant && <span style={{ color: varColor(C.muted), fontWeight: 400 }}> by Kora</span>}
            </div>
            <span className="desktop-layout__status-badge" style={{
              fontWeight: 700, padding: "3px 8px", borderRadius: 10,
              background: caixaAberto ? `${alfa(C.green, "22")}` : `${alfa(C.red, "22")}`,
              color: caixaAberto ? varColor(C.green) : varColor(C.red),
            }}>
              {caixaAberto ? "● Aberto" : "● Fechado"}
            </span>
          </div>
        )}

        <AssinaturaBanner />

        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
              notify("Não foi possível registrar o fechamento — verifique sua permissão e tente novamente.", "err");
              return { error };
            }
            logAction(currentUser.username, "caixa:fechar", { msg: `Caixa fechado · vendas R$ ${data.totalVendas.toFixed(2)} · conferido R$ ${data.totalConferido.toFixed(2)}`, name: currentUser.name, role: currentUser.role, conferido: data.totalConferido, totalVendas: data.totalVendas });
            const fechou = await setCaixaAberto(false);
            if (fechou?.error) notify("Fechamento registrado, mas o status do caixa não mudou — tente fechar de novo.", "err");
            // O fechamento FOI gravado — o modal avança para o comprovante e
            // fecha sozinho no "Concluir" (via onClose). Um tropeço no status
            // do caixa acima já foi avisado, mas não desfaz o registro.
            return { error: null };
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
              notify("Não foi possível abrir o caixa — verifique sua permissão e tente novamente.", "err");
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
