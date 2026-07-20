import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { LuX, LuTriangleAlert, LuLoaderCircle, LuStore } from "react-icons/lu";
import { validarNovoEstabelecimento, provisionarEstabelecimento } from "@/lib/console";
import "./NovoEstabelecimentoModal.css";

/**
 * Formulário "Criar estabelecimento" do Console (S1-2, ADR-008 §7).
 *
 * Por que é intuitivo (Princípio nº1): um único caminho, de cima para
 * baixo — dados do estabelecimento e, logo abaixo, o acesso do
 * responsável que vai entrar no sistema. Validação por campo acontece
 * ANTES de chamar o servidor (prevenção de erro > erro cru), com a
 * mensagem colada no campo que falhou. O botão principal mostra o estado
 * "Criando..." e fica desabilitado durante a operação, então não há como
 * clicar duas vezes nem ficar em dúvida se algo está acontecendo.
 *
 * O front NÃO decide autorização: quem cria de fato é a Edge Function
 * (revalida o papel `plataforma`, cria auth + perfil de forma atômica).
 * Aqui só montamos o payload e mostramos o resultado.
 */
export default function NovoEstabelecimentoModal({ planos, onFechar, onCriado }) {
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [planoCodigo, setPlanoCodigo] = useState("");
  const [adminNome, setAdminNome] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const [erros, setErros] = useState({});
  const [erroServidor, setErroServidor] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Pré-seleciona o plano mais completo (último da lista, maior tier) —
  // é o caso comercial mais comum ao abrir um cliente novo. O usuário
  // troca se quiser; nunca fica sem seleção.
  useEffect(() => {
    if (!planoCodigo && planos.length > 0) {
      setPlanoCodigo(planos[planos.length - 1].codigo);
    }
  }, [planos, planoCodigo]);

  const limparErro = (campo) =>
    setErros((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));

  const submeter = async () => {
    if (enviando) return;
    setErroServidor("");

    const form = { nome, endereco, planoCodigo, adminNome, adminUsername, adminPassword };
    const { ok, erros: errosValidacao } = validarNovoEstabelecimento(form);
    if (!ok) {
      setErros(errosValidacao);
      return;
    }

    setEnviando(true);
    const { data, error } = await provisionarEstabelecimento(form);
    setEnviando(false);

    if (error) {
      setErroServidor(error);
      return;
    }
    onCriado(data);
  };

  return createPortal(
    <div className="nem-overlay" role="dialog" aria-modal="true" aria-label="Criar estabelecimento">
      <div className="nem-modal">
        <header className="nem-header">
          <div className="nem-header__titulo">
            <LuStore size={20} aria-hidden />
            <h2>Novo estabelecimento</h2>
          </div>
          <button className="nem-fechar" onClick={onFechar} disabled={enviando} aria-label="Fechar">
            <LuX size={20} />
          </button>
        </header>

        <div className="nem-corpo">
          <section className="nem-secao">
            <p className="nem-secao__titulo">Dados do estabelecimento</p>

            <label className="nem-campo">
              <span className="nem-label">Nome do estabelecimento</span>
              <input
                className={`nem-input${erros.nome ? " nem-input--erro" : ""}`}
                type="text"
                value={nome}
                placeholder="Ex.: Restaurante do Sul"
                maxLength={80}
                disabled={enviando}
                onChange={(e) => { setNome(e.target.value); limparErro("nome"); }}
              />
              {erros.nome && <span className="nem-erro-campo">{erros.nome}</span>}
            </label>

            <label className="nem-campo">
              <span className="nem-label">Endereço (opcional)</span>
              <input
                className="nem-input"
                type="text"
                value={endereco}
                placeholder="Rua, número, bairro, cidade"
                maxLength={160}
                disabled={enviando}
                onChange={(e) => setEndereco(e.target.value)}
              />
              <span className="nem-dica">
                Para quem quer delivery integrado — vira o ponto de partida no mapa de entrega. Pode preencher ou ajustar depois.
              </span>
            </label>

            <label className="nem-campo">
              <span className="nem-label">Plano</span>
              <select
                className={`nem-input${erros.planoCodigo ? " nem-input--erro" : ""}`}
                value={planoCodigo}
                disabled={enviando}
                onChange={(e) => { setPlanoCodigo(e.target.value); limparErro("planoCodigo"); }}
              >
                {planos.length === 0 && <option value="">Carregando planos…</option>}
                {planos.map((p) => (
                  <option key={p.codigo} value={p.codigo}>{p.nome}</option>
                ))}
              </select>
              {erros.planoCodigo && <span className="nem-erro-campo">{erros.planoCodigo}</span>}
            </label>
          </section>

          <section className="nem-secao">
            <p className="nem-secao__titulo">Acesso do responsável</p>
            <p className="nem-secao__ajuda">
              Quem vai entrar no sistema desse estabelecimento como administrador.
            </p>

            <label className="nem-campo">
              <span className="nem-label">Nome do responsável</span>
              <input
                className={`nem-input${erros.adminNome ? " nem-input--erro" : ""}`}
                type="text"
                value={adminNome}
                placeholder="Ex.: Maria Oliveira"
                maxLength={80}
                disabled={enviando}
                onChange={(e) => { setAdminNome(e.target.value); limparErro("adminNome"); }}
              />
              {erros.adminNome && <span className="nem-erro-campo">{erros.adminNome}</span>}
            </label>

            <label className="nem-campo">
              <span className="nem-label">Usuário de acesso</span>
              <input
                className={`nem-input${erros.adminUsername ? " nem-input--erro" : ""}`}
                type="text"
                value={adminUsername}
                placeholder="Ex.: maria"
                maxLength={30}
                autoCapitalize="none"
                autoCorrect="off"
                disabled={enviando}
                onChange={(e) => { setAdminUsername(e.target.value); limparErro("adminUsername"); }}
              />
              {erros.adminUsername
                ? <span className="nem-erro-campo">{erros.adminUsername}</span>
                : <span className="nem-dica">Só letras minúsculas, números, ponto, hífen e sublinhado.</span>}
            </label>

            <label className="nem-campo">
              <span className="nem-label">Senha provisória</span>
              <input
                className={`nem-input${erros.adminPassword ? " nem-input--erro" : ""}`}
                type="text"
                value={adminPassword}
                placeholder="Mínimo 6 caracteres"
                maxLength={100}
                disabled={enviando}
                onChange={(e) => { setAdminPassword(e.target.value); limparErro("adminPassword"); }}
              />
              {erros.adminPassword && <span className="nem-erro-campo">{erros.adminPassword}</span>}
            </label>
          </section>

          {erroServidor && (
            <div className="nem-erro-servidor" role="alert">
              <LuTriangleAlert size={16} aria-hidden /> {erroServidor}
            </div>
          )}
        </div>

        <footer className="nem-footer">
          <button className="nem-btn nem-btn--secundario" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          <button className="nem-btn nem-btn--primario" onClick={submeter} disabled={enviando}>
            {enviando ? (<><LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Criando…</>) : "Criar estabelecimento"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
