import { useState, useEffect } from "react";
import { LuX, LuTriangleAlert } from "react-icons/lu";
import { validarPauta } from "@/lib/pautas";
import "./PautaForm.css";

/**
 * Formulário de pauta — criar uma nova ou editar uma existente.
 *
 * Os três campos são exatamente as três coisas que a conversa de WhatsApp
 * perde: o que é, PARA QUE serve e o que já se sabe. Mais quem entra nessa.
 *
 * Por que é intuitiva (Princípio nº1): as perguntas estão escritas como
 * perguntas ("Para que serve?", "O que já sabemos?"), não como nomes de
 * campo de banco. Os envolvidos são botões com o nome de cada sócio — clicar
 * marca, clicar de novo desmarca, sem menu escondido. O botão "Salvar" só
 * liga quando dá para salvar (prevenção de erro > mensagem de erro), e o
 * único erro possível aparece em português logo acima dele.
 */
export default function PautaForm({ pauta = null, pessoas = [], onSalvar, onFechar }) {
  const editando = !!pauta;

  const [titulo,     setTitulo]     = useState(pauta?.titulo ?? "");
  const [intuito,    setIntuito]    = useState(pauta?.intuito ?? "");
  const [contexto,   setContexto]   = useState(pauta?.contexto ?? "");
  const [envolvidos, setEnvolvidos] = useState(pauta?.envolvidos ?? []);
  const [erro,       setErro]       = useState("");
  const [salvando,   setSalvando]   = useState(false);

  // Esc fecha — o mesmo reflexo de qualquer janela.
  useEffect(() => {
    const aoTeclar = (e) => { if (e.key === "Escape" && !salvando) onFechar?.(); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [salvando, onFechar]);

  const dados = { titulo, intuito, contexto, envolvidos };
  const { valido } = validarPauta(dados);

  const alternarPessoa = (slug) => {
    setEnvolvidos((atual) =>
      atual.includes(slug) ? atual.filter((s) => s !== slug) : [...atual, slug],
    );
    setErro("");
  };

  const salvar = async () => {
    if (salvando) return;
    const checagem = validarPauta(dados);
    if (!checagem.valido) { setErro(checagem.erro); return; }
    setSalvando(true); setErro("");
    const resultado = await onSalvar?.(dados);
    setSalvando(false);
    if (resultado?.error) { setErro(resultado.error.message || "Não conseguimos salvar. Tente de novo."); return; }
    onFechar?.();
  };

  return (
    <div className="pauta-form__fundo" role="dialog" aria-modal="true" aria-label={editando ? "Editar pauta" : "Nova pauta"}>
      <div className="pauta-form">
        <div className="pauta-form__topo">
          <h2 className="pauta-form__titulo">{editando ? "Editar pauta" : "Nova pauta"}</h2>
          <button type="button" className="pauta-form__fechar" onClick={() => onFechar?.()} aria-label="Fechar" disabled={salvando}>
            <LuX size={18} />
          </button>
        </div>

        <div className="pauta-form__corpo">
          <div className="pauta-form__campo">
            <label className="pauta-form__label" htmlFor="pauta-titulo">Qual é a pauta?</label>
            <input
              id="pauta-titulo"
              className="pauta-form__input"
              type="text"
              value={titulo}
              placeholder="Ex.: Fila de pedidos offline no PDV"
              maxLength={120}
              autoFocus
              disabled={salvando}
              onChange={(e) => { setTitulo(e.target.value); setErro(""); }}
            />
          </div>

          <div className="pauta-form__campo">
            <label className="pauta-form__label" htmlFor="pauta-intuito">Para que serve?</label>
            <textarea
              id="pauta-intuito"
              className="pauta-form__area"
              value={intuito}
              placeholder="O objetivo em uma ou duas frases: o que muda quando isso estiver pronto."
              maxLength={1000}
              rows={3}
              disabled={salvando}
              onChange={(e) => { setIntuito(e.target.value); setErro(""); }}
            />
          </div>

          <div className="pauta-form__campo">
            <label className="pauta-form__label" htmlFor="pauta-contexto">
              O que já sabemos? <span className="pauta-form__opcional">(opcional)</span>
            </label>
            <textarea
              id="pauta-contexto"
              className="pauta-form__area"
              value={contexto}
              placeholder="Links, decisões anteriores, restrições, onde mexer no código."
              maxLength={5000}
              rows={5}
              disabled={salvando}
              onChange={(e) => { setContexto(e.target.value); setErro(""); }}
            />
          </div>

          <div className="pauta-form__campo">
            <span className="pauta-form__label">
              Quem entra nessa? <span className="pauta-form__opcional">(opcional)</span>
            </span>
            <div className="pauta-form__pessoas">
              {pessoas.map((p) => {
                const marcado = envolvidos.includes(p.slug);
                return (
                  <button
                    key={p.slug}
                    type="button"
                    className={`pauta-form__pessoa${marcado ? " pauta-form__pessoa--marcado" : ""}`}
                    aria-pressed={marcado}
                    disabled={salvando}
                    onClick={() => alternarPessoa(p.slug)}
                  >
                    {p.nome}
                  </button>
                );
              })}
            </div>
          </div>

          {erro && (
            <div className="pauta-form__erro" role="alert">
              <LuTriangleAlert size={15} aria-hidden /> {erro}
            </div>
          )}
        </div>

        <div className="pauta-form__acoes">
          <button type="button" className="pauta-form__cancelar" onClick={() => onFechar?.()} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="pauta-form__salvar" onClick={salvar} disabled={!valido || salvando}>
            {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Criar pauta"}
          </button>
        </div>
      </div>
    </div>
  );
}
