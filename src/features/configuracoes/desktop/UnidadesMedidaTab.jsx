import { useState, useEffect } from "react";
import { useSessao } from "@/context/AppContext";
import { excluirUnidadeMedida, listarUnidadesMedida, adicionarUnidadeMedida, contarUsoDaUnidade } from "@/features/estoque/dados/unidadesMedida";
import { createPortal } from "react-dom";
import { LuPlus, LuX, LuTriangleAlert } from "react-icons/lu";
import { TIPOS_UNIDADE, EMPTY_ADD } from "./apoio";

// Exportada para teste: a exclusão em cascata é destrutiva e precisa ser
// exercitada sozinha, sem arrastar as outras abas de Configurações.
export default function UnidadesMedidaTab({ sz }) {
  const { currentUser } = useSessao();
  const [unidades,    setUnidades]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [addForms,    setAddForms]    = useState({ estoque: EMPTY_ADD, compra: EMPTY_ADD, consumo: EMPTY_ADD });
  const [salvando,    setSalvando]    = useState({ estoque: false, compra: false, consumo: false });
  const [deleteInfo,  setDeleteInfo]  = useState(null); // { id, nome, abbr, afetados }
  const [deletando,   setDeletando]   = useState(false);
  const [erro,        setErro]        = useState("");

  // Só o admin grava unidade: é a policy `unidades_write_admin` do banco.
  // Mostrar adicionar e remover ao gerente era oferecer botões que sempre
  // falham; agora ele vê a lista em modo leitura e sabe a quem pedir.
  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    listarUnidadesMedida()
      .then(({ data, error }) => {
        // Sem checar o erro, a aba dizia "Nenhuma unidade cadastrada" para uma
        // base cheia — e o usuário recadastrava tudo em cima do que já existe.
        if (error) setErro("Não deu para carregar as unidades. Recarregue a página.");
        else setUnidades(data ?? []);
        setLoading(false);
      });
  }, []);

  const setAddField = (tipo, field, value) =>
    setAddForms(f => ({ ...f, [tipo]: { ...f[tipo], [field]: value } }));

  const adicionar = async (tipo) => {
    const { abbr, nome } = addForms[tipo];
    if (!abbr.trim() || !nome.trim()) return;
    setSalvando(s => ({ ...s, [tipo]: true }));
    setErro("");
    const { data, error } = await adicionarUnidadeMedida({ abreviacao: abbr.trim(), nome: nome.trim(), tipo });
    if (error || !data) {
      setErro("Não deu para adicionar a unidade. Tente de novo.");
    } else {
      setUnidades(prev => [...prev, data]);
      setAddForms(f => ({ ...f, [tipo]: EMPTY_ADD }));
    }
    setSalvando(s => ({ ...s, [tipo]: false }));
  };

  /**
   * Abre a confirmação já com a contagem de produtos afetados. Se a contagem
   * falha, NÃO abrimos: o diálogo diria "Nenhum produto utiliza essa unidade"
   * para uma unidade usada no cardápio inteiro, e o usuário confirmaria uma
   * exclusão em cascata achando que não mexia em nada.
   */
  const iniciarRemover = async (unidade) => {
    const abbr = unidade.abreviacao;
    setErro("");
    const { data: afetados, error } = await contarUsoDaUnidade(abbr);
    if (error) {
      setErro("Não deu para verificar quais produtos usam esta unidade. Tente de novo antes de excluir.");
      return;
    }
    setDeleteInfo({ id: unidade.id, nome: unidade.nome, abbr, afetados });
  };

  /**
   * Exclusão em cascata numa transação só (tarefa 1.3 do plano de
   * refatoração): desvincula a unidade dos produtos e apaga a unidade, ou não
   * faz nada. Antes eram quatro passos soltos, e com um gerente (que altera
   * produto mas não apaga unidade) os produtos perdiam a unidade enquanto a
   * unidade continuava cadastrada.
   */
  const confirmarRemover = async () => {
    if (!deleteInfo || deletando) return;
    setDeletando(true);
    setErro("");
    try {
      await excluirUnidadeMedida(deleteInfo.id);
    } catch (e) {
      setErro(e.message);
      setDeletando(false);
      return;
    }

    setUnidades(prev => prev.filter(u => u.id !== deleteInfo.id));
    setDeleteInfo(null);
    setDeletando(false);
  };

  if (loading) {
    return <div className="unidades-medida-tab__carregando" style={{ "--unidades-pad": `${sz.pad}px` }}>Carregando...</div>;
  }

  return (
    <>
    <div className="unidades-medida-tab" style={{ "--unidades-pad": `${sz.pad}px`, "--unidades-pad-sm": `${sz.padSm}px` }}>
      {!isAdmin && (
        <div className="unidades-medida-tab__leitura">
          Só o administrador pode adicionar ou remover unidades de medida. Aqui você confere as que estão cadastradas.
        </div>
      )}
      {/* Fora do diálogo: falhas de carga, de adição e da checagem pré-exclusão. */}
      {erro && !deleteInfo && (
        <div className="unidades-medida-tab__erro" role="alert">{erro}</div>
      )}
      {TIPOS_UNIDADE.map(({ tipo, label }) => {
        const lista   = unidades.filter(u => u.tipo === tipo);
        const form    = addForms[tipo];
        const salvandoEste = salvando[tipo];
        return (
          <div key={tipo} className={`unidades-medida-tab__grupo unidades-medida-tab__grupo--${tipo}`}>
            {/* Cabeçalho */}
            <div className="unidades-medida-tab__grupo-header">
              <div className="unidades-medida-tab__bolinha" />
              <span className="unidades-medida-tab__grupo-titulo">{label}</span>
              <span className="unidades-medida-tab__grupo-contagem">{lista.length} cadastrada{lista.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Lista */}
            <div className="unidades-medida-tab__lista">
              {lista.length === 0 && (
                <div className="unidades-medida-tab__vazio">
                  Nenhuma unidade cadastrada.
                </div>
              )}
              {lista.map(u => (
                <div key={u.id} className="unidades-medida-tab__item">
                  <span className="unidades-medida-tab__item-abbr">
                    {u.abreviacao}
                  </span>
                  <span className="unidades-medida-tab__item-nome">{u.nome}</span>
                  {isAdmin && (
                    <button
                      onClick={() => iniciarRemover(u)}
                      title="Remover"
                      aria-label={`Remover ${u.nome}`}
                      className="unidades-medida-tab__btn-remover"
                    >
                      <LuX size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Formulário inline de adição */}
            {isAdmin && (
              <div className="unidades-medida-tab__form-add">
                <input
                  value={form.abbr}
                  onChange={e => setAddField(tipo, "abbr", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && adicionar(tipo)}
                  placeholder="abrev."
                  maxLength={10}
                  className={`unidades-medida-tab__input-abbr${form.abbr ? " unidades-medida-tab__input--preenchido" : ""}`}
                />
                <input
                  value={form.nome}
                  onChange={e => setAddField(tipo, "nome", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && adicionar(tipo)}
                  placeholder="Nome completo"
                  maxLength={40}
                  className={`unidades-medida-tab__input-nome${form.nome ? " unidades-medida-tab__input--preenchido" : ""}`}
                />
                <button
                  onClick={() => adicionar(tipo)}
                  disabled={!form.abbr.trim() || !form.nome.trim() || salvandoEste}
                  className={`unidades-medida-tab__btn-add${form.abbr.trim() && form.nome.trim() ? " unidades-medida-tab__btn-add--pronto" : ""}`}
                >
                  <LuPlus size={14} />
                  {salvandoEste ? "..." : "Adicionar"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>

    {deleteInfo && createPortal(
      <div className="unidades-medida-tab__delete-overlay">
        <div className="unidades-medida-tab__delete-modal">
          <div className="unidades-medida-tab__delete-topo">
            <div className="unidades-medida-tab__delete-icone">
              <LuTriangleAlert size={22} />
            </div>
            <div>
              <div className="unidades-medida-tab__delete-titulo">Excluir unidade</div>
              <div className="unidades-medida-tab__delete-ajuda">Esta ação não pode ser desfeita.</div>
            </div>
          </div>

          <div className="unidades-medida-tab__delete-info">
            <div className="unidades-medida-tab__delete-nome">
              "{deleteInfo.nome}" ({deleteInfo.abbr})
            </div>
            {deleteInfo.afetados > 0 ? (
              <div className="unidades-medida-tab__delete-aviso">
                <LuTriangleAlert size={13} className="unidades-medida-tab__delete-aviso-icone" aria-hidden="true" /> {deleteInfo.afetados} {deleteInfo.afetados === 1 ? "produto ficará" : "produtos ficarão"} sem essa unidade configurada após a exclusão.
              </div>
            ) : (
              <div className="unidades-medida-tab__delete-sem-uso">
                Nenhum produto utiliza essa unidade.
              </div>
            )}
          </div>

          {erro && (
            <div className="unidades-medida-tab__erro" role="alert">{erro}</div>
          )}

          <div className="unidades-medida-tab__delete-botoes">
            <button
              onClick={() => setDeleteInfo(null)}
              disabled={deletando}
              className="unidades-medida-tab__delete-cancelar"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarRemover}
              disabled={deletando}
              className="unidades-medida-tab__delete-confirmar"
            >
              {deletando ? "Excluindo..." : "Sim, excluir"}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}

// ── View principal ────────────────────────────────────────────────
