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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: sz.fontBase + 1 }}>
            <LuHistory size={19} color={varColor(C.accent)} /> Histórico de Impressão
          </div>
          <div style={{ fontSize: sz.fontSm, color: varColor(C.muted), marginTop: 4, lineHeight: 1.5 }}>
            Tudo o que foi mandado imprimir, do mais recente ao mais antigo. Precisou de outra via?
            Clique em <strong>Reimprimir</strong> — sai na impressora deste computador.
          </div>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          title="Atualizar"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: `1px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.muted), cursor: loading ? "wait" : "pointer", fontWeight: 600, fontSize: sz.fontSm, fontFamily: "inherit", flexShrink: 0 }}
        >
          <LuRefreshCw size={14} style={loading ? { animation: "spin 1s linear infinite" } : undefined} />
          Atualizar
        </button>
      </div>

      {/* Erro ao carregar */}
      {erro && (
        <div style={{ padding: "10px 16px", borderRadius: 10, background: `${alfa(C.red, "0e")}`, border: `1px solid ${alfa(C.red, "33")}`, fontSize: sz.fontSm, color: varColor(C.red), display: "flex", alignItems: "center", gap: 8 }}>
          <LuCircleAlert size={14} style={{ flexShrink: 0 }} /> {erro}
        </div>
      )}

      {/* Carregando */}
      {loading ? (
        <div style={{ padding: "40px 24px", textAlign: "center", color: varColor(C.muted), display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <LuLoader size={22} style={{ animation: "spin 1s linear infinite" }} />
          <div style={{ fontSize: sz.fontBase }}>Carregando histórico…</div>
        </div>
      ) : trabalhos.length === 0 ? (
        /* Vazio */
        <div style={{ background: varColor(C.card), border: `1px solid var(${C.border})`, borderRadius: 14, padding: "40px 24px", textAlign: "center", color: varColor(C.muted) }}>
          <LuPrinter size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>Nada impresso ainda</div>
          <div style={{ fontSize: sz.fontSm, marginTop: 4 }}>As comandas enviadas para impressão aparecem aqui.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {trabalhos.map((t) => {
            const ap = APARENCIA_STATUS[t.status] ?? { rotulo: t.status, cor: C.muted };
            const st = reimprimindo[t.id];
            const ocupado = st === "idle";
            return (
              <div
                key={t.id}
                style={{ background: varColor(C.card), border: `1px solid var(${C.border})`, borderRadius: 14, padding: `${sz.padSm + 2}px ${sz.pad}px`, display: "flex", alignItems: "center", gap: 14 }}
              >
                {/* Ícone */}
                <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: `${alfa(ap.cor, "15")}`, border: `1px solid ${alfa(ap.cor, "33")}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <LuPrinter size={19} color={varColor(ap.cor)} />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: sz.fontBase, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tituloTrabalho(t.documento)}
                    {t.local_nome && <span style={{ fontWeight: 500, color: varColor(C.muted) }}> · {t.local_nome}</span>}
                  </div>
                  <div style={{ fontSize: sz.fontSm, color: varColor(C.muted), marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                    <LuClock size={12} style={{ flexShrink: 0 }} /> {formatarQuando(t.criado_em)}
                    {resumoItens(t.documento) && <span style={{ opacity: 0.5 }}>·</span>}
                    {resumoItens(t.documento)}
                  </div>
                  {t.status === "erro" && t.erro && (
                    <div style={{ fontSize: sz.fontSm - 1, color: varColor(C.red), marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.erro}
                    </div>
                  )}
                </div>

                {/* Badge de status */}
                <span style={{ fontSize: sz.fontSm - 1, fontWeight: 700, background: `${alfa(ap.cor, "15")}`, border: `1px solid ${alfa(ap.cor, "44")}`, color: varColor(ap.cor), padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {ap.rotulo}
                </span>

                {/* Reimprimir */}
                <button
                  onClick={() => reimprimir(t)}
                  disabled={ocupado}
                  title="Reimprimir nesta máquina"
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 9, flexShrink: 0,
                    border: `1.5px solid ${st === "ok" ? varColor(C.green) + "66" : st === "erro" ? varColor(C.red) + "66" : varColor(C.border)}`,
                    background: st === "ok" ? `${alfa(C.green, "0f")}` : st === "erro" ? `${alfa(C.red, "0f")}` : varColor(C.surface),
                    color: st === "ok" ? varColor(C.green) : st === "erro" ? varColor(C.red) : varColor(C.text),
                    cursor: ocupado ? "not-allowed" : "pointer",
                    fontWeight: 600, fontSize: sz.fontSm, fontFamily: "inherit", transition: "border-color 0.15s, background 0.15s",
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
