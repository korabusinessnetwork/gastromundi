import { useState, useEffect, useMemo } from "react";
import { listarConfigFiscalDosItens } from "@/features/fiscal/dados/itensFiscal";
import { useCatalogo } from "@/context/AppContext";
import { LuSearch, LuX, LuTriangleAlert, LuClipboardList, LuPackage } from "react-icons/lu";
import "./ImpostosAdmin.css";
import ModalFiscal from "./impostos/ModalFiscal";
import { CATS_EXCLUIDAS } from "./impostos/apoio";
import { nomeBateComBusca } from "@/lib/busca";

export default function ImpostosAdmin() {
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
      if (busca && !nomeBateComBusca(p.name, busca.toLowerCase())) return false;
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
    return <div className="impostos-admin__carregando">Carregando configurações fiscais...</div>;
  }

  if (loadErro) {
    return (
      <div className="impostos-admin__falha-carga">
        <div className="impostos-admin__erro impostos-admin__erro--grande" role="alert">
          <LuTriangleAlert size={16} className="impostos-admin__erro-icone" /> {loadErro}
        </div>
        <button onClick={carregarFiscal} className="impostos-admin__btn-salvar">
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="impostos-admin">
      {/* Cabeçalho */}
      <div className="impostos-admin__cabecalho">
        <div className="impostos-admin__cabecalho-titulo">Configuração Fiscal dos Itens</div>
        <div className="impostos-admin__cabecalho-sub">
          Sincronizado com Cadastros · Produção e Insumos excluídos automaticamente
        </div>
      </div>

      {/* Badges contador */}
      <div className="impostos-admin__badges">
        {[
          { label: `${itens.length} ite${itens.length !== 1 ? "ns" : "m"}`, tom: "total" },
          { label: `${totalConf} configurado${totalConf !== 1 ? "s" : ""}`, tom: "configurado" },
          { label: `${totalPend} pendente${totalPend !== 1 ? "s" : ""}`, tom: "pendente" },
        ].map((b, i) => (
          // TD015: dois badges montados na própria expressão acima, quantidade fixa.
          <span key={i} className={`impostos-admin__badge impostos-admin__tom--${b.tom}`}>
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
            className={`impostos-admin__busca-input${busca ? " impostos-admin__busca-input--preenchida" : ""}`}
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
          <LuClipboardList className="impostos-admin__vazio-icone" aria-hidden="true" />
          <div className="impostos-admin__vazio-mensagem">
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
                {itensCat.map((item) => {
                  const fiscal   = fiscalMap[item.id];
                  const conf     = !!fiscal;
                  return (
                    <div
                      key={item.id}
                      className="impostos-admin__item"
                    >
                      {/* Emoji / ícone */}
                      <div className="impostos-admin__item-icone">
                        <LuPackage aria-hidden="true" />
                      </div>

                      {/* Nome */}
                      <div className="impostos-admin__item-texto">
                        <div className="impostos-admin__item-nome">
                          {item.name}
                        </div>
                        {fiscal?.ncm && (
                          <div className="impostos-admin__item-ncm">NCM {fiscal.ncm}</div>
                        )}
                      </div>

                      {/* Badge status */}
                      <span className={`impostos-admin__item-badge impostos-admin__tom--${conf ? "configurado" : "pendente"}`}>
                        {conf ? "✓ Configurado" : "Pendente"}
                      </span>

                      {/* Botão */}
                      <button
                        onClick={() => setModalItem(item)}
                        className={`impostos-admin__btn-configurar${conf ? " impostos-admin__btn-configurar--editar" : ""}`}
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
          onClose={() => setModalItem(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
