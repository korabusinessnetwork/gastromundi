import { useState, useEffect, useMemo } from "react";
import { listarConfigFiscalDosItens } from "@/features/fiscal/dados/itensFiscal";
import { useCatalogo } from "@/context/AppContext";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuSearch, LuX, LuTriangleAlert } from "react-icons/lu";
import "./ImpostosAdmin.css";
import ModalFiscal from "./impostos/ModalFiscal";
import { CATS_EXCLUIDAS } from "./impostos/apoio";

export default function ImpostosAdmin({ sz }) {
  const { products } = useCatalogo();

  const [fiscalMap,    setFiscalMap]    = useState({}); // { item_id: dados_fiscal }
  const [loading,      setLoading]      = useState(true);
  const [loadErro,     setLoadErro]     = useState("");
  const [busca,        setBusca]        = useState("");
  const [catFiltro,    setCatFiltro]    = useState("Todos");
  const [statusFiltro, setStatusFiltro] = useState("Todos");
  const [modalItem,    setModalItem]    = useState(null);

  // Produtos elegíveis (excluindo Produção e Insumo)
  const itens = useMemo(() =>
    products.filter(p => !CATS_EXCLUIDAS.includes(p.category)),
    [products]
  );

  const categorias = useMemo(() =>
    [...new Set(itens.map(p => p.category).filter(Boolean))].sort(),
    [itens]
  );

  const carregarFiscal = async () => {
    if (!itens.length) { setLoading(false); setLoadErro(""); return; }
    setLoading(true);
    setLoadErro("");
    const ids = itens.map(p => p.id);
    const { data, error } = await listarConfigFiscalDosItens(ids);
    if (error) {
      // Sem os dados reais, mostrar tudo como "Pendente" enganaria o usuário.
      setLoadErro("Não foi possível carregar as configurações fiscais.");
      setLoading(false);
      return;
    }
    const map = {};
    (data ?? []).forEach(d => { map[d.item_id] = d; });
    setFiscalMap(map);
    setLoading(false);
  };

  useEffect(() => { carregarFiscal(); }, [itens]);

  const onSaved = (itemId, payload) => {
    setFiscalMap(prev => ({ ...prev, [itemId]: { ...prev[itemId], ...payload } }));
  };

  // Filtragem
  const itensFiltrados = useMemo(() => {
    return itens.filter(p => {
      const temConf  = !!fiscalMap[p.id];
      if (catFiltro    !== "Todos" && p.category !== catFiltro) return false;
      if (statusFiltro === "Configurados" && !temConf)  return false;
      if (statusFiltro === "Pendentes"    &&  temConf)  return false;
      if (busca && !p.name.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [itens, fiscalMap, catFiltro, statusFiltro, busca]);

  // Agrupados por categoria
  const grupos = useMemo(() => {
    const m = {};
    itensFiltrados.forEach(p => {
      if (!m[p.category]) m[p.category] = [];
      m[p.category].push(p);
    });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [itensFiltrados]);

  const totalConf    = itens.filter(p => !!fiscalMap[p.id]).length;
  const totalPend    = itens.length - totalConf;

  if (loading) {
    return <div className="impostos-admin__carregando" style={{ color: varColor(C.muted), textAlign: "center", padding: 60 }}>Carregando configurações fiscais...</div>;
  }

  if (loadErro) {
    return (
      <div style={{ textAlign: "center", padding: 60, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div className="impostos-admin__erro impostos-admin__erro--grande" style={{ background: alfa(C.red, "12"), border: `1px solid ${alfa(C.red, "33")}` }}>
          <LuTriangleAlert size={16} style={{ flexShrink: 0 }} /> {loadErro}
        </div>
        <button onClick={carregarFiscal} className="impostos-admin__btn-salvar" style={{ background: varColor(C.accent) }}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: 20 }}>
        <div className="impostos-admin__cabecalho-titulo">Configuração Fiscal dos Itens</div>
        <div className="impostos-admin__cabecalho-sub">
          Sincronizado com Cadastros · Produção e Insumos excluídos automaticamente
        </div>
      </div>

      {/* Badges contador */}
      <div className="impostos-admin__badges">
        {[
          { label: `${itens.length} ite${itens.length !== 1 ? "ns" : "m"}`, color: varColor(C.text) },
          { label: `${totalConf} configurado${totalConf !== 1 ? "s" : ""}`, color: varColor(C.green) },
          { label: `${totalPend} pendente${totalPend !== 1 ? "s" : ""}`, color: varColor(C.warn) },
        ].map((b, i) => (
          // TD015: dois badges montados na própria expressão acima, quantidade fixa.
          <span key={i} className="impostos-admin__badge" style={{ background: alfa(b.color, "18"), color: b.color, border: `1px solid ${alfa(b.color, "33")}` }}>
            {b.label}
          </span>
        ))}
      </div>

      {/* Filtros */}
      <div className="impostos-admin__filtros">
        {/* Busca */}
        <div className="impostos-admin__busca-wrap">
          <LuSearch size={15} className="impostos-admin__busca-icone" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar item..."
            className="impostos-admin__busca-input"
            style={{ borderColor: busca ? varColor(C.accent) : "var(--gm-input-border)" }}
          />
          {busca && (
            <button onClick={() => setBusca("")} className="impostos-admin__busca-limpar">
              <LuX size={14} />
            </button>
          )}
        </div>

        {/* Categoria */}
        <select
          value={catFiltro}
          onChange={e => setCatFiltro(e.target.value)}
          className="impostos-admin__filtro-select"
        >
          <option value="Todos">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Status */}
        <select
          value={statusFiltro}
          onChange={e => setStatusFiltro(e.target.value)}
          className="impostos-admin__filtro-select"
        >
          <option value="Todos">Todos os status</option>
          <option value="Configurados">Configurados</option>
          <option value="Pendentes">Pendentes</option>
        </select>
      </div>

      {/* Lista agrupada */}
      {grupos.length === 0 ? (
        <div className="impostos-admin__vazio">
          <div className="impostos-admin__vazio-icone" style={{ marginBottom: 12, opacity: 0.3 }}>📋</div>
          <div className="impostos-admin__vazio-mensagem" style={{ fontWeight: 600 }}>
            {itens.length === 0 ? "Nenhum item cadastrado (excluindo Produção e Insumos)" : "Nenhum item encontrado para os filtros selecionados"}
          </div>
        </div>
      ) : (
        <div className="impostos-admin__grupos">
          {grupos.map(([cat, itensCat]) => (
            <div key={cat}>
              {/* Header do grupo */}
              <div className="impostos-admin__grupo-header">
                <span className="impostos-admin__grupo-titulo">{cat}</span>
                <span className="impostos-admin__grupo-contador">
                  {itensCat.length} {itensCat.length === 1 ? "item" : "itens"}
                </span>
                <div className="impostos-admin__grupo-linha" />
              </div>

              {/* Itens da categoria */}
              <div className="impostos-admin__grupo-lista">
                {itensCat.map((item, i) => {
                  const fiscal   = fiscalMap[item.id];
                  const conf     = !!fiscal;
                  return (
                    <div
                      key={item.id}
                      className="impostos-admin__item"
                      style={{ borderBottom: i < itensCat.length - 1 ? `1px solid var(${C.border})` : "none" }}
                    >
                      {/* Emoji / ícone */}
                      <div className="impostos-admin__item-icone">
                        {item.emoji || "📦"}
                      </div>

                      {/* Nome */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="impostos-admin__item-nome">
                          {item.name}
                        </div>
                        {fiscal?.ncm && (
                          <div className="impostos-admin__item-ncm">NCM {fiscal.ncm}</div>
                        )}
                      </div>

                      {/* Badge status */}
                      <span className="impostos-admin__item-badge" style={{
                        background: conf ? alfa(C.green, "15") : alfa(C.warn, "15"),
                        color: conf ? varColor(C.green) : varColor(C.warn),
                        border: `1px solid ${alfa(conf ? varColor(C.green) : varColor(C.warn), "44")}`,
                      }}>
                        {conf ? "✓ Configurado" : "Pendente"}
                      </span>

                      {/* Botão */}
                      <button
                        onClick={() => setModalItem(item)}
                        className="impostos-admin__btn-configurar"
                        style={{
                          border: conf ? `1px solid var(${C.border})` : `1.5px solid var(${C.accent})`,
                          background: conf ? "none" : alfa(C.accent, "12"),
                          color: conf ? varColor(C.muted) : varColor(C.accent),
                        }}
                      >
                        {conf ? "Editar" : "Configurar"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalItem && (
        <ModalFiscal
          item={modalItem}
          dadosSalvos={fiscalMap[modalItem.id] ?? {}}
          sz={sz}
          onClose={() => setModalItem(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
