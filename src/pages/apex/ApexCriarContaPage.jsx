import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ApexPortaShell from "./ApexPortaShell";
import { PLANOS_PRONTOS, totalDoPreset, itensDoPreset } from "./catalogoDoSite";
import { normalizarSlug } from "@/lib/slugEstabelecimento";
import { mascararTelefone } from "@/lib/telefone";
import { validarSolicitacao, registrarSolicitacaoConta } from "@/lib/solicitacoes";

/**
 * `/criar-conta` — o visitante pede a conta dele: os dados do responsável,
 * o nome do negócio, o endereço que quer e com que plano começar.
 *
 * Não cria estabelecimento na hora, e isso é de propósito: provisionar é
 * ato da plataforma (decisão 027 — a Edge Function exige super-admin). O
 * pedido entra na fila do Console; quando o dono aprova, nasce o
 * estabelecimento COM este responsável como administrador dele, e a
 * credencial de primeiro acesso vai pelo cartão que o Console já emite.
 * Nenhuma senha é digitada nem guardada aqui.
 *
 * Por que é intuitivo (Princípio nº1): um caminho só, de cima para baixo —
 * quem é você, qual é o negócio, onde ele vai morar, com que plano começar.
 * O endereço se escreve sozinho a partir do nome do negócio (e continua
 * editável), aparece completo embaixo do campo, e endereço já ocupado volta
 * do servidor com o próximo livre a um clique. A tela de sucesso diz o que
 * REALMENTE acontece agora — vamos preparar e chamar no WhatsApp —, sem
 * prometer um acesso que ainda não existe.
 */

const ROOT_DOMAIN = (import.meta.env.VITE_ROOT_DOMAIN || "").toLowerCase();

const formatarPreco = (valor) =>
  valor.toLocaleString("pt-BR", { minimumFractionDigits: 0 });

