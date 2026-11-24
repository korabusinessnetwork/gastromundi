import { useNavigate, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { useSessao, useConfig, useComandas, useCaixa } from "@/context/AppContext";
import { verificarSenhaUsuario, verificarSenhaAdmin } from "@/lib/adminAuth";
import { getSizes } from "@/constants/sizes";
import { useResponsive } from "@/utils/hooks";
import MODULOS from "@/constants/modulos";
import { CARGOS_MOVIMENTO_CAIXA } from "@/components/desktop/sidebar/apoio";

// Estado e ações da barra lateral do computador: navegação por permissão, relatório do
// caixa com senha, comandas fechadas, cancelamento de venda fechada e convite a upgrade.
export function useSidebar({ caixaAberto, onFechamento, onAbertura, onMovimentoCaixa, onLogout, onBackToChoice, onClose }) {
  const { currentUser, moduloHabilitado } = useSessao();
  const { metodosCustom } = useConfig();
  const { pending } = useComandas();
  const { sales, sessaoAbertaEm, cancelarVendaFechada } = useCaixa();
  // Rótulos de método configurados pelo tenant (white-label, decisão 017).
  const customLabels = useMemo(
    () => Object.fromEntries((metodosCustom ?? []).map(m => [m.id, m.label])),
    [metodosCustom]
  );
  const [upgradeInfo, setUpgradeInfo] = useState(null); // { label } — módulo bloqueado pelo plano atual
  const { width } = useResponsive();
  const sz = getSizes(width);
  const podeMovimentarCaixa = CARGOS_MOVIMENTO_CAIXA.includes(currentUser?.role);
  const abertas  = pending.filter(o => o.status !== "closed");
  // Leva 15.3 — vendas canceladas saem da lista (ficam só na trilha de auditoria)
  const naoCanceladas = sales.filter(s => s && !s.cancelada);
  const fechadas = sessaoAbertaEm
    ? naoCanceladas.filter(s => new Date(s.at) >= new Date(sessaoAbertaEm))
    : naoCanceladas;

  const [showFechadas,    setShowFechadas]   = useState(false);
  const [fechadaDetalhe, setFechadaDetalhe] = useState(null);

  // Leva 15.3 — cancelamento de venda fechada (motivo + senha de gerente/admin)
  const [cancelVenda,     setCancelVenda]     = useState(null);
  const [cancelMotivo,    setCancelMotivo]    = useState("");
  const [cancelSenha,     setCancelSenha]     = useState("");
  // Texto, não booleano: a verificação sabe distinguir "senha errada" de
  // "não deu para verificar agora" (rate-limit, sem rede) e a tela mostra qual.
  const [cancelSenhaErro, setCancelSenhaErro] = useState("");
  const [cancelErro,      setCancelErro]      = useState("");
  const [cancelando,      setCancelando]      = useState(false);

  const abrirCancelamento = () => {
    setCancelVenda(fechadaDetalhe);
    setCancelMotivo(""); setCancelSenha(""); setCancelSenhaErro(""); setCancelErro("");
  };

  const confirmarCancelamento = async () => {
    if (cancelando || !cancelMotivo.trim() || !cancelSenha.trim()) return;
    setCancelando(true); setCancelErro(""); setCancelSenhaErro("");
    try {
      const { ok, erro } = await verificarSenhaAdmin(cancelSenha);
      if (!ok) { setCancelSenhaErro(erro || "Senha incorreta. Apenas admin ou gerente pode cancelar vendas."); return; }
      const { error } = await cancelarVendaFechada(cancelVenda.id, cancelMotivo.trim());
      if (error) { setCancelErro("Não foi possível cancelar a venda. Tente novamente."); return; }
      setCancelVenda(null);
      setFechadaDetalhe(null);
    } finally { setCancelando(false); }
  };

  // Auth guard para Relatório (caixa)
  const [showAuthRel, setShowAuthRel] = useState(false);
  const [authUser,    setAuthUser]    = useState("");
  const [authPass,    setAuthPass]    = useState("");
  const [authError,   setAuthError]   = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const openAuthRel = () => { setAuthUser(""); setAuthPass(""); setAuthError(""); setShowAuthRel(true); };

  const handleAuthRelatorio = async () => {
    if (authLoading) return;
    const username = authUser.trim().toLowerCase();
    setAuthLoading(true);
    try {
      const { ok, erro } = await verificarSenhaUsuario(username, authPass);
      if (!ok) { setAuthError(erro || "Usuário, senha ou permissão incorretos."); return; }
      setShowAuthRel(false);
      navigate("/app/relatorio", { state: { ts: Date.now() } });
      onClose?.();
    } finally {
      setAuthLoading(false);
    }
  };

  const temRelatorio = !!currentUser?.permissions?.relatorio;
  const relatorioVisivel = temRelatorio || !!currentUser?.permissions?.pdv;

  const allItems = [
    { to: "/app/pdv",       label: "Frente de Caixa",  perm: "pdv",      badge: pending.length || null, modulo: MODULOS.PDV },
    // Cozinha removida do menu a pedido do dono (rota /app/cozinha segue no
    // router; para voltar, recolocar o item aqui).
    { to: "/app/clientes",  label: "Clientes",          perm: "clientes", modulo: MODULOS.CLIENTES },
    { to: "/app/produtos",  label: "Cadastro Produtos", perm: "produtos", modulo: MODULOS.CARDAPIO },
    { to: "/app/estoque",   label: "Estoque",           perm: "estoque",  modulo: MODULOS.ESTOQUE },
    { to: "/app/delivery",  label: "Delivery",          perm: "produtos", modulo: MODULOS.DELIVERY },
    { to: "/app/relatorio", label: "Relatório",         perm: "relatorio", extra: relatorioVisivel, modulo: MODULOS.RELATORIOS },
  ].filter(item => currentUser?.permissions?.[item.perm] || item.extra);

  // Financeiro, Notas Fiscais e Config. Fiscal saíram daqui: agora vivem dentro
  // da Área Admin (a sidebar estava lotada). Ver AdminView (SECOES com `to`).
  const bottomItems = [
    { to: "/app/admin",         label: "Área Admin",    perm: "configuracoes" },
    { to: "/app/configuracoes", label: "Configurações", perm: "configuracoes" },
  ].filter(item => currentUser?.permissions?.[item.perm]);

  // Fase 2 (ADR-005) — gating por plano: item com permissão de papel OK mas
  // módulo fora do plano do tenant aparece bloqueado (convite a upgrade),
  // nunca escondido nem quebrado (princípio nº 1 — intuitividade).
  const bloqueadoPorPlano = (item) => !!item.modulo && !moduloHabilitado(item.modulo);

  const navigate  = useNavigate();
  const location  = useLocation();

  return {
    navigate, location,
    upgradeInfo, setUpgradeInfo, showFechadas, setShowFechadas, fechadaDetalhe,
    setFechadaDetalhe, cancelVenda, setCancelVenda, cancelMotivo, setCancelMotivo, cancelSenha,
    setCancelSenha, cancelSenhaErro, setCancelSenhaErro, cancelErro, setCancelErro, cancelando,
    setCancelando, showAuthRel, setShowAuthRel, authUser, setAuthUser, authPass, setAuthPass,
    authError, setAuthError, authLoading, setAuthLoading, currentUser, moduloHabilitado,
    metodosCustom, pending, sales, sessaoAbertaEm, cancelarVendaFechada, width, customLabels, sz,
    podeMovimentarCaixa, abertas, naoCanceladas, fechadas, abrirCancelamento,
    confirmarCancelamento, openAuthRel, handleAuthRelatorio, temRelatorio, relatorioVisivel,
    allItems, bottomItems, bloqueadoPorPlano, caixaAberto, onFechamento, onAbertura,
    onMovimentoCaixa, onLogout, onBackToChoice, onClose,
  };
}
