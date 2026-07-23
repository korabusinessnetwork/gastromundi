import { useState, useEffect, useMemo, useCallback } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { buscarConfigImpressao, salvarConfigImpressao, PERFIL_IMPRESSORA_PADRAO } from "@/lib/impressao";
import { gerarHtmlComPerfil } from "@/lib/impressao/drivers/browserRaster";
import { OPCOES_DRIVER } from "@/lib/impressao/drivers";
import { LuCircleCheck, LuCircleAlert, LuLoader, LuScissors, LuRefreshCw } from "react-icons/lu";
import "./PerfilImpressora.css";

// Documento de exemplo só pra preview — nunca é impresso de verdade,
// só usado localmente pra mostrar como o layout fica na largura
// escolhida (mesma renderização exata que sai numa venda real).
const DOCUMENTO_EXEMPLO = {
  tipo: "comprovante",
  identidade: { nome: "GastroMundi", logoUrl: null, endereco: "", cnpj: "", rodape: "Obrigado pela preferência!" },
  comanda: "42",
  itens: [
    { nome: "Hambúrguer artesanal", qty: 2, preco: 32.5, emoji: "🍔", obs: ["sem cebola"] },
    { nome: "Refrigerante lata", qty: 1, preco: 6, emoji: "🥤", obs: [] },
  ],
  subtotal: 71, valorTaxa: 7.1, ajuste: null, valorAjuste: 0, total: 78.1,
  pagamentos: [{ metodo: "pix", valor: 78.1, troco: 0 }], trocoTotal: 0,
  naoFiscal: false, avisoNaoFiscal: "",
};

