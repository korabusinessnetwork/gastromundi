import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { LuX, LuTriangleAlert, LuLoaderCircle, LuStore } from "react-icons/lu";
import {
  validarNovoEstabelecimento,
  provisionarEstabelecimento,
  traduzirErroProvisionamento,
  definirMensalidade,
  MENSALIDADE_MAXIMA,
} from "@/lib/console";
import { valorDigitado } from "@/lib/delivery";
import { formatarReais } from "@/lib/deliveryPedidos";
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
  const [mensalidade, setMensalidade] = useState("");
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

  // Mensalidade combinada (CONSOLE-UX 12). Vazio é aceito de propósito —
  // cortesia e piloto existem —, mas o valor pergunta-se AQUI porque é aqui
  // que a venda acontece: `valor_mensal` nasce 0 no banco (20260908) e, até
  // esta rodada, lembrar de definir o preço em outra aba era com o dono.
  const valorMensalidade = valorDigitado(mensalidade);
  const semMensalidade = !mensalidade.trim();
  let erroMensalidade = "";
  if (!semMensalidade && valorMensalidade === null) {
    erroMensalidade = "Digite só números, com vírgula nos centavos. Exemplo: 300,00";
  } else if (valorMensalidade !== null && valorMensalidade < 0) {
    erroMensalidade = "A mensalidade não pode ser negativa.";
  } else if (valorMensalidade !== null && valorMensalidade > MENSALIDADE_MAXIMA) {
    erroMensalidade = `O máximo aceito é ${formatarReais(MENSALIDADE_MAXIMA)} por mês.`;
  }
  // Zero digitado é o mesmo que vazio: cria sem preço e não chama a RPC à toa.
  const mensalidadeParaSalvar =
    !erroMensalidade && valorMensalidade !== null && valorMensalidade > 0 ? valorMensalidade : null;

  const limparErro = (campo) =>
    setErros((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));

  const submeter = async () => {
    if (enviando || erroMensalidade) return;
    setErroServidor("");

    const form = { nome, endereco, planoCodigo, adminNome, adminUsername, adminPassword };
    const { ok, erros: errosValidacao } = validarNovoEstabelecimento(form);
    if (!ok) {
      setErros(errosValidacao);
      return;
    }

    setEnviando(true);
    const { data, error } = await provisionarEstabelecimento(form);

    if (error) {
      setEnviando(false);
      // Erro cru do servidor vira frase em português colada no campo que o
      // dono precisa corrigir. O aviso de compensação (estabelecimento órfão
      // que ficou para trás) continua no alerta, porque pede ação manual.
      const { campo, mensagem, aviso } = traduzirErroProvisionamento(error);
      if (campo) setErros((prev) => ({ ...prev, [campo]: mensagem }));
      setErroServidor(campo ? aviso : [mensagem, aviso].filter(Boolean).join(" "));
      return;
    }
    // Estabelecimento criado. A partir daqui NADA pode desfazê-lo: a
    // mensalidade é uma segunda escrita, pela RPC que já existe
    // (`definir_mensalidade_tenant`, 20260911 — única porta de escrita de
    // `valor_mensal`), e se ela falhar o Console avisa em vez de mentir que a
    // criação deu errado.
    let mensalidadeFalhou = false;
    if (mensalidadeParaSalvar !== null && data?.tenant_id) {
      const { error: erroPreco } = await definirMensalidade(data.tenant_id, mensalidadeParaSalvar);
      mensalidadeFalhou = Boolean(erroPreco);
    }
    setEnviando(false);

    // O plano vai junto porque quem o conhece com certeza é o formulário — o
    // cartão de primeiro acesso do Console precisa dele para dizer ao cliente
    // o que ele contratou, sem depender do formato da resposta da borda. A
    // mensalidade segue o mesmo caminho.
    onCriado({
      ...data,
      plano_codigo: planoCodigo,
      mensalidade: mensalidadeFalhou ? null : mensalidadeParaSalvar,
      mensalidadeFalhou,
    });
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

            <label className="nem-campo">
              <span className="nem-label">Mensalidade combinada (R$)</span>
              <input
                className={`nem-input${erroMensalidade ? " nem-input--erro" : ""}`}
                type="text"
                inputMode="decimal"
                value={mensalidade}
                placeholder="300,00"
                maxLength={12}
                disabled={enviando}
                onChange={(e) => setMensalidade(e.target.value)}
              />
              {/* O eco em reais mostra o que o sistema ENTENDEU antes de
                  gravar: "300,00" e "300" dão o mesmo valor, e "30000" salta
                  aos olhos. Vazio é caminho legítimo (cortesia, piloto) e a
                  dica diz onde definir depois, em vez de deixar o dono achar
                  que esqueceu algo obrigatório. */}
              {erroMensalidade ? (
                <span className="nem-erro-campo">{erroMensalidade}</span>
              ) : mensalidadeParaSalvar !== null ? (
                <span className="nem-dica">Vai ficar {formatarReais(mensalidadeParaSalvar)} por mês.</span>
              ) : (
                <span className="nem-dica">
                  Pode deixar em branco — o estabelecimento entra sem mensalidade definida e você
                  define depois em "Planos e assinaturas".
                </span>
              )}
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
          <button
            className="nem-btn nem-btn--primario"
            onClick={submeter}
            disabled={enviando || Boolean(erroMensalidade)}
          >
            {enviando ? (<><LuLoaderCircle size={16} className="nem-spin" aria-hidden /> Criando…</>) : "Criar estabelecimento"}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
