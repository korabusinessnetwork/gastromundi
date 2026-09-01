import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ApexPortaShell from "./ApexPortaShell";
import { normalizarSlug } from "@/lib/slugEstabelecimento";
import { urlDeAcessoDoTenant } from "@/lib/tenantSlug";
import { buscarBrandingPorSlug } from "@/lib/tenant";

/**
 * `/entrar` — a porta de entrada do site da plataforma.
 *
 * Antes, o "Entrar" da nav mandava direto para `/login`, que no domínio
 * nu cai no estabelecimento de fallback: a porta da PLATAFORMA abria o
 * login de UM cliente, com a marca dele. Quem é cliente de outro nem
 * conseguia entrar — a credencial dele vive no namespace do endereço
 * dele (`usuario@<endereco>.local`, ADR-009).
 *
 * Aqui a tela pergunta o que só o visitante sabe: qual é o negócio dele.
 * Confere se o endereço existe (RPC pública `branding_por_slug`, a mesma
 * que pinta a marca no login) e leva para a porta certa.
 *
 * Por que é intuitivo (Princípio nº1): uma pergunta só, com o endereço
 * completo montado na frente da pessoa enquanto ela digita — ela vê para
 * onde vai antes de clicar. Endereço que não existe recebe uma resposta
 * humana ("não encontramos") e as duas saídas possíveis: conferir com
 * quem cuida do sistema, ou criar a conta. Quem ainda não é cliente
 * encontra a porta de cadastro no mesmo lugar, sem ter que adivinhar.
 */

const ROOT_DOMAIN = (import.meta.env.VITE_ROOT_DOMAIN || "").toLowerCase();

export default function ApexEntrarPage() {
  const [endereco, setEndereco] = useState("");
  const [erro, setErro] = useState("");
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    document.title = "Entrar · Kora";
  }, []);

  const slug = normalizarSlug(endereco);
  // O endereço completo aparece embaixo do campo enquanto a pessoa digita:
  // é a confirmação de que ela entendeu o que estamos pedindo. Sem domínio
  // raiz configurado (dev/preview) não há endereço a prometer, e a linha
  // some em vez de mostrar algo falso.
  const enderecoCompleto = ROOT_DOMAIN && slug ? `${slug}.${ROOT_DOMAIN}` : "";

  const aoEnviar = async (e) => {
    e.preventDefault();
    if (verificando) return;

    if (slug.length < 2) {
      setErro("Digite o endereço do seu estabelecimento.");
      return;
    }

    setErro("");
    setVerificando(true);
    const { data, error } = await buscarBrandingPorSlug(slug);

    // Destino: a porta do próprio estabelecimento. Sem domínio raiz
    // (dev/preview) `urlDeAcessoDoTenant` devolve a origem atual — que é
    // onde o login mora nesses ambientes.
    const destino = `${urlDeAcessoDoTenant(slug) || window.location.origin}/login`;

    // Falha de REDE não prende ninguém aqui (fail-open): seguimos para o
    // endereço, e é a tela de lá que diz se ele existe — ela já sabe fazer
    // isso. Prender a pessoa numa mensagem de erro seria pior: o login do
    // estabelecimento dela pode estar perfeitamente no ar.
    if (error) {
      window.location.assign(destino);
      return;
    }

    if (!data) {
      setVerificando(false);
      setErro(
        `Não encontramos o endereço ${enderecoCompleto || slug}. Confira com quem cuida do sistema no seu negócio.`
      );
      return;
    }

    window.location.assign(destino);
  };

  return (
    <ApexPortaShell
      titulo="Entrar no seu KORA"
      subtitulo="Cada estabelecimento tem o seu próprio endereço. Diga qual é o seu e a gente te leva até ele."
    >
      <form className="apex-porta__form" onSubmit={aoEnviar} noValidate>
        <label className="apex-porta__campo">
          <span>Endereço do seu estabelecimento</span>
          <div className="apex-porta__endereco">
            <input
              type="text"
              value={endereco}
              onChange={(e) => {
                setEndereco(e.target.value);
                setErro("");
              }}
              placeholder="bardoze"
              aria-invalid={!!erro}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={verificando}
            />
            {ROOT_DOMAIN && (
              <span className="apex-porta__sufixo" aria-hidden="true">.{ROOT_DOMAIN}</span>
            )}
          </div>
          {enderecoCompleto && !erro && (
            <span className="apex-porta__ajuda">
              Você vai entrar em <strong>{enderecoCompleto}</strong>
            </span>
          )}
          {erro && (
            <span className="apex-porta__erro" role="alert">
              {erro}
            </span>
          )}
        </label>

        <button
          type="submit"
          className="apex-botao apex-botao--primario apex-porta__enviar"
          disabled={verificando}
          aria-busy={verificando}
        >
          {verificando ? "Procurando…" : "Entrar"}
        </button>
      </form>

      <div className="apex-porta__separador">
        <span>ainda não é cliente?</span>
      </div>

      <div className="apex-porta__cadastro">
        <p className="apex-porta__cadastro-texto">
          Crie sua conta, escolha o plano do seu negócio e a gente prepara o seu
          KORA — você entra como administrador do seu estabelecimento.
        </p>
        <Link to="/criar-conta" className="apex-botao apex-botao--outline apex-porta__cadastro-cta">
          Criar minha conta
        </Link>
      </div>
    </ApexPortaShell>
  );
}
