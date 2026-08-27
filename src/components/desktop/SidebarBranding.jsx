import { useApp } from "@/context/AppContext";
import { marcaDoCabecalho } from "@/lib/tema";
import { lerBrandingCache } from "@/lib/brandingCache";
import "./SidebarBranding.css";

/**
 * Cabeçalho de marca da Sidebar — Fase 6 (ADR-007 §2, decisão 017).
 * Lê `tenant.tema` (nome_exibicao/logo_url); sem tema custom, usa o nome
 * CADASTRADO do estabelecimento (`tenant.nome`) e, sem tenant carregado,
 * a marca neutra da plataforma — nunca a marca de outro cliente.
 *
 * Enquanto o bootstrap do tenant não responde, usa o cache de marca desta
 * origem (mesmo cache da pintura anti-flash), para a sidebar não escrever
 * "KORA" por alguns segundos logo depois de o login já ter mostrado a marca
 * do estabelecimento. Regra em `marcaDoCabecalho`.
 *
 * Primeiro pedaço da Sidebar a sair do padrão 100% inline style —
 * adoção incremental do CSS separado do JSX (decisão 018), não um
 * big-bang: o resto do arquivo continua como está até ser tocado.
 */
export default function SidebarBranding() {
  const { tenant } = useApp();
  // Sem estabelecimento resolvido, o nome exibido JÁ é o da plataforma —
  // assinar embaixo leria "KORA / by Kora".
  const { nome, logo: logoUrl, doTenant } = marcaDoCabecalho(tenant, lerBrandingCache());

  return (
    <div className="sidebar-branding">
      {logoUrl ? (
        <img className="sidebar-branding__logo" src={logoUrl} alt={nome} />
      ) : (
        <div className="sidebar-branding__nome">
          {nome.toUpperCase()}
          {/* "by Kora" é assinatura da PLATAFORMA — aparece embaixo da marca
              de todo estabelecimento, como a marca-mãe do SaaS. */}
          {doTenant && <br />}
          {doTenant && <span className="sidebar-branding__tagline">by Kora</span>}
        </div>
      )}
    </div>
  );
}
