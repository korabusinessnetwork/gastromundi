import { useState } from "react";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { verificarSenhaUsuario } from "@/lib/adminAuth";
import { useApp } from "@/context/AppContext";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { validarMovimento, exigeAutorizacao, limiteSangriaValido, lerValor } from "@/lib/caixaMovimentos";
import { round2 } from "@/lib/vendas";
import { montarComprovanteMovimento } from "@/lib/impressao";
import ImprimirComprovanteCaixa from "./ImprimirComprovanteCaixa";
import "./MovimentoCaixaModal.css";

const fmtR = (v) => `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;

/**
 * Sangria e suprimento (F005) — a única tela onde dinheiro sai da gaveta no
 * meio do turno com registro.
 *
 * Por que é intuitiva: a primeira coisa na tela são dois botões grandes que
 * dizem o que vai acontecer com o dinheiro ("Retirar" / "Colocar"), não o
 * jargão sozinho; logo abaixo, em destaque, quanto tem na gaveta AGORA — que
 * é a pergunta que o operador faria antes de retirar. O botão de confirmar
 * fica desabilitado com o motivo escrito ao lado enquanto falta algo, então
 * não existe caminho para errar e só descobrir depois (Princípio nº 1).
 */
export default function MovimentoCaixaModal({
  disponivel = 0,
  limite,
  autorizadores = [],
  podeAutorizarSozinho = false,
  onConfirm,
  onClose,
}) {
  const { tenant, currentUser } = useApp();
  const [tipo,    setTipo]    = useState("sangria");
  const [valor,   setValor]   = useState("");
  const [motivo,  setMotivo]  = useState("");
  const [autorizador, setAutorizador] = useState(autorizadores[0]?.username ?? "");
  const [senha,   setSenha]   = useState("");
  const [senhaErro, setSenhaErro] = useState("");
  const [erro,    setErro]    = useState("");
  const [salvando, setSalvando] = useState(false);
  // Passo de sucesso: registrado o movimento, a tela vira o comprovante
  // (com botão de imprimir) em vez de fechar direto — o operador tem o
  // que anexar à gaveta. `null` = ainda no formulário.
  const [registrado, setRegistrado] = useState(null);

  const cor = tipo === "sangria" ? C.red : C.green;
  const limiteEfetivo = limiteSangriaValido(limite);

  const { ok, erro: motivoBloqueio } = validarMovimento({ tipo, valor, motivo, disponivel });
  // Acima do limite: o CAIXA.md manda pedir autorização. Quem já é
  // admin/gerente autoriza a si mesmo — pedir a própria senha seria teatro.
  const precisaSenha = !podeAutorizarSozinho
    && exigeAutorizacao({ tipo, valor: lerValor(valor), limite: limiteEfetivo });
  const senhaPronta  = !precisaSenha || (!!autorizador && senha.trim() !== "");
  const pode = ok && senhaPronta && !salvando;

  const pendencia = !ok
    ? motivoBloqueio
    : (precisaSenha && !senhaPronta ? "Peça ao gerente para autorizar a retirada." : "");

  const confirmar = async () => {
    if (!pode) return;
    setSalvando(true);
    setErro(""); setSenhaErro("");
    try {
      let autorizadoPor = null;
      if (precisaSenha) {
        const r = await verificarSenhaUsuario(autorizador, senha);
        if (!r.ok) {
          setSenhaErro(r.erro || "Senha incorreta para este gerente.");
          return;
        }
        autorizadoPor = autorizador;
      }
      const v = lerValor(valor);
      const { error } = await onConfirm({
        tipo,
        valor: v,
        motivo: motivo.trim(),
        autorizadoPor,
        disponivel,
      });
      // Erro mantém o modal aberto: o operador precisa saber que o dinheiro
      // NÃO foi registrado — senão a gaveta e o sistema se separam em silêncio.
      if (error) {
        setErro(error.message || "Não foi possível registrar agora. Tente novamente.");
        return;
      }
      // Sucesso: avança para o comprovante em vez de fechar.
      setRegistrado({
        tipo,
        valor: v,
        motivo: motivo.trim(),
        autorizadoPor,
        disponivelDepois: round2(tipo === "sangria" ? disponivel - v : disponivel + v),
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      {...fecharAoClicarFora(onClose)}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 400, padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-label="Movimentar dinheiro do caixa"
        style={{
          background: varColor(C.card), borderRadius: 20, padding: 28,
          width: "100%", maxWidth: 460, boxSizing: "border-box",
          border: `1px solid var(${C.border})`,
          display: "flex", flexDirection: "column", gap: 18,
          maxHeight: "90vh", overflowY: "auto",
        }}
      >
        {registrado ? (
          <>
            {/* Passo de sucesso — registrado, agora o comprovante */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                  background: alfa(C.green, "18"), border: `1.5px solid ${alfa(C.green, "44")}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ✓
              </div>
              <div>
                <div style={{ fontWeight: 800 }}>
                  {registrado.tipo === "sangria" ? "Retirada registrada" : "Entrada registrada"}
                </div>
                <div style={{ color: varColor(C.muted), marginTop: 2 }}>
                  {fmtR(registrado.valor)} · dinheiro na gaveta agora {fmtR(registrado.disponivelDepois)}
                </div>
              </div>
            </div>

            <ImprimirComprovanteCaixa
              montarDocumento={(configImpressao) => montarComprovanteMovimento({
                ...registrado,
                autor: currentUser?.name,
                tenant,
                configImpressao,
              })}
            />

            <button
              type="button"
              onClick={onClose}
              style={{
                padding: 13, borderRadius: 10, border: "none",
                background: varColor(C.green), cursor: "pointer",
                fontWeight: 700, fontFamily: "inherit",
              }}
            >
              Concluir
            </button>
          </>
        ) : (
        <>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            className="movimento-caixa__icone-header"
            style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              background: alfa(cor, "18"), border: `1.5px solid ${alfa(cor, "44")}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            💵
          </div>
          <div>
            <div className="movimento-caixa__titulo" style={{ fontWeight: 800 }}>
              Movimentar dinheiro do caixa
            </div>
            <div className="movimento-caixa__subtitulo" style={{ color: varColor(C.muted), marginTop: 2 }}>
              Fica registrado com seu nome e o motivo
            </div>
          </div>
        </div>

        {/* Escolha do tipo — a primeira decisão, em alvo grande de toque */}
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { id: "sangria",    titulo: "Retirar",  ajuda: "Sangria — levar ao cofre",  cor: C.red   },
            { id: "suprimento", titulo: "Colocar",  ajuda: "Suprimento — troco",        cor: C.green },
          ].map(op => {
            const ativo = tipo === op.id;
            return (
              <button
                key={op.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => { setTipo(op.id); setErro(""); setSenhaErro(""); }}
                className="movimento-caixa__tipo"
                style={{
                  flex: 1, padding: "14px 10px", borderRadius: 14, cursor: "pointer",
                  background: ativo ? alfa(op.cor, "18") : "none",
                  border: `1.5px solid ${ativo ? varColor(op.cor) : `var(${C.border})`}`,
                  color: ativo ? varColor(op.cor) : varColor(C.muted),
                  fontFamily: "inherit",
                }}
              >
                <div className="movimento-caixa__tipo-titulo" style={{ fontWeight: 800 }}>{op.titulo}</div>
                <div className="movimento-caixa__tipo-ajuda" style={{ marginTop: 2 }}>{op.ajuda}</div>
              </button>
            );
          })}
        </div>

        {/* A pergunta que o operador faria antes de retirar */}
        <div
          className="movimento-caixa__disponivel"
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 14px", borderRadius: 12,
            background: varColor(C.surface), border: `1px solid var(${C.border})`,
          }}
        >
          <span style={{ color: varColor(C.muted) }}>Dinheiro na gaveta agora</span>
          <strong className="movimento-caixa__disponivel-valor">{fmtR(disponivel)}</strong>
        </div>

        {/* Valor */}
        <div>
          <div className="movimento-caixa__label" style={{
            fontWeight: 700, color: varColor(C.muted),
            textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8,
          }}>
            Valor (R$)
          </div>
          <div style={{ position: "relative" }}>
            <span className="movimento-caixa__simbolo-moeda" style={{
              position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
              color: varColor(C.muted), fontWeight: 600,
            }}>
              R$
            </span>
            <input
              className="movimento-caixa__input"
              autoFocus
              type="number"
              min="0"
              step="0.01"
              value={valor}
              onChange={e => { setValor(e.target.value); setErro(""); }}
              placeholder="0,00"
              aria-label="Valor do movimento"
              style={{
                width: "100%", padding: "14px 16px 14px 48px",
                borderRadius: 12, border: "1.5px solid var(--gm-input-border)",
                background: "var(--gm-input-bg)", color: varColor(C.text),
                fontWeight: 700, boxSizing: "border-box", fontFamily: "inherit", outline: "none",
              }}
            />
          </div>
        </div>

        {/* Motivo — obrigatório, é o que a conferência lê depois */}
        <div>
          <div className="movimento-caixa__label" style={{
            fontWeight: 700, color: varColor(C.muted),
            textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8,
          }}>
            Motivo
          </div>
          <textarea
            className="movimento-caixa__textarea"
            value={motivo}
            onChange={e => { setMotivo(e.target.value); setErro(""); }}
            rows={2}
            placeholder={tipo === "sangria" ? "Ex.: levado ao cofre" : "Ex.: reforço de troco"}
            aria-label="Motivo do movimento"
            style={{
              width: "100%", boxSizing: "border-box", resize: "vertical",
              borderRadius: 12, border: "1.5px solid var(--gm-input-border)",
              background: "var(--gm-input-bg)", color: varColor(C.text),
              padding: "12px 14px", fontFamily: "inherit", outline: "none",
            }}
          />
        </div>

        {/* Autorização de gerente acima do limite (CAIXA.md) */}
        {precisaSenha && (
          <div style={{
            padding: 14, borderRadius: 12,
            background: alfa(C.warn, "12"),
            border: `1px solid ${alfa(C.warn, "44")}`,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div className="movimento-caixa__aviso" style={{ fontWeight: 700 }}>
              Retirada acima de {fmtR(limiteEfetivo)} precisa de um gerente
            </div>
            <select
              className="movimento-caixa__select"
              value={autorizador}
              onChange={e => { setAutorizador(e.target.value); setSenhaErro(""); }}
              aria-label="Quem autoriza"
              style={{
                width: "100%", boxSizing: "border-box", borderRadius: 10,
                border: "1.5px solid var(--gm-input-border)",
                background: "var(--gm-input-bg)", color: varColor(C.text),
                padding: "10px 12px", fontFamily: "inherit",
              }}
            >
              {autorizadores.length === 0 && <option value="">Nenhum gerente cadastrado</option>}
              {autorizadores.map(u => (
                <option key={u.username} value={u.username}>{u.name || u.username}</option>
              ))}
            </select>
            <input
              className="movimento-caixa__senha"
              type="password"
              value={senha}
              onChange={e => { setSenha(e.target.value); setSenhaErro(""); }}
              placeholder="Senha do gerente"
              aria-label="Senha do gerente"
              style={{
                width: "100%", boxSizing: "border-box", borderRadius: 10,
                border: `1.5px solid ${senhaErro ? varColor(C.red) : "var(--gm-input-border)"}`,
                background: "var(--gm-input-bg)", color: varColor(C.text),
                padding: "10px 12px", fontFamily: "inherit", outline: "none",
              }}
            />
            {senhaErro && (
              <div role="alert" className="movimento-caixa__erro" style={{ color: varColor(C.red), fontWeight: 600 }}>
                {senhaErro}
              </div>
            )}
          </div>
        )}

        {erro && (
          <div role="alert" className="movimento-caixa__erro" style={{ color: varColor(C.red), fontWeight: 600 }}>
            {erro}
          </div>
        )}

        {/* Por que ainda não dá para confirmar — antes de deixar errar */}
        {pendencia && !salvando && (
          <div className="movimento-caixa__pendencia" style={{ color: varColor(C.muted) }}>
            {pendencia}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="movimento-caixa__botao-cancelar"
            onClick={onClose}
            style={{
              flex: 1, padding: 13, borderRadius: 10,
              border: `1px solid var(${C.border})`, background: "none",
              color: varColor(C.muted), cursor: "pointer", fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="movimento-caixa__botao-confirmar"
            onClick={confirmar}
            disabled={!pode}
            style={{
              flex: 2, padding: 13, borderRadius: 10, border: "none",
              background: pode ? varColor(cor) : varColor(C.faint),
              cursor: pode ? "pointer" : "not-allowed",
              fontWeight: 700, fontFamily: "inherit",
            }}
          >
            {salvando
              ? "Registrando..."
              : tipo === "sangria" ? "✓ Registrar retirada" : "✓ Registrar entrada"}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
