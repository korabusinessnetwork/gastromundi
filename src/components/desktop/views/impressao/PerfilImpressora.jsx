import { useState, useEffect, useMemo, useCallback } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { buscarConfigImpressao, salvarConfigImpressao, PERFIL_IMPRESSORA_PADRAO } from "@/lib/impressao";
import { gerarHtmlComPerfil } from "@/lib/impressao/drivers/browserRaster";
import { imprimirDocumento, OPCOES_DRIVER } from "@/lib/impressao/drivers";
import { listarImpressorasPonte } from "@/lib/ponte";
import { LuCircleCheck, LuCircleAlert, LuLoader, LuRefreshCw, LuPrinter } from "react-icons/lu";
import "./PerfilImpressora.css";

// Documento de exemplo só pra preview/teste — nunca é uma venda real, só
// usado localmente pra mostrar como o layout fica na largura escolhida
// (mesma renderização exata que sai numa venda de verdade) e pra o botão
// "Imprimir teste" ter algo concreto pra mandar pro driver escolhido.
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

// Resume o destino de impressão da Ponte em uma linha legível — o mesmo
// formato { tipo, nome } | { tipo, host, porta } definido em src/lib/impressao.js.
function resumoImpressora(impressora) {
  if (!impressora) return "";
  if (impressora.tipo === "rede") return `${impressora.host}:${impressora.porta} (impressora de rede)`;
  return impressora.nome ?? "";
}