export default function ApexCriarContaPage() {
  const [searchParams] = useSearchParams();

  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [estabelecimento, setEstabelecimento] = useState("");
  const [endereco, setEndereco] = useState("");
  // Enquanto ninguém editar o endereço, ele segue o nome do negócio. Depois
  // de editado, para de seguir — senão a tela apagaria a escolha da pessoa a
  // cada letra corrigida no nome. Mesmo padrão do Console.
  const [enderecoTocado, setEnderecoTocado] = useState(false);
  const [planoCodigo, setPlanoCodigo] = useState(
    () => {
      const pedido = searchParams.get("plano");
      return PLANOS_PRONTOS.some((p) => p.codigo === pedido) ? pedido : "";
    }
  );

  const [erros, setErros] = useState({});
  const [erroEnvio, setErroEnvio] = useState("");
  const [sugestao, setSugestao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(null);

  useEffect(() => {
    document.title = "Criar conta · Kora";
  }, []);

  // Estado derivado, não efeito: enquanto ninguém tocou no campo, o endereço
  // É o nome do negócio normalizado — não existe instante em que a tela
  // mostre um endereço velho.
  const enderecoEfetivo = enderecoTocado ? normalizarSlug(endereco) : normalizarSlug(estabelecimento);
  const enderecoCompleto = ROOT_DOMAIN && enderecoEfetivo ? `${enderecoEfetivo}.${ROOT_DOMAIN}` : "";

  const plano = useMemo(
    () => PLANOS_PRONTOS.find((p) => p.codigo === planoCodigo) ?? null,
    [planoCodigo]
  );

  const limparErro = (campo) =>
    setErros((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));

  const aplicarSugestao = () => {
    setEndereco(sugestao);
    setEnderecoTocado(true);
    setSugestao("");
    limparErro("endereco");
    setErroEnvio("");
  };

  const aoEnviar = async (e) => {
    e.preventDefault();
    if (enviando) return;

    const dados = { nome, whatsapp, email, estabelecimento, endereco: enderecoEfetivo };
    const { valido, erros: novos } = validarSolicitacao(dados);
    setErros(novos);
    setErroEnvio("");
    setSugestao("");
    if (!valido) return;

    setEnviando(true);
    const resposta = await registrarSolicitacaoConta({
      ...dados,
      plano: plano
        ? {
            codigo: plano.codigo,
            nome: plano.nome,
            total: totalDoPreset(plano),
            itens: itensDoPreset(plano),
          }
        : null,
    });
    setEnviando(false);

    if (resposta.ok) {
      setEnviado({ nome: nome.trim(), estabelecimento: estabelecimento.trim(), endereco: resposta.endereco || enderecoEfetivo });
      return;
    }

    // Erro que pertence a um campo fica colado nele; o resto aparece uma vez
    // acima do botão, com tudo o que a pessoa digitou intacto.
    if (resposta.campo) {
      setErros((prev) => ({ ...prev, [resposta.campo]: resposta.erro }));
      setSugestao(resposta.sugestao || "");
      return;
    }
    setErroEnvio(resposta.erro);
  };

  if (enviado) {
    const primeiroNome = enviado.nome.split(" ")[0];
    const enderecoFinal = ROOT_DOMAIN ? `${enviado.endereco}.${ROOT_DOMAIN}` : enviado.endereco;
    return (
      <ApexPortaShell titulo={`Pedido recebido, ${primeiroNome}!`}>
        <div className="apex-porta__sucesso">
          <div className="apex-porta__sucesso-icone" aria-hidden="true">✅</div>
          <p className="apex-porta__sucesso-texto">
            Vamos preparar o KORA do <strong>{enviado.estabelecimento}</strong> no
            endereço <strong>{enderecoFinal}</strong>.
          </p>
          <p className="apex-porta__sucesso-texto">
            Assim que estiver pronto, chamamos você no WhatsApp com o usuário e a
            senha do primeiro acesso — você entra como administrador do seu
            estabelecimento.
          </p>
          <Link to="/" className="apex-botao apex-botao--primario apex-porta__enviar">
            Voltar ao site
          </Link>
        </div>
      </ApexPortaShell>
    );
  }

  return (
    <ApexPortaShell
      titulo="Criar minha conta"
      subtitulo="Conte quem você é e como é o seu negócio. A gente prepara o seu KORA e te chama no WhatsApp com o acesso."
      rodape={
        <p className="apex-porta__rodape">
          Já tem conta? <Link to="/entrar">Entrar no seu estabelecimento</Link>
        </p>
      }
    >
      <form className="apex-porta__form" onSubmit={aoEnviar} noValidate>
        <label className="apex-porta__campo">
          <span>Seu nome</span>
          <input
            type="text"
            value={nome}
            onChange={(e) => { setNome(e.target.value); limparErro("nome"); }}
            placeholder="Seu nome completo"
            aria-invalid={!!erros.nome}
            autoComplete="name"
            disabled={enviando}
          />
          {erros.nome && <span className="apex-porta__erro">{erros.nome}</span>}
        </label>

        <label className="apex-porta__campo">
          <span>WhatsApp</span>
          <input
            type="tel"
            inputMode="numeric"
            value={whatsapp}
            onChange={(e) => { setWhatsapp(mascararTelefone(e.target.value)); limparErro("whatsapp"); }}
            placeholder="(11) 99999-9999"
            aria-invalid={!!erros.whatsapp}
            autoComplete="tel"
            disabled={enviando}
          />
          {erros.whatsapp && <span className="apex-porta__erro">{erros.whatsapp}</span>}
        </label>

        <label className="apex-porta__campo">
          <span>E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); limparErro("email"); }}
            placeholder="voce@seunegocio.com.br"
            aria-invalid={!!erros.email}
            autoComplete="email"
            disabled={enviando}
          />
          {erros.email && <span className="apex-porta__erro">{erros.email}</span>}
        </label>

        <label className="apex-porta__campo">
          <span>Nome do estabelecimento</span>
          <input
            type="text"
            value={estabelecimento}
            onChange={(e) => { setEstabelecimento(e.target.value); limparErro("estabelecimento"); limparErro("endereco"); }}
            placeholder="Bar do Zé"
            aria-invalid={!!erros.estabelecimento}
            autoComplete="organization"
            disabled={enviando}
          />
          {erros.estabelecimento && (
            <span className="apex-porta__erro">{erros.estabelecimento}</span>
          )}
        </label>

        <label className="apex-porta__campo">
          <span>Endereço do seu KORA</span>
          <div className="apex-porta__endereco">
            <input
              type="text"
              value={enderecoEfetivo}
              onChange={(e) => {
                setEndereco(e.target.value);
                setEnderecoTocado(true);
                limparErro("endereco");
                setSugestao("");
              }}
              placeholder="bardoze"
              aria-invalid={!!erros.endereco}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={enviando}
            />
            {ROOT_DOMAIN && (
              <span className="apex-porta__sufixo" aria-hidden="true">.{ROOT_DOMAIN}</span>
            )}
          </div>
          {erros.endereco ? (
            <span className="apex-porta__erro" role="alert">
              {erros.endereco}
              {sugestao && (
                <button type="button" className="apex-porta__sugestao" onClick={aplicarSugestao}>
                  Usar {sugestao}
                </button>
              )}
            </span>
          ) : (
            <span className="apex-porta__ajuda">
              {enderecoCompleto ? (
                <>É por aqui que sua equipe vai entrar: <strong>{enderecoCompleto}</strong></>
              ) : (
                "Só letras e números — é o endereço por onde sua equipe entra."
              )}
            </span>
          )}
        </label>

        <fieldset className="apex-porta__planos">
          <legend>Com qual plano você quer começar?</legend>
          {PLANOS_PRONTOS.map((p) => (
            <label
              key={p.codigo}
              className={`apex-porta__plano${planoCodigo === p.codigo ? " apex-porta__plano--ativo" : ""}`}
            >
              <input
                type="radio"
                name="plano"
                value={p.codigo}
                checked={planoCodigo === p.codigo}
                onChange={() => setPlanoCodigo(p.codigo)}
                disabled={enviando}
              />
              <span className="apex-porta__plano-texto">
                <strong>{p.nome}</strong>
                <span>{p.resumo}</span>
              </span>
              <span className="apex-porta__plano-preco">
                R$ {formatarPreco(totalDoPreset(p))}<span>/mês</span>
              </span>
            </label>
          ))}
          <label
            className={`apex-porta__plano${planoCodigo === "" ? " apex-porta__plano--ativo" : ""}`}
          >
            <input
              type="radio"
              name="plano"
              value=""
              checked={planoCodigo === ""}
              onChange={() => setPlanoCodigo("")}
              disabled={enviando}
            />
            <span className="apex-porta__plano-texto">
              <strong>Ainda não sei</strong>
              <span>A gente monta junto na conversa, sem compromisso</span>
            </span>
          </label>
          <span className="apex-porta__ajuda">
            Valores de referência — nada é cobrado agora, e o plano pode mudar
            antes de começar.
          </span>
        </fieldset>

        {erroEnvio && (
          <span className="apex-porta__erro-envio" role="alert">
            {erroEnvio}
          </span>
        )}

        <button
          type="submit"
          className="apex-botao apex-botao--primario apex-porta__enviar"
          disabled={enviando}
          aria-busy={enviando}
        >
          {enviando ? "Enviando…" : "Criar minha conta"}
        </button>

        <span className="apex-porta__aviso">
          Sem cartão e sem senha agora. Usamos seus dados só para preparar o seu
          KORA e falar com você.
        </span>
      </form>
    </ApexPortaShell>
  );
}
