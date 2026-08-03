import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { LuX, LuTriangleAlert, LuLoaderCircle, LuStore } from "react-icons/lu";
import {
  validarNovoEstabelecimento,
  provisionarEstabelecimento,
  traduzirErroProvisionamento,
  definirMensalidade,
  normalizarSlug,
  sugerirSlugLivre,
  gerarSenhaProvisoria,
  forcaDaSenha,
  sugerirUsuarioLivre,
  usernameSugeridoDoNome,
  cadastroTemDados,
  MENSALIDADE_MAXIMA,
  MAX_SLUG,
} from "@/lib/console";
import { urlDoCardapioPublico } from "@/lib/tenantSlug";
import { valorDigitado } from "@/lib/delivery";
import { formatarReais } from "@/lib/deliveryPedidos";
import { useFecharModal } from "@/hooks/useFecharModal";
import { useFocoDoModal } from "@/hooks/useFocoDoModal";
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
export default function NovoEstabelecimentoModal({ planos, slugsEmUso = [], onFechar, onCriado }) {
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  // Enquanto o dono não editar o endereço, ele segue o nome. Depois de
  // editado, para de seguir — senão o Console apagaria a escolha dele a cada
  // letra corrigida no nome.
  const [slugTocado, setSlugTocado] = useState(false);
  const [endereco, setEndereco] = useState("");
  const [planoCodigo, setPlanoCodigo] = useState("");
  const [mensalidade, setMensalidade] = useState("");
  const [adminNome, setAdminNome] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  // Mesma ideia do endereço: enquanto o dono não editar o usuário, ele segue o
  // nome do responsável. Depois de editado (inclusive apagado), para de seguir.
  const [usernameTocado, setUsernameTocado] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");

  const [erros, setErros] = useState({});
  const [erroServidor, setErroServidor] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Quantas vezes o servidor recusou ESTE texto de usuário (CONSOLE-UX 21).
  // Zera a cada mudança do campo, porque texto novo merece a sugestão nº 1.
  const [recusasDeUsuario, setRecusasDeUsuario] = useState(0);
  // Pediu para fechar com o formulário preenchido (CONSOLE-UX 23).
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);

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

  // Endereço público do estabelecimento (CONSOLE-UX 19). Estado derivado, não
  // efeito: enquanto ninguém tocou no campo ele É o nome normalizado, então
  // não existe um instante em que a tela mostre um endereço velho.
  const slugEfetivo = slugTocado ? slug : normalizarSlug(nome);
  const previaDoCardapio = urlDoCardapioPublico(slugEfetivo, window.location.hostname);
  const sugestaoDeSlug = erros.slug ? sugerirSlugLivre(slugEfetivo, slugsEmUso) : "";

  // Usuário de acesso derivado do nome do responsável (CONSOLE-UX 22). Estado
  // derivado, não efeito: enquanto ninguém tocou no campo, ele É o nome
  // normalizado — daqui para baixo, o que vale é sempre `usernameEfetivo`.
  const usernameEfetivo = usernameTocado ? adminUsername : usernameSugeridoDoNome(adminNome);

  // Força da senha (CONSOLE-UX 20). Só avisa — quem barra o envio continua
  // sendo o mínimo de 6 da validação, que é a regra da borda.
  const forcaSenha = forcaDaSenha(adminPassword, usernameEfetivo);

  // Sugestão de usuário livre (CONSOLE-UX 21). Só depois de o SERVIDOR recusar
  // por "já em uso" — sugerir antes disso seria inventar conflito, já que o
  // Console não lê `public.users` e não tem como saber o que está ocupado.
  const sugestaoDeUsuario =
    recusasDeUsuario > 0 && erros.adminUsername
      ? sugerirUsuarioLivre(usernameEfetivo, { slug: slugEfetivo, tentativa: recusasDeUsuario })
      : "";

  const limparErro = (campo) =>
    setErros((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));

  // Mudou o usuário — por digitação ou aceitando a sugestão —, a contagem de
  // recusas volta a zero: o próximo conflito é sobre um texto novo.
  const alterarUsuario = (valor) => {
    // Mexeu no campo: ele deixa de seguir o nome do responsável, inclusive se
    // o dono apagou tudo — campo vazio é escolha, não convite à derivação.
    setUsernameTocado(true);
    setAdminUsername(valor);
    limparErro("adminUsername");
    setRecusasDeUsuario(0);
  };

  // Fechar é a única ação sem volta daqui (CONSOLE-UX 23): some tudo, inclusive
  // a senha sorteada, que não é relida de lugar nenhum. Com o formulário ainda
  // vazio não há o que perder — fecha direto, sem inventar um clique a mais.
  const pedirParaFechar = () => {
    const temDados = cadastroTemDados({
      nome, slug: slugTocado ? slug : "", endereco, mensalidade, adminNome,
      adminUsername: usernameTocado ? adminUsername : "", adminPassword,
    });
    if (temDados) setConfirmandoDescarte(true);
    else onFechar();
  };

  const submeter = async () => {
    if (enviando || erroMensalidade) return;
    setErroServidor("");

    const form = {
      nome, slug: slugEfetivo, endereco, planoCodigo, adminNome,
      adminUsername: usernameEfetivo, adminPassword,
    };
    const { ok, erros: errosValidacao } = validarNovoEstabelecimento(form, slugsEmUso);
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
      // Só a colisão de usuário conta recusa: é ela que gera a sugestão.
      if (campo === "adminUsername") setRecusasDeUsuario((n) => n + 1);
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

  // Esc e clique no fundo entram pelo mesmo caminho do "X" (CONSOLE-UX
  // 24) — e com a pergunta de descarte já na tela eles equivalem a
  // "Continuar preenchendo": o gesto de sair nunca joga o cadastro fora.
  const fundo = useFecharModal(
    confirmandoDescarte ? () => setConfirmandoDescarte(false) : pedirParaFechar,
    enviando
  );

  // Foco no primeiro campo ao abrir, Tab preso aqui dentro e foco devolvido
  // ao botão que abriu este modal (CONSOLE-UX 25).
  const caixa = useFocoDoModal();

  return createPortal(
    <div className="nem-overlay" {...fundo} role="dialog" aria-modal="true" aria-label="Criar estabelecimento">
      <div className="nem-modal" ref={caixa} tabIndex={-1}>
        <header className="nem-header">
          <div className="nem-header__titulo">
            <LuStore size={20} aria-hidden />
            <h2>Novo estabelecimento</h2>
          </div>
          <button className="nem-fechar" onClick={pedirParaFechar} disabled={enviando} aria-label="Fechar">
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

            {/* Endereço público (slug). Vem logo abaixo do nome porque é dele
                que nasce, e a prévia mostra o link inteiro que o cliente vai
                receber — o dono escolhe agora, em vez de descobrir depois de
                criar qual endereço o banco derivou. */}
            <label className="nem-campo">
              <span className="nem-label">Link do cardápio</span>
              <input
                className={`nem-input${erros.slug ? " nem-input--erro" : ""}`}
                type="text"
                value={slugEfetivo}
                placeholder="restaurantedosul"
                maxLength={MAX_SLUG}
                autoCapitalize="none"
                autoCorrect="off"
                disabled={enviando}
                onChange={(e) => {
                  // Normaliza a cada tecla: maiúscula, acento, espaço e hífen
                  // somem na hora. O que está na tela é sempre, exatamente, o
                  // que o servidor vai gravar.
                  setSlugTocado(true);
                  setSlug(normalizarSlug(e.target.value));
                  limparErro("slug");
                }}
              />
              {erros.slug ? (
                <span className="nem-erro-campo">
                  {erros.slug}
                  {sugestaoDeSlug && (
                    <button
                      type="button"
                      className="nem-sugestao"
                      disabled={enviando}
                      onClick={() => {
                        setSlugTocado(true);
                        setSlug(sugestaoDeSlug);
                        limparErro("slug");
                      }}
                    >
                      Usar {sugestaoDeSlug}
                    </button>
                  )}
                </span>
              ) : previaDoCardapio ? (
                <span className="nem-dica">
                  O cardápio do cliente vai ficar em <strong>{previaDoCardapio}</strong>
                </span>
              ) : (
                <span className="nem-dica">
                  Só letras e números, sem espaço nem acento — é o que aparece no link.
                </span>
              )}
            </label>

            <label className="nem-campo">
              <span className="nem-label">Endereço da loja (opcional)</span>
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
                onChange={(e) => {
                  setAdminNome(e.target.value);
                  limparErro("adminNome");
                  // Se o usuário ainda segue o nome, o texto dele acabou de
                  // mudar — a recusa que estava na tela era sobre outro texto,
                  // então some junto com a contagem da sugestão (CONSOLE-UX 21).
                  if (!usernameTocado) {
                    limparErro("adminUsername");
                    setRecusasDeUsuario(0);
                  }
                }}
              />
              {erros.adminNome && <span className="nem-erro-campo">{erros.adminNome}</span>}
            </label>

            <label className="nem-campo">
              <span className="nem-label">Usuário de acesso</span>
              <input
                className={`nem-input${erros.adminUsername ? " nem-input--erro" : ""}`}
                type="text"
                value={usernameEfetivo}
                placeholder="Ex.: maria"
                maxLength={30}
                autoCapitalize="none"
                autoCorrect="off"
                disabled={enviando}
                onChange={(e) => alterarUsuario(e.target.value)}
              />
              {erros.adminUsername ? (
                <span className="nem-erro-campo">
                  {erros.adminUsername}
                  {sugestaoDeUsuario && (
                    <button
                      type="button"
                      className="nem-sugestao"
                      disabled={enviando}
                      onClick={() => alterarUsuario(sugestaoDeUsuario)}
                    >
                      Usar {sugestaoDeUsuario}
                    </button>
                  )}
                </span>
              ) : !usernameTocado && usernameEfetivo ? (
                <span className="nem-dica">
                  Sugerido a partir do responsável — pode trocar por outro.
                </span>
              ) : (
                <span className="nem-dica">Só letras minúsculas, números, ponto, hífen e sublinhado.</span>
              )}
            </label>

            {/* Único campo que não é um <label> em volta do input: o botão fica
                na linha do rótulo (a senha boa é a próxima ação óbvia — quem
                está no meio de uma venda não deveria ter de inventar uma), e
                botão dentro de <label> rouba o nome acessível do campo. Daí o
                htmlFor/id explícito. O campo segue visível (`type="text"`): o
                dono precisa ler a senha para o cliente na hora. */}
            <div className="nem-campo">
              <span className="nem-label-linha">
                <label className="nem-label" htmlFor="nem-senha">Senha provisória</label>
                <button
                  type="button"
                  className="nem-gerar"
                  disabled={enviando}
                  onClick={() => {
                    setAdminPassword(gerarSenhaProvisoria());
                    limparErro("adminPassword");
                  }}
                >
                  Gerar senha
                </button>
              </span>
              <input
                id="nem-senha"
                className={`nem-input${erros.adminPassword ? " nem-input--erro" : ""}`}
                type="text"
                value={adminPassword}
                placeholder="Mínimo 6 caracteres"
                maxLength={100}
                disabled={enviando}
                onChange={(e) => { setAdminPassword(e.target.value); limparErro("adminPassword"); }}
              />
              {erros.adminPassword ? (
                <span className="nem-erro-campo">{erros.adminPassword}</span>
              ) : forcaSenha.nivel === "forte" ? (
                <span className="nem-dica nem-forca--forte">Senha forte.</span>
              ) : forcaSenha.nivel ? (
                <span className={`nem-dica nem-forca--${forcaSenha.nivel}`}>
                  {forcaSenha.nivel === "fraca" ? "Senha fraca" : "Senha razoável"} — {forcaSenha.motivo}
                </span>
              ) : (
                <span className="nem-dica">
                  Essa é a senha do administrador do cliente — use "Gerar senha" e leia para ele.
                </span>
              )}
            </div>
          </section>

          {erroServidor && (
            <div className="nem-erro-servidor" role="alert">
              <LuTriangleAlert size={16} aria-hidden /> {erroServidor}
            </div>
          )}
        </div>

        {/* Uma decisão de cada vez: enquanto a pergunta está na tela, o rodapé
            inteiro é ela — "Criar estabelecimento" ao lado de "Descartar"
            faria o dono escolher entre coisas que não se comparam. */}
        {confirmandoDescarte ? (
          <footer className="nem-footer nem-footer--descarte">
            <p className="nem-descarte__texto" role="alert">
              <LuTriangleAlert size={16} aria-hidden /> Descartar este cadastro? Tudo que você
              preencheu se perde{adminPassword ? ", inclusive a senha do responsável" : ""}.
            </p>
            <div className="nem-descarte__acoes">
              <button
                className="nem-btn nem-btn--secundario"
                onClick={onFechar}
              >
                Descartar
              </button>
              <button
                className="nem-btn nem-btn--primario"
                onClick={() => setConfirmandoDescarte(false)}
              >
                Continuar preenchendo
              </button>
            </div>
          </footer>
        ) : (
          <footer className="nem-footer">
            <button className="nem-btn nem-btn--secundario" onClick={pedirParaFechar} disabled={enviando}>
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
        )}
      </div>
    </div>,
    document.body
  );
}
