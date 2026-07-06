import { useApp } from "@/context/AppContext";
import { nomeExibicaoTenant, logoUrlTenant } from "@/lib/tema";
import "./SidebarBranding.css";

/**
 * Cabeçalho de marca da Sidebar — Fase 6 (ADR-007 §2, decisão 017).
 * Lê `tenant.tema` (nome_exibicao/logo_url); sem tema custom, cai no
 * fallback "GastroMundi" (o app de hoje continua idêntico).
 *
 * Primeiro pedaço da Sidebar a sair do padrão 100% inline style —
 * adoção incremental do CSS separado do JSX (decisão 018), não um
 * big-bang: o resto do arquivo continua como está até ser tocado.
 */
export default function SidebarBranding() {
  const { tenant } = useApp();
  const nome = nomeExibicaoTenant(tenant?.tema);
  const logoUrl = logoUrlTenant(tenant?.tema);
  const ehPadrao = nome === "GastroMundi";

  return (
    <div className="sidebar-branding">
      {logoUrl ? (
        <img className="sidebar-branding__logo" src={logoUrl} alt={nome} />
      ) : (
        <div className="sidebar-branding__nome">
          {nome.toUpperCase()}
          {ehPadrao && <br />}
          {ehPadrao && <span className="sidebar-branding__tagline">by Kora</span>}
        </div>
      )}
    </div>
  );
}
