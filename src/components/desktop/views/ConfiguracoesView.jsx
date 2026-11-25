import { useState } from "react";
import { useSessao } from "@/context/AppContext";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { LuPrinter, LuBike, LuReceipt, LuPalette } from "react-icons/lu";
import ConfiguracaoImpressao from "./impressao/ConfiguracaoImpressao";
import MesasAdmin from "./mesas/MesasAdmin";
import ImportarExportarTab from "./ImportarExportarTab";
import MinhaAssinaturaTab from "./MinhaAssinaturaTab";
import IdentidadeTab from "./IdentidadeTab";
import "./ConfiguracoesView.css";
import UsuariosTab from "./configuracoes/UsuariosTab";
import MeiosPagamentoTab from "./configuracoes/MeiosPagamentoTab";
import UnidadesMedidaTab from "./configuracoes/UnidadesMedidaTab";
import GeralTab from "./configuracoes/GeralTab";
import DeliveryTab from "./configuracoes/DeliveryTab";
import CategoriasGrupoTab from "./configuracoes/CategoriasGrupoTab";
import { ABAS_CONFIG } from "./configuracoes/apoio";
export { default as UsuariosTab } from "./configuracoes/UsuariosTab";
export { default as UnidadesMedidaTab } from "./configuracoes/UnidadesMedidaTab";

export default function ConfiguracoesView() {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const { currentUser } = useSessao();
  const isAdmin = currentUser?.role === "admin";
  const isGerente = isAdmin || currentUser?.role === "gerente";
  const [aba, setAba] = useState("geral");

  const abasVisiveis = ABAS_CONFIG.filter(a => (!a.adminOnly || isAdmin) && (!a.gerenteOnly || isGerente));

  return (
    <div className="configuracoes-view" style={{ "--cfg-pad": `${sz.pad}px`, "--cfg-pad-sm": `${sz.padSm}px` }}>

      {/* Header */}
      <div className="configuracoes-view__header">
        <div className="configuracoes-view__titulo">Configurações</div>
        <div className="configuracoes-view__subtitulo">
          Gerencie os usuários e configurações do sistema
        </div>

        {/* Tabs */}
        <div className="configuracoes-view__abas">
          {abasVisiveis.map(a => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`configuracoes-view__aba${aba === a.id ? " configuracoes-view__aba--ativa" : ""}`}
            >
              {a.id === "identidade" && <LuPalette size={13} />}
              {a.id === "impressao" && <LuPrinter size={13} />}
              {a.id === "delivery" && <LuBike size={13} />}
              {a.id === "assinatura" && <LuReceipt size={13} />}
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="configuracoes-view__conteudo">
        {aba === "geral"           && <GeralTab sz={sz} />}
        {aba === "identidade" && isAdmin && <IdentidadeTab />}
        {aba === "usuarios"        && <UsuariosTab sz={sz} />}
        {aba === "meios_pagamento" && <MeiosPagamentoTab sz={sz} />}
        {aba === "unidades_medida" && <UnidadesMedidaTab sz={sz} />}
        {aba === "mesas"     && isGerente && <MesasAdmin sz={sz} />}
        {aba === "delivery"  && isGerente && <DeliveryTab sz={sz} />}
        {aba === "categorias" && isGerente && <CategoriasGrupoTab sz={sz} />}
        {aba === "impressao" && isAdmin && <ConfiguracaoImpressao sz={sz} />}
        {aba === "importar"  && isAdmin && <ImportarExportarTab />}
        {aba === "assinatura" && isGerente && <MinhaAssinaturaTab />}
      </div>
    </div>
  );
}
