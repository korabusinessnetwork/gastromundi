import { useState, useEffect, useCallback } from "react";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { buscarConfigImpressao } from "@/lib/impressao";
import { imprimirDocumento } from "@/lib/impressao/drivers";
import { resolverPerfilDoLocal } from "@/lib/impressao/resolverPerfil";
import { listarHistoricoImpressao, reimprimirTrabalho } from "@/lib/impressao/historico";
import {
  LuPrinter, LuRefreshCw, LuCircleAlert, LuLoader,
  LuSquareCheckBig, LuHistory, LuClock,
} from "react-icons/lu";
import "./HistoricoImpressao.css";

// Rótulo + cor de cada status, em português do dia a dia (sem jargão técnico).
const APARENCIA_STATUS = {
  impresso:    { rotulo: "Impresso",    cor: C.green },
  pendente:    { rotulo: "Na fila",     cor: C.blue  },
  processando: { rotulo: "Imprimindo…", cor: C.accent },
  erro:        { rotulo: "Falhou",      cor: C.red   },
};

function formatarQuando(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Resumo curto do documento pra identificar a comanda numa olhada.
function tituloTrabalho(doc) {
  const partes = [];
  if (doc?.comanda != null) partes.push(`Comanda ${doc.comanda}`);
  if (doc?.mesa != null) partes.push(`Mesa ${doc.mesa}`);
  if (partes.length === 0) partes.push("Via de produção");
  return partes.join(" · ");
}

function resumoItens(doc) {
  const itens = Array.isArray(doc?.itens) ? doc.itens : [];
  if (itens.length === 0) return "";
  const nomes = itens.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ""}${i.nome}`);
  const visiveis = nomes.slice(0, 3).join(", ");
  return nomes.length > 3 ? `${visiveis} +${nomes.length - 3}` : visiveis;
}

export default function HistoricoImpressao({ sz }) {
  const [trabalhos, setTrabalhos] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [erro, setErro]           = useState("");
  const [reimprimindo, setReimprimindo] = useState({}); // { [id]: "idle"|"ok"|"erro" }

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listarHistoricoImpressao({ limite: 50 });
    setTrabalhos(data ?? []);
    setErro(error ? (error.message ?? "Não foi possível carregar o histórico.") : "");
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const reimprimir = async (trabalho) => {
    if (reimprimindo[trabalho.id] === "idle") return;
    setReimprimindo((p) => ({ ...p, [trabalho.id]: "idle" }));
    const { data: configImpressao } = await buscarConfigImpressao();
    const { error } = await reimprimirTrabalho(trabalho, {
      configImpressao,
      imprimir: imprimirDocumento,
      resolverPerfil: resolverPerfilDoLocal,
    });
    setReimprimindo((p) => ({ ...p, [trabalho.id]: error ? "erro" : "ok" }));
    setTimeout(() => setReimprimindo((p) => ({ ...p, [trabalho.id]: undefined })), 4000);
  };

  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: sz.pad }}>

      {/* Cabeçalho explicativo */}
      <div className="historico-impressao__cabecalho">
        <div className="historico-impressao__titulo-wrapper">
          <div className="historico-impressao__titulo">
            <LuHistory size={19} color={varColor(C.accent)} /> Histórico de Impressão
          </div>
          <div className="historico-impressao__descricao" style={{ color: varColor(C.muted) }}>
            Tudo o que foi mandado imprimir, do mais recente ao mais antigo. Precisou de outra via?
            Clique em <strong>Reimprimir</strong> — sai na impressora deste computador.
          </div>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="historico-impressao__btn-atualizar"
          title="Atualizar"
          style={{ borderColor: `var(${C.border})`, color: varColor(C.muted) }}
        >
          <LuRefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          Atualizar
        </button>
      </div>

      {/* Erro ao carregar */}
      {erro && (
        <div className="historico-impressao__erro" style={{ background: `${alfa(C.red, "0e")}`, border: `1px solid ${alfa(C.red, "33")}`, color: varColor(C.red) }}>
          <LuCircleAlert size={14} style={{ flexShrink: 0 }} /> {erro}
        </div>
      )}

      {/* Carregando */}
      {loading ? (
        <div className="historico-impressao__carregando" style={{ color: varColor(C.muted) }}>
          <LuLoader size={22} style={{ animation: "spin 1s linear infinite" }} />
          <div className="historico-impressao__carregando-texto">Carregando histórico…</div>
        </div>
      ) : trabalhos.length === 0 ? (
        /* Vazio */
        <div className="historico-impressao__vazio" style={{ borderColor: `var(${C.border})`, color: varColor(C.muted) }}>
          <LuPrinter size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div className="historico-impressao__vazio-titulo">Nada impresso ainda</div>
          <div className="historico-impressao__vazio-descricao">As comandas enviadas para impressão aparecem aqui.</div>
        </div>
      ) : (
        <div className="historico-impressao__lista">
          {trabalhos.map((t) => {
            const ap = APARENCIA_STATUS[t.status] ?? { rotulo: t.status, cor: C.muted };
            const st = reimprimindo[t.id];
            const ocupado = st === "idle";
            return (
              <div
                key={t.id}
                className="historico-impressao__item"
                style={{ background: varColor(C.card), borderColor: `var(${C.border})`, padding: `${sz.padSm + 2}px ${sz.pad}px` }}
              >
                {/* Ícone */}
                <div className="historico-impressao__item-icone" style={{ background: `${alfa(ap.cor, "15")}`, borderColor: `${alfa(ap.cor, "33")}` }}>
                  <LuPrinter size={19} color={varColor(ap.cor)} />
                </div>

                {/* Info */}
                <div className="historico-impressao__item-info">
                  <div className="historico-impressao__item-titulo" style={{ color: varColor(C.text) }}>
                    {tituloTrabalho(t.documento)}
                    {t.local_nome && <span className="historico-impressao__item-local"> · {t.local_nome}</span>}
                  </div>
                  <div className="historico-impressao__item-meta" style={{ color: varColor(C.muted) }}>
                    <LuClock size={12} style={{ flexShrink: 0 }} /> {formatarQuando(t.criado_em)}
                    {resumoItens(t.documento) && <span style={{ opacity: 0.5 }}>·</span>}
                    {resumoItens(t.documento)}
                  </div>
                  {t.status === "erro" && t.erro && (
                    <div className="historico-impressao__item-erro">
                      {t.erro}
                    </div>
                  )}
                </div>

                {/* Badge de status */}
                <span className="historico-impressao__badge-status" style={{ background: `${alfa(ap.cor, "15")}`, borderColor: `${alfa(ap.cor, "44")}`, color: varColor(ap.cor) }}>
                  {ap.rotulo}
                </span>

                {/* Reimprimir */}
                <button
                  onClick={() => reimprimir(t)}
                  disabled={ocupado}
                  className="historico-impressao__btn-reimprimir"
                  title="Reimprimir nesta máquina"
                  style={{
                    borderColor: st === "ok" ? varColor(C.green) + "66" : st === "erro" ? varColor(C.red) + "66" : varColor(C.border),
                    background: st === "ok" ? `${alfa(C.green, "0f")}` : st === "erro" ? `${alfa(C.red, "0f")}` : varColor(C.surface),
                    color: st === "ok" ? varColor(C.green) : st === "erro" ? varColor(C.red) : varColor(C.text),
                  }}
                >
                  {ocupado
                    ? <LuLoader size={13} style={{ animation: "spin 1s linear infinite" }} />
                    : st === "ok"
                      ? <LuSquareCheckBig size={13} />
                      : st === "erro"
                        ? <LuCircleAlert size={13} />
                        : <LuRefreshCw size={13} />}
                  {st === "ok" ? "Enviado!" : st === "erro" ? "Erro" : "Reimprimir"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