export default function PerfilImpressora({ sz }) {
  const [perfil, setPerfil] = useState(PERFIL_IMPRESSORA_PADRAO);
  const [configCompleta, setConfigCompleta] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState(null); // null | "sucesso" | "erro"

  // Detecção de impressoras via Ponte KORA — só entra em jogo quando o
  // driver escolhido é o ESC/POS (Ponte). "ausente" é diferente de "erro":
  // ausente = a Ponte não respondeu (não está rodando), erro = ela
  // respondeu algo inesperado. Guiar o dono de forma diferente em cada caso.
  const [statusPonte, setStatusPonte] = useState("idle"); // idle | buscando | ok | ausente | erro
  const [impressorasPonte, setImpressorasPonte] = useState([]);
  const [erroPonte, setErroPonte] = useState("");

  // Impressora de rede (IP:porta) — formulário simples, porta já vem
  // preenchida com o padrão ESC/POS (9100) pra não obrigar o dono a saber isso.
  const [redeHost, setRedeHost] = useState("");
  const [redePorta, setRedePorta] = useState("9100");

  // Imprimir teste — usa o driver já selecionado no perfil, exatamente
  // como uma impressão de verdade sairia.
  const [teste, setTeste] = useState(null); // null | "testando" | "ok" | "erro"
  const [erroTeste, setErroTeste] = useState("");

  useEffect(() => {
    buscarConfigImpressao().then(({ data }) => {
      setConfigCompleta(data);
      setPerfil(data.perfilImpressora);
      if (data.perfilImpressora?.impressora?.tipo === "rede") {
        setRedeHost(data.perfilImpressora.impressora.host ?? "");
        setRedePorta(String(data.perfilImpressora.impressora.porta ?? 9100));
      }
      setCarregando(false);
    });
  }, []);

  const atualizarCampo = (campo, valor) => setPerfil((prev) => ({ ...prev, [campo]: valor }));

  const buscarImpressorasNaPonte = useCallback(async () => {
    setStatusPonte("buscando");
    setErroPonte("");
    const { data, error } = await listarImpressorasPonte();
    if (error) {
      // Timeout/conexão recusada é o caso comum (Ponte fechada) — mensagem
      // de ação, não de erro técnico. Qualquer outra coisa é erro mesmo.
      const semConexao = error.name === "AbortError" || /failed to fetch|network|fetch/i.test(error.message || "");
      setImpressorasPonte([]);
      if (semConexao) {
        setStatusPonte("ausente");
      } else {
        setStatusPonte("erro");
        setErroPonte(error.message || "A Ponte respondeu algo inesperado.");
      }
      return;
    }
    setImpressorasPonte(data?.impressoras ?? []);
    setStatusPonte("ok");
  }, []);

  const escolherImpressoraWindows = (nome) => atualizarCampo("impressora", { tipo: "windows", nome });

  const usarImpressoraDeRede = () => {
    const host = redeHost.trim();
    if (!host) return;
    const porta = Number(redePorta) || 9100;
    atualizarCampo("impressora", { tipo: "rede", host, porta });
  };

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

  // Prevenção de erro (princípio nº1): sem impressora escolhida, a Ponte
  // recusaria o trabalho — desabilita o teste antes de deixar o dono errar.
  const precisaEscolherImpressora = perfil.driver === "escpos-ponte" && !perfil.impressora;

  const imprimirTeste = async () => {
    if (teste === "testando" || precisaEscolherImpressora) return;
    setTeste("testando");
    setErroTeste("");
    const { error } = await imprimirDocumento(DOCUMENTO_EXEMPLO, perfil);
    if (error) {
      setTeste("erro");
      setErroTeste(error.message ?? "Não foi possível imprimir o teste.");
      return;
    }
    setTeste("ok");
    setTimeout(() => setTeste((s) => (s === "ok" ? null : s)), 3000);
  };

  const htmlPreview = useMemo(() => gerarHtmlComPerfil(DOCUMENTO_EXEMPLO, perfil), [perfil]);

  if (carregando) {
    return <div className="perfil-impressora__carregando">Carregando…</div>;
  }

  return (
    <div className="perfil-impressora">
      <div className="perfil-impressora__colunas">
        <div className="perfil-impressora__form">

          {/* ── Seção 1 — Impressora ────────────────────────────────── */}
          <section className="perfil-impressora__secao">
            <h3 className="perfil-impressora__titulo-secao">Impressora</h3>

            <div className="perfil-impressora__campo">
              <div className="perfil-impressora__label">Como imprimir</div>
              <div className="perfil-impressora__opcoes-driver">
                {OPCOES_DRIVER.map((opcao) => (
                  <button
                    key={opcao.id}
                    type="button"
                    onClick={() => atualizarCampo("driver", opcao.id)}
                    className={`perfil-impressora__opcao-driver${perfil.driver === opcao.id ? " perfil-impressora__opcao-driver--ativa" : ""}`}
                  >
                    <span className="perfil-impressora__opcao-driver-titulo">{opcao.label}</span>
                    {opcao.ajuda && <span className="perfil-impressora__opcao-driver-ajuda">{opcao.ajuda}</span>}
                  </button>
                ))}
              </div>
            </div>

            {perfil.driver === "escpos-ponte" && (
              <div className="perfil-impressora__ponte">
                {perfil.impressora && (
                  <div className="perfil-impressora__status perfil-impressora__status--sucesso">
                    <LuCircleCheck size={13} /> Impressora selecionada: {resumoImpressora(perfil.impressora)}
                  </div>
                )}

                <button
                  type="button"
                  onClick={buscarImpressorasNaPonte}
                  disabled={statusPonte === "buscando"}
                  className="perfil-impressora__btn-detectar"
                >
                  {statusPonte === "buscando"
                    ? <LuLoader size={14} className="perfil-impressora__spin" color={varColor(C.blue)} />
                    : <LuRefreshCw size={14} />}
                  Procurar impressoras
                </button>

                {statusPonte === "ausente" && (
                  <div className="perfil-impressora__status perfil-impressora__status--atencao">
                    <LuCircleAlert size={13} color={varColor(C.warn)} /> A Ponte não está rodando neste computador. Abra a pasta
                    "ponte" e rode "node servidor.js" — depois é só procurar de novo.
                  </div>
                )}
                {statusPonte === "erro" && (
                  <div className="perfil-impressora__status perfil-impressora__status--erro">
                    <LuCircleAlert size={13} /> {erroPonte}
                  </div>
                )}
                {statusPonte === "ok" && impressorasPonte.length === 0 && (
                  <div className="perfil-impressora__status perfil-impressora__status--atencao">
                    <LuCircleAlert size={13} color={varColor(C.warn)} /> Nenhuma impressora encontrada neste computador.
                  </div>
                )}
                {statusPonte === "ok" && impressorasPonte.length > 0 && (
                  <div className="perfil-impressora__lista-impressoras">
                    {impressorasPonte.map((imp) => {
                      const ativo = perfil.impressora?.tipo === "windows" && perfil.impressora?.nome === imp.nome;
                      return (
                        <button
                          key={imp.nome}
                          type="button"
                          onClick={() => escolherImpressoraWindows(imp.nome)}
                          className={`perfil-impressora__opcao-impressora${ativo ? " perfil-impressora__opcao-impressora--ativa" : ""}`}
                        >
                          <LuPrinter size={14} />
                          {imp.nome}
                          {imp.padrao && <span className="perfil-impressora__tag-padrao">padrão do Windows</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="perfil-impressora__separador">ou impressora de rede</div>
                <div className="perfil-impressora__rede">
                  <input
                    type="text"
                    placeholder="IP da impressora, ex: 192.168.0.50"
                    value={redeHost}
                    onChange={(e) => setRedeHost(e.target.value)}
                    className="perfil-impressora__input perfil-impressora__input--host"
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Porta"
                    value={redePorta}
                    onChange={(e) => setRedePorta(e.target.value)}
                    className="perfil-impressora__input perfil-impressora__input--porta"
                  />
                  <button
                    type="button"
                    onClick={usarImpressoraDeRede}
                    disabled={!redeHost.trim()}
                    className="perfil-impressora__btn-usar-rede"
                  >
                    Usar esta impressora
                  </button>
                </div>
              </div>
            )}

            <div className="perfil-impressora__acoes">
              <button
                type="button"
                onClick={imprimirTeste}
                disabled={teste === "testando" || precisaEscolherImpressora}
                title={precisaEscolherImpressora ? "Escolha uma impressora acima primeiro" : undefined}
                className="perfil-impressora__btn-teste"
              >
                {teste === "testando"
                  ? <LuLoader size={14} className="perfil-impressora__spin" color={varColor(C.blue)} />
                  : <LuPrinter size={14} />}
                {teste === "testando" ? "Imprimindo…" : "Imprimir teste"}
              </button>
              {teste === "ok" && (
                <span className="perfil-impressora__status perfil-impressora__status--sucesso"><LuCircleCheck size={13} /> Enviado</span>
              )}
              {teste === "erro" && (
                <span className="perfil-impressora__status perfil-impressora__status--erro"><LuCircleAlert size={13} /> {erroTeste}</span>
              )}
              {precisaEscolherImpressora && teste !== "testando" && (
                <span className="perfil-impressora__ajuda">Escolha uma impressora acima para poder testar</span>
              )}
            </div>
          </section>

          {/* ── Seção 2 — Layout da comanda ─────────────────────────── */}
          <section className="perfil-impressora__secao">
            <h3 className="perfil-impressora__titulo-secao">Layout da comanda</h3>

            <div className="perfil-impressora__campo">
              <div className="perfil-impressora__label">Largura do papel</div>
              <div className="perfil-impressora__opcoes-largura">
                {[58, 80].map((mm) => (
                  <button
                    key={mm}
                    type="button"
                    onClick={() => atualizarCampo("larguraMm", mm)}
                    className={`perfil-impressora__opcao-larga${perfil.larguraMm === mm ? " perfil-impressora__opcao-larga--ativa" : ""}`}
                  >
                    {mm}mm
                  </button>
                ))}
              </div>
            </div>

            <div className="perfil-impressora__linha-toggle">
              <div>
                <div className="perfil-impressora__label perfil-impressora__label--inline">Corta o papel automaticamente</div>
                <div className="perfil-impressora__ajuda">Impressoras com guilhotina — dá um avanço de linha extra no fim para o corte não pegar o texto.</div>
              </div>
              <button
                type="button"
                onClick={() => atualizarCampo("cortaPapel", !perfil.cortaPapel)}
                className={`perfil-impressora__toggle${perfil.cortaPapel ? " perfil-impressora__toggle--on" : ""}`}
                role="switch"
                aria-checked={perfil.cortaPapel}
              >
                <span className="perfil-impressora__toggle-bolinha" />
              </button>
            </div>

            <div className="perfil-impressora__campo">
              <div className="perfil-impressora__label">
                Tamanho da letra {perfil.fonteBase ? `(${perfil.fonteBase}px)` : "(padrão do modelo)"}
              </div>
              <div className="perfil-impressora__ajuda perfil-impressora__ajuda--slider">
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
                >
                  Voltar ao padrão do modelo
                </button>
              )}
            </div>
          </section>

          {/* Salvar */}
          <div className="perfil-impressora__acoes">
            <button type="button" onClick={salvar} disabled={salvando} className="perfil-impressora__btn-salvar">
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            {status === "sucesso" && (
              <span className="perfil-impressora__status perfil-impressora__status--sucesso"><LuCircleCheck size={13} /> Salvo</span>
            )}
            {status === "erro" && (
              <span className="perfil-impressora__status perfil-impressora__status--erro"><LuCircleAlert size={13} /> Falha ao salvar</span>
            )}
          </div>
        </div>

        {/* Preview ao vivo — é o que torna a tela intuitiva: o dono vê a
            comanda mudar enquanto mexe, em vez de imaginar o resultado. */}
        <div className="perfil-impressora__preview-coluna">
          <div className="perfil-impressora__label">Pré-visualização ({perfil.larguraMm}mm)</div>
          <div className="perfil-impressora__preview-moldura">
            <iframe title="Pré-visualização de impressão" srcDoc={htmlPreview} className="perfil-impressora__preview-iframe" />
          </div>
        </div>
      </div>
    </div>
  );
}
