import { NavLink } from "react-router-dom";
import SidebarBranding from "./SidebarBranding";
import {
  LuReceipt, LuChartBar, LuLock, LuLockOpen, LuLogOut, LuChevronLeft, LuCircle, LuHistory, LuSparkles
} from "react-icons/lu";
import { NAV_ICONS } from "./sidebar/apoio";
import { useSidebar } from "@/app/hooks/useSidebar";
import ModalSenhaRelatorio from "./sidebar/ModalSenhaRelatorio";
import ModalComandasFechadas from "./sidebar/ModalComandasFechadas";
import ConfirmarCancelamentoVenda from "./sidebar/ConfirmarCancelamentoVenda";
import ModalUpgradePlano from "./sidebar/ModalUpgradePlano";
import "./Sidebar.css";

export default function Sidebar({ caixaAberto, onFechamento, onAbertura, onMovimentoCaixa, onLogout, onBackToChoice, onClose }) {
  const tela = useSidebar({ caixaAberto, onFechamento, onAbertura, onMovimentoCaixa, onLogout, onBackToChoice, onClose });
  const {
    upgradeInfo, setUpgradeInfo, showFechadas, setShowFechadas, cancelVenda, showAuthRel, currentUser, sz, podeMovimentarCaixa, abertas, fechadas, openAuthRel, temRelatorio, allItems, bottomItems, bloqueadoPorPlano, navigate, location,
  } = tela;

  // Item de navegação: o visual mora em Sidebar.css (sidebar__nav-item e os
  // modificadores --ativo e --bloqueado).
  const classeItem = (isActive) => `sidebar__nav-item${isActive ? " sidebar__nav-item--ativo" : ""}`;


  const NavItem = ({ item }) => {
    const Icon = NAV_ICONS[item.to] ?? LuReceipt;
    const isActive = location.pathname === item.to;
    return (
      <NavLink
        to={item.to}
        className={classeItem(isActive)}
        onClick={e => {
          e.preventDefault();
          navigate(item.to, { state: { ts: Date.now() } });
          onClose?.();
        }}
      >
        <Icon size={sz.fontBase} />
        <span className="sidebar__nav-rotulo">{item.label}</span>
        {item.badge ? (
          <span className="sidebar__badge-contagem sidebar__badge-contagem--alerta">
            {item.badge}
          </span>
        ) : null}
      </NavLink>
    );
  };

  // Item fora do plano atual: visível, mas bloqueado com convite a upgrade
  // (nunca escondido, nunca leva a tela quebrada — princípio nº 1).
  const LockedByPlanoItem = ({ item }) => {
    const Icon = NAV_ICONS[item.to] ?? LuReceipt;
    return (
      <button
        onClick={() => setUpgradeInfo({ label: item.label })}
        className={`${classeItem(false)} sidebar__nav-item--bloqueado`}
      >
        <Icon size={sz.fontBase} />
        <span className="sidebar__nav-rotulo">{item.label}</span>
        <LuSparkles size={13} className="sidebar__nav-plano" />
      </button>
    );
  };

  return (
    <aside className="sidebar">

      {/* Logo/marca — lê tenant.tema (Fase 6, ADR-007); fallback "GastroMundi" */}
      <SidebarBranding />

      {/* Fechar drawer (mobile) */}
      {onClose && (
        <div className="sidebar__fechar-linha">
          <button onClick={onClose} className="sidebar__btn-fechar">
            ✕
          </button>
        </div>
      )}

      {/* Usuário */}
      <div className="sidebar__usuario">
        <div className="sidebar__usuario-dados">
          <div className="sidebar__usuario-nome">
            {currentUser?.name}
          </div>
          <div className="sidebar__usuario-linha">
            <span className="sidebar__usuario-handle">{currentUser?.username}</span>
            <span className={`sidebar__status-badge sidebar__status-badge--${caixaAberto ? "aberto" : "fechado"}`}>
              <LuCircle size={5} fill="currentColor" /> {caixaAberto ? "Aberto" : "Fechado"}
            </span>
          </div>
        </div>
        <div className="sidebar__usuario-acoes">
          {onBackToChoice && (
            <button onClick={onBackToChoice} title="Voltar à escolha" className="sidebar__icone-btn">
              <LuChevronLeft size={14} />
            </button>
          )}
          <button onClick={onLogout} title="Sair" className="sidebar__icone-btn">
            <LuLogOut size={14} />
          </button>
        </div>
      </div>

      {/* Navegação principal */}
      <nav className="sidebar__nav">
        {allItems.map(item => {
          const guardado = item.to === "/app/relatorio" && !temRelatorio;
          const isActive = location.pathname === item.to;
          return (
          <div key={item.to}>
            {guardado ? (
              <button
                onClick={openAuthRel}
                className={classeItem(isActive)}
              >
                <LuChartBar size={17} />
                <span className="sidebar__nav-rotulo">{item.label}</span>
                <LuLock size={13} className="sidebar__nav-cadeado" />
              </button>
            ) : bloqueadoPorPlano(item) ? (
              <LockedByPlanoItem item={item} />
            ) : (
              <NavItem item={item} />
            )}
            {/* Botão Comandas Fechadas — logo abaixo de Frente de Caixa */}
            {item.to === "/app/pdv" && fechadas.length > 0 && (
              <button
                onClick={() => setShowFechadas(true)}
                className="sidebar__subitem"
              >
                <LuHistory size={14} />
                <span className="sidebar__nav-rotulo">Comandas fechadas</span>
                <span className="sidebar__badge-contagem sidebar__badge-contagem--neutra">
                  {fechadas.length}
                </span>
              </button>
            )}
          </div>
          );
        })}
      </nav>

      {/* Modal Auth — Relatório (caixa) */}
      {showAuthRel && <ModalSenhaRelatorio tela={tela} />}

      {/* Modal Comandas Fechadas */}
      {showFechadas && <ModalComandasFechadas tela={tela} />}

      {/* Leva 15.3 — confirmação de cancelamento de venda fechada */}
      {cancelVenda && <ConfirmarCancelamentoVenda tela={tela} />}

      {/* Estoque + Configurações */}
      {bottomItems.length > 0 && (
        <div className="sidebar__rodape-nav">
          {bottomItems.map(item => bloqueadoPorPlano(item)
            ? <LockedByPlanoItem key={item.to} item={item} />
            : <NavItem key={item.to} item={item} />
          )}
        </div>
      )}

      {/* Modal — módulo fora do plano atual (convite a upgrade, princípio nº 1) */}
      {upgradeInfo && <ModalUpgradePlano tela={tela} />}

      {/* Fechar/Abrir Caixa */}
      <div className="sidebar__caixa">
        {caixaAberto ? (
          <div className="sidebar__caixa-acoes">
            {abertas.length > 0 && (
              <div className="sidebar__aviso-comandas-abertas">
                {abertas.length} comanda{abertas.length !== 1 ? "s" : ""} em aberto
              </div>
            )}
            {/* F005 — sangria/suprimento: só com o caixa aberto e só para
                quem opera a gaveta. */}
            {onMovimentoCaixa && podeMovimentarCaixa && (
              <button
                onClick={onMovimentoCaixa}
                title="Registrar retirada ou reforço de troco"
                className="sidebar__caixa-btn sidebar__caixa-btn--movimento"
              >
                Retirar / Colocar Dinheiro
              </button>
            )}
            <button
              onClick={abertas.length === 0 ? onFechamento : undefined}
              disabled={abertas.length > 0}
              title={abertas.length > 0 ? `Feche as ${abertas.length} comanda(s) abertas antes de fechar o caixa` : "Fechar Caixa"}
              className="sidebar__caixa-btn sidebar__caixa-btn--fechar"
            >
              <LuLock size={15} /> Fechar Caixa
            </button>
          </div>
        ) : (
          <button onClick={onAbertura} className="sidebar__caixa-btn sidebar__caixa-btn--abrir">
            <LuLockOpen size={15} /> Abrir Caixa
          </button>
        )}
      </div>
    </aside>
  );
}
