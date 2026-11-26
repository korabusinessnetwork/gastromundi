import { useState } from "react";
import { LuBanknote } from "react-icons/lu";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { verificarSenhaUsuario } from "@/features/sessao/dados/adminAuth";
import { validarMovimento, exigeAutorizacao, limiteSangriaValido, lerValor } from "@/features/caixa/regras/caixaMovimentos";
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
  const [tipo,    setTipo]    = useState("sangria");
  const [valor,   setValor]   = useState("");
  const [motivo,  setMotivo]  = useState("");
  const [autorizador, setAutorizador] = useState(autorizadores[0]?.username ?? "");
  const [senha,   setSenha]   = useState("");
  const [senhaErro, setSenhaErro] = useState("");
  const [erro,    setErro]    = useState("");
  const [salvando, setSalvando] = useState(false);

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
      const { error } = await onConfirm({
        tipo,
        valor: lerValor(valor),
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
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      {...fecharAoClicarFora(onClose)}
      className="movimento-caixa"
    >
      <div
        role="dialog"
        aria-label="Movimentar dinheiro do caixa"
        className={`movimento-caixa__caixa movimento-caixa--${tipo}`}
      >
        {/* Header */}
        <div className="movimento-caixa__topo">
          <div className="movimento-caixa__icone-header">
            <LuBanknote size={22} aria-hidden="true" />
          </div>
          <div>
            <div className="movimento-caixa__titulo">
              Movimentar dinheiro do caixa
            </div>
            <div className="movimento-caixa__subtitulo">
              Fica registrado com seu nome e o motivo
            </div>
          </div>
        </div>

        {/* Escolha do tipo — a primeira decisão, em alvo grande de toque */}
        <div className="movimento-caixa__tipos">
          {[
            { id: "sangria",    titulo: "Retirar",  ajuda: "Sangria, levar ao cofre" },
            { id: "suprimento", titulo: "Colocar",  ajuda: "Suprimento, troco"       },
          ].map(op => {
            const ativo = tipo === op.id;
            return (
              <button
                key={op.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => { setTipo(op.id); setErro(""); setSenhaErro(""); }}
                className={`movimento-caixa__tipo movimento-caixa--${op.id}${ativo ? " movimento-caixa__tipo--ativo" : ""}`}
              >
                <div className="movimento-caixa__tipo-titulo">{op.titulo}</div>
                <div className="movimento-caixa__tipo-ajuda">{op.ajuda}</div>
              </button>
            );
          })}
        </div>

        {/* A pergunta que o operador faria antes de retirar */}
        <div
          className="movimento-caixa__disponivel"
        >
          <span className="movimento-caixa__apagado">Dinheiro na gaveta agora</span>
          <strong className="movimento-caixa__disponivel-valor">{fmtR(disponivel)}</strong>
        </div>

        {/* Valor */}
        <div>
          <div className="movimento-caixa__label">
            Valor (R$)
          </div>
          <div className="movimento-caixa__campo">
            <span className="movimento-caixa__simbolo-moeda">
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
            />
          </div>
        </div>

        {/* Motivo — obrigatório, é o que a conferência lê depois */}
        <div>
          <div className="movimento-caixa__label">
            Motivo
          </div>
          <textarea
            className="movimento-caixa__textarea"
            value={motivo}
            onChange={e => { setMotivo(e.target.value); setErro(""); }}
            rows={2}
            placeholder={tipo === "sangria" ? "Ex.: levado ao cofre" : "Ex.: reforço de troco"}
            aria-label="Motivo do movimento"
          />
        </div>

        {/* Autorização de gerente acima do limite (CAIXA.md) */}
        {precisaSenha && (
          <div className="movimento-caixa__autorizacao">
            <div className="movimento-caixa__aviso">
              Retirada acima de {fmtR(limiteEfetivo)} precisa de um gerente
            </div>
            <select
              className="movimento-caixa__select"
              value={autorizador}
              onChange={e => { setAutorizador(e.target.value); setSenhaErro(""); }}
              aria-label="Quem autoriza"
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
              // Autorização de gerente — nunca o login de quem está no
              // terminal. Sem isto o navegador autopreenchia a senha salva
              // do usuário logado e a sangria saía autorizada sozinha.
              name="autorizacao-gerente"
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              aria-invalid={senhaErro ? true : undefined}
            />
            {senhaErro && (
              <div role="alert" className="movimento-caixa__erro">
                {senhaErro}
              </div>
            )}
          </div>
        )}

        {erro && (
          <div role="alert" className="movimento-caixa__erro">
            {erro}
          </div>
        )}

        {/* Por que ainda não dá para confirmar — antes de deixar errar */}
        {pendencia && !salvando && (
          <div className="movimento-caixa__pendencia">
            {pendencia}
          </div>
        )}

        <div className="movimento-caixa__botoes">
          <button
            type="button"
            className="movimento-caixa__botao-cancelar"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="movimento-caixa__botao-confirmar"
            onClick={confirmar}
            disabled={!pode}
          >
            {salvando
              ? "Registrando..."
              : tipo === "sangria" ? "✓ Registrar retirada" : "✓ Registrar entrada"}
          </button>
        </div>
      </div>
    </div>
  );
}