export default function PerfilImpressora({ sz }) {
  const [perfil, setPerfil] = useState(PERFIL_IMPRESSORA_PADRAO);
  const [configCompleta, setConfigCompleta] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState(null); // null | "sucesso" | "erro"

  // Impressoras QZ Tray — só busca quando o driver ESC/POS é escolhido.
  const [impressorasQz, setImpressorasQz] = useState([]);
  const [statusQz, setStatusQz] = useState("idle"); // idle | buscando | ok | erro
  const [erroQz, setErroQz] = useState("");

  useEffect(() => {
    buscarConfigImpressao().then(({ data }) => {
      setConfigCompleta(data);
      setPerfil(data.perfilImpressora);
      setCarregando(false);
    });
  }, []);

  const atualizarCampo = (campo, valor) => setPerfil((prev) => ({ ...prev, [campo]: valor }));

  const buscarImpressorasQz = useCallback(async () => {
    setStatusQz("buscando");
    setErroQz("");
    try {
      const { listarImpressoras } = await import("@/lib/qztray");
      const lista = await listarImpressoras();
      setImpressorasQz(Array.isArray(lista) ? lista : [lista].filter(Boolean));
      setStatusQz("ok");
    } catch (e) {
      setErroQz(e?.message || "QZ Tray não encontrado. Verifique se está instalado e em execução.");
      setStatusQz("erro");
    }
  }, []);

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    setStatus(null);
    try {
      const config = { ...(configCompleta ?? {}), perfilImpressora: perfil };
      const { error } = await salvarConfigImpressao(config);
      setStatus(error ? "erro" : "sucesso");
      if (!error) setConfigCompleta(config);
    } finally {
      setSalvando(false);
      setTimeout(() => setStatus((s) => (s === "sucesso" ? null : s)), 2500);
    }
  };

  const htmlPreview = useMemo(() => gerarHtmlComPerfil(DOCUMENTO_EXEMPLO, perfil), [perfil]);

  if (carregando) {
    return <div className="perfil-impressora__carregando" style={{ color: varColor(C.muted) }}>Carregando…</div>;
  }

  return (
    <div className="perfil-impressora" style={{ gap: sz.pad }}>
      <div className="perfil-impressora__form" style={{ gap: sz.pad }}>

        {/* Largura do papel */}
        <div>
          <div className="perfil-impressora__label" style={{ color: varColor(C.muted) }}>Largura do papel</div>
          <div className="perfil-impressora__opcoes-largura">
            {[58, 80].map((mm) => (
              <button
                key={mm}
                type="button"
                onClick={() => atualizarCampo("larguraMm", mm)}
                className={`perfil-impressora__opcao-larga${perfil.larguraMm === mm ? " perfil-impressora__opcao-larga--ativa" : ""}`}
                style={{
                  borderColor: perfil.larguraMm === mm ? varColor(C.accent) : varColor(C.border),
                  background: perfil.larguraMm === mm ? "var(--gm-alow)" : varColor(C.surface),
                  color: perfil.larguraMm === mm ? varColor(C.accent) : varColor(C.text),
                }}
              >
                {mm}mm
              </button>
            ))}
          </div>
        </div>

        {/* Corte de papel */}
        <div className="perfil-impressora__linha-toggle">
          <div>
            <div className="perfil-impressora__label" style={{ color: varColor(C.muted), marginBottom: 0 }}>Corta o papel automaticamente</div>
            <div className="perfil-impressora__ajuda" style={{ color: varColor(C.muted) }}>Impressoras com guilhotina — dá um avanço de linha extra no fim para o corte não pegar o texto.</div>
          </div>
          <button
            type="button"
            onClick={() => atualizarCampo("cortaPapel", !perfil.cortaPapel)}
            className="perfil-impressora__toggle"
            style={{ background: perfil.cortaPapel ? varColor(C.green) : varColor(C.faint) }}
          >
            <span className="perfil-impressora__toggle-bolinha" style={{ left: perfil.cortaPapel ? 25 : 3 }} />
          </button>
        </div>

        {/* Tamanho da fonte */}
        <div>
          <div className="perfil-impressora__label" style={{ color: varColor(C.muted) }}>
            Tamanho da letra {perfil.fonteBase ? `(${perfil.fonteBase}px)` : "(padrão do modelo)"}
          </div>
          <div className="perfil-impressora__ajuda" style={{ color: varColor(C.muted), marginBottom: 8 }}>
            Se a impressora corta ou borra letra pequena, aumente aqui.
          </div>
          <input
            type="range"
            min={11}
            max={22}
            value={perfil.fonteBase || 13}
            onChange={(e) => atualizarCampo("fonteBase", Number(e.target.value))}
            className="perfil-impressora__slider"
          />
          {perfil.fonteBase != null && (
            <button
              type="button"
              onClick={() => atualizarCampo("fonteBase", null)}
              className="perfil-impressora__link-reset"
              style={{ color: varColor(C.accent) }}
            >
              Voltar ao padrão do modelo
            </button>
          )}
        </div>

        {/* Driver de impressão */}
        <div>
          <div className="perfil-impressora__label" style={{ color: varColor(C.muted) }}>Como imprimir</div>
          <div className="perfil-impressora__opcoes-driver">
            {OPCOES_DRIVER.map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                onClick={() => atualizarCampo("driver", opcao.id)}
                className={`perfil-impressora__opcao-driver${perfil.driver === opcao.id ? " perfil-impressora__opcao-driver--ativa" : ""}`}
                style={{
                  borderColor: perfil.driver === opcao.id ? varColor(C.accent) : varColor(C.border),
                  background: perfil.driver === opcao.id ? "var(--gm-alow)" : varColor(C.surface),
                  color: perfil.driver === opcao.id ? varColor(C.accent) : varColor(C.text),
                }}
              >
                {opcao.label}
              </button>
            ))}
          </div>
          {perfil.driver === "escpos-qztray" && (
            <div className="perfil-impressora__qz" style={{ borderColor: varColor(C.border), background: varColor(C.surface) }}>
              <div className="perfil-impressora__ajuda" style={{ color: varColor(C.muted) }}>
                Exige o app <strong>QZ Tray</strong> instalado e em execução neste computador. Sem certificado pago, aparece um aviso de segurança a cada impressão — isso é esperado e fica assim até uma assinatura ser contratada.
              </div>
              <button type="button" onClick={buscarImpressorasQz} className="perfil-impressora__btn-detectar" style={{ borderColor: varColor(C.border), color: varColor(C.text) }}>
                {statusQz === "buscando" ? <LuLoader size={14} className="perfil-impressora__spin" /> : <LuRefreshCw size={14} />}
                Detectar impressoras do QZ Tray
              </button>
              {statusQz === "erro" && (
                <div className="perfil-impressora__status perfil-impressora__status--erro">
                  <LuCircleAlert size={13} /> {erroQz}
                </div>
              )}
              {statusQz === "ok" && (
                <div className="perfil-impressora__lista-qz">
                  {impressorasQz.length === 0 && <div style={{ color: varColor(C.muted) }}>Nenhuma impressora encontrada.</div>}
                  {impressorasQz.map((nome) => (
                    <button
                      key={nome}
                      type="button"
                      onClick={() => atualizarCampo("impressoraQz", nome)}
                      className={`perfil-impressora__opcao-qz${perfil.impressoraQz === nome ? " perfil-impressora__opcao-qz--ativa" : ""}`}
                      style={{
                        borderColor: perfil.impressoraQz === nome ? varColor(C.accent) : varColor(C.border),
                        color: perfil.impressoraQz === nome ? varColor(C.accent) : varColor(C.text),
                      }}
                    >
                      {nome}
                    </button>
                  ))}
                </div>
              )}
              {perfil.impressoraQz && (
                <div className="perfil-impressora__status perfil-impressora__status--sucesso">
                  <LuScissors size={13} /> Impressora selecionada: {perfil.impressoraQz}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Salvar */}
        <div className="perfil-impressora__acoes">
          <button type="button" onClick={salvar} disabled={salvando} className="perfil-impressora__btn-salvar" style={{ background: varColor(C.accent) }}>
            {salvando ? "Salvando…" : "Salvar perfil"}
          </button>
          {status === "sucesso" && (
            <span className="perfil-impressora__status perfil-impressora__status--sucesso"><LuCircleCheck size={13} /> Salvo</span>
          )}
          {status === "erro" && (
            <span className="perfil-impressora__status perfil-impressora__status--erro"><LuCircleAlert size={13} /> Falha ao salvar</span>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="perfil-impressora__preview-coluna">
        <div className="perfil-impressora__label" style={{ color: varColor(C.muted) }}>Pré-visualização ({perfil.larguraMm}mm)</div>
        <div className="perfil-impressora__preview-moldura" style={{ borderColor: varColor(C.border), background: varColor(C.surface) }}>
          {/* sandbox="" → origem opaca e SEM execução de script: o preview é
              só HTML/CSS estático do cupom, nunca deve rodar JS injetado. */}
          <iframe title="Pré-visualização de impressão" srcDoc={htmlPreview} sandbox="" className="perfil-impressora__preview-iframe" />
        </div>
      </div>
    </div>
  );
}
