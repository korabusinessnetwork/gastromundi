import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { lerCadastrosAdministrativos, salvarCadastroAdministrativo, contarNotasFiscais } from "@/features/admin/dados/administrativo";
import { useSessao, useCatalogo } from "@/context/AppContext";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { useResponsive } from "@/utils/hooks";
// O dia UTC vira às 21h de Brasília: a compra aberta à noite já nascia datada
// de amanhã.
import { getSizes } from "@/constants/sizes";
import {
  LuArrowLeft
} from "react-icons/lu";
import NotasFiscaisTab from "@/components/desktop/views/NotasFiscaisTab";
import ImpostosAdmin from "@/components/desktop/views/ImpostosAdmin";
// TD015: as linhas de ingrediente e de item de compra são adicionadas e removidas
// do meio da lista, então precisam de identidade própria. Não confundir com o `uid`
// local deste arquivo, que é id de entidade (a ficha, a compra) e vai para o banco.
// O `novoUid` daqui é chave de renderização, e sai do objeto antes de gravar.
import "./AdminView.css";
import FichasTecnicasTab from "./admin/FichasTecnicasTab";
import FornecedoresTab from "./admin/FornecedoresTab";
import ComprasTab from "./admin/ComprasTab";
import GradeInicial from "./admin/GradeInicial";
import { uid, FORN_VAZIO, SECOES } from "./admin/apoio";

// ── Helpers ───────────────────────────────────────────────────────

export default function AdminView() {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const navigate = useNavigate();
  const { currentUser } = useSessao();
  const { products, estoque } = useCatalogo();

  // Atalhos para telas próprias só aparecem para quem tem a permissão da
  // tela de destino (as abas internas ficam sempre visíveis).
  const secoesVisiveis = SECOES.filter(s => !s.perm || currentUser?.permissions?.[s.perm]);

  const [secao,              setSecao]              = useState(null);
  const [fichas,             setFichas]             = useState([]);
  const [fornecedores,       setFornecedores]       = useState([]);
  const [compras,            setCompras]            = useState([]);
  const [impostos,           setImpostos]           = useState([]);
  const [notasFiscaisCount,  setNotasFiscaisCount]  = useState(0);
  const [loading,            setLoading]            = useState(true);
  const [erroTela,           setErroTela]           = useState("");

  useEffect(() => {
    Promise.all([
      lerCadastrosAdministrativos(),
      contarNotasFiscais(),
    ]).then(([{ data, error }, { count }]) => {
      // Sem checar o erro, uma falha de leitura zerava fichas técnicas,
      // fornecedores e compras na tela — e quem estivesse cadastrando salvava
      // por cima, apagando tudo o que já existia no banco.
      if (error) {
        setErroTela("Não deu para carregar os dados do administrativo. Recarregue a página antes de salvar qualquer coisa.");
      } else if (data) {
        const get = (key) => { const r = data.find(d => d.key === key); return Array.isArray(r?.value) ? r.value : []; };
        setFichas(get("fichas_tecnicas"));
        setFornecedores(get("fornecedores"));
        setCompras(get("compras"));
        setImpostos(get("impostos"));
      }
      setNotasFiscaisCount(count || 0);
      setLoading(false);
    });
  }, []);

  // Devolve { error } e só atualiza a tela quando o banco confirmou: antes o
  // upsert não era conferido, então a ficha técnica aparecia salva na tela e
  // sumia no próximo carregamento.
  const handleSave = async (key, value) => {
    setErroTela("");
    const { error } = await salvarCadastroAdministrativo(key, value);
    if (error) {
      setErroTela("Não deu para salvar. A alteração não foi gravada, tente de novo.");
      return { error };
    }
    if (key === "fichas_tecnicas") setFichas(value);
    if (key === "fornecedores")    setFornecedores(value);
    if (key === "compras")         setCompras(value);
    if (key === "impostos")        setImpostos(value);
    return { error: null };
  };

  const secaoAtual = SECOES.find(s => s.id === secao);

  return (
    <div className="admin-view" style={{ background: varColor(C.bg) }}>
      <div className="admin-view__header" style={{ padding: `${sz.pad - 4}px ${sz.pad}px` }}>
        <div className="admin-view__header-topo">
          {secao && (
            <button
              onClick={() => setSecao(null)}
              className="admin-view__btn-voltar"
            >
              <LuArrowLeft size={15} /> Voltar
            </button>
          )}
          <div>
            <div className="admin-view__titulo">{secaoAtual ? secaoAtual.label : "Gestão"}</div>
            <div className="admin-view__subtitulo">
              {secaoAtual ? secaoAtual.desc : "Selecione uma área para gerenciar"}
            </div>
          </div>
        </div>
      </div>

      <div className="admin-view__conteudo" style={{ padding: sz.pad }}>
        {erroTela && (
          <div className="admin-view__erro" role="alert">{erroTela}</div>
        )}
        {loading ? (
          <div className="admin-view__carregando">Carregando...</div>
        ) : !secao ? (
          <GradeInicial sz={sz} secoes={secoesVisiveis} onSelecionar={setSecao} onNavegar={navigate} fichas={fichas} fornecedores={fornecedores} compras={compras} impostos={impostos} notasFiscaisCount={notasFiscaisCount} />
        ) : (
          <>
            {secao === "fichas"       && <FichasTecnicasTab sz={sz} fichas={fichas}             products={products} estoque={estoque} onSave={handleSave} onDelete={handleSave} />}
            {secao === "fornecedores" && <FornecedoresTab   sz={sz} fornecedores={fornecedores} onSave={handleSave} onDelete={handleSave} />}
            {secao === "compras"      && <ComprasTab        sz={sz} compras={compras}           fornecedores={fornecedores} onSave={handleSave} onDelete={handleSave} />}
            {secao === "impostos"     && <ImpostosAdmin      sz={sz} />}
            {secao === "notas_fiscais" && (
              <NotasFiscaisTab
                sz={sz}
                fornecedores={fornecedores}
                onAddFornecedor={async (forn) => {
                  const nova = [...fornecedores, { ...FORN_VAZIO, ...forn, id: uid() }];
                  await handleSave("fornecedores", nova);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
