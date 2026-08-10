import { useMemo, useRef, useState } from "react";
import { LuImagePlus, LuLoaderCircle, LuTrash2, LuTriangleAlert, LuCircleCheck } from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import { nomeExibicaoTenant, logoUrlTenant, MARCA_PLATAFORMA } from "@/lib/tenant/tema";
import {
  ACCEPT_IMAGEM, MAX_NOME_EXIBICAO,
  enviarLogoTenant, salvarIdentidadeTenant, identidadeMudou, limparNomeExibicao,
} from "@/lib/tenant/identidadeTenant";
import "./IdentidadeTab.css";

/**
 * Aba "Identidade" (Configurações) — o estabelecimento definindo a
 * própria marca: nome de exibição e logo (S1-3, decisão 017).
 *
 * Por que existe: `tenants.tema` já alimentava a sidebar, a tela de
 * login, o cardápio e o cupom impresso — mas ninguém o escrevia. Trocar
 * o próprio logo era `UPDATE` no SQL Editor, que é justamente o que o
 * S1-3 existe para acabar.
 *
 * Escopo: só marca. Paleta e layout continuam sendo escolha da
 * plataforma pelo Console (`alterar_layout_tenant`), porque a troca de
 * layout apaga overrides de paleta de propósito — duas pontas mexendo
 * nas mesmas chaves se sobrescreveriam sem ninguém perceber.
 *
 * Por que é intuitiva (Princípio nº1): a prévia fica no topo e muda
 * enquanto se digita ou se escolhe a imagem, então o resultado aparece
 * ANTES de salvar — ninguém precisa salvar e ir conferir na sidebar. O
 * envio é um botão só, que abre a câmera no celular e a galeria no
 * computador, porque o dono tem o logo no telefone e não uma URL. E o
 * botão de salvar só acende quando existe algo novo para salvar.
 */
export default function IdentidadeTab() {
  const { tenant, aplicarTenantSalvo } = useApp();

  // Tema confirmado pela RPC nesta sessão. Ele tem precedência sobre o do
  // contexto porque o "salvo" precisa ser verdade no instante em que o
  // servidor confirma — depender do repintar do contexto deixaria a tela
  // achando que ainda há mudança pendente logo depois de salvar.
  const [temaSalvo, setTemaSalvo] = useState(null);

  const salvo = useMemo(() => {
    const tema = temaSalvo ?? tenant?.tema;
    return {
      nome: tema?.nome_exibicao ?? "",
      logoUrl: logoUrlTenant(tema) ?? "",
    };
  }, [temaSalvo, tenant?.tema]);

  // `null` = "não mexi nisto", e o campo segue o que está salvo. É o que
  // faz a tela se preencher sozinha quando o tenant chega depois do
  // primeiro render (bootstrap) — inicializar o estado com o valor salvo
  // congelaria o campo vazio para sempre.
  const [nomeEditado, setNomeEditado] = useState(null);
  const [logoEditado, setLogoEditado] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const inputArquivo = useRef(null);

  // Bootstrap em voo: sem tenant não dá para afirmar que não há
  // identidade — só que ainda não sabemos qual é.
  if (!tenant) {
    return (
      <div className="ident">
        <p className="ident__estado" role="status">
          <LuLoaderCircle size={16} className="ident__girando" aria-hidden /> Carregando a identidade…
        </p>
      </div>
    );
  }

  const nome = nomeEditado ?? salvo.nome;
  const logoUrl = logoEditado ?? salvo.logoUrl;
  const nomeLimpo = limparNomeExibicao(nome);
  const excedeu = nomeLimpo.length > MAX_NOME_EXIBICAO;
  const mudou = identidadeMudou(salvo, { nome, logoUrl });
  const podeSalvar = mudou && !excedeu && !salvando && !enviando;

  // O que a sidebar mostraria com o que está na tela agora — as MESMAS
  // funções que o SidebarBranding usa, inclusive a allowlist de esquema
  // do `logoUrlTenant` (URL fora dela não aparece na prévia).
  const nomeNaPrevia = nomeExibicaoTenant({ nome_exibicao: nomeLimpo }, tenant?.nome);
  const logoNaPrevia = logoUrlTenant({ logo_url: logoUrl });
  const assinaPlataforma = nomeNaPrevia !== MARCA_PLATAFORMA;

  const escolherArquivo = () => {
    setErro("");
    setOk(false);
    inputArquivo.current?.click();
  };

  const aoEscolher = async (evento) => {
    const file = evento.target.files?.[0];
    // Zera o input para que escolher o MESMO arquivo de novo dispare
    // o evento (senão a segunda tentativa não faz nada).
    evento.target.value = "";
    if (!file) return;

    setEnviando(true);
    setErro("");
    setOk(false);
    const { url, error } = await enviarLogoTenant({ file, tenantId: tenant.id });
    setEnviando(false);

    if (error) {
      setErro(error.message ?? "Não foi possível enviar a imagem.");
      return;
    }
    // A imagem subiu, mas a identidade só muda quando ele salvar — a
    // prévia já mostra, o texto do botão continua pedindo o salvamento.
    setLogoEditado(url ?? "");
  };

  const removerLogo = () => {
    setLogoEditado("");
    setConfirmandoRemocao(false);
    setErro("");
    setOk(false);
  };

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    setOk(false);

    const { data, error } = await salvarIdentidadeTenant({
      nomeExibicao: nomeLimpo,
      // "" remove a chave no banco; null não mexeria nela.
      logoUrl: logoUrl || "",
    });
    setSalvando(false);

    if (error) {
      setErro(error.message ?? "Não foi possível salvar a identidade.");
      return;
    }
    // Sem erro, a gravação aconteceu. Se a RPC não devolveu a linha, o que
    // acabamos de mandar É o que está no banco nessas duas chaves.
    setTemaSalvo(data?.tema ?? { nome_exibicao: nomeLimpo, logo_url: logoUrl || null });
    setNomeEditado(null);
    setLogoEditado(null);
    aplicarTenantSalvo?.(data);
    setOk(true);
  };

  return (
    <div className="ident">
      <p className="ident__intro">
        É esta a marca que aparece no menu do sistema, na tela de entrada dos seus funcionários e no
        cardápio que o cliente vê.
      </p>

      {/* Prévia — o resultado antes de salvar */}
      <section className="ident__previa" aria-label="Prévia da marca">
        <div className="ident__previa-palco">
          {logoNaPrevia ? (
            <img className="ident__previa-logo" src={logoNaPrevia} alt={nomeNaPrevia} />
          ) : (
            <div className="ident__previa-nome">
              {nomeNaPrevia.toUpperCase()}
              {assinaPlataforma && <br />}
              {assinaPlataforma && <span className="ident__previa-tagline">by {MARCA_PLATAFORMA}</span>}
            </div>
          )}
        </div>
        <p className="ident__previa-legenda">Assim sua marca aparece no sistema.</p>
      </section>

      <section className="ident__card">
        <label className="ident__rotulo" htmlFor="ident-nome">Nome do estabelecimento</label>
        <input
          id="ident-nome"
          className="ident__input"
          type="text"
          value={nome}
          maxLength={MAX_NOME_EXIBICAO}
          aria-invalid={excedeu || undefined}
          placeholder={tenant?.nome || "Nome que aparece na tela"}
          onChange={(e) => { setNomeEditado(e.target.value); setOk(false); }}
        />
        {/* O `maxLength` já impede passar de 40 digitando ou colando; o
            aviso existe para o caso de o valor vir grande de outro lugar
            (nome antigo gravado por SQL antes desta tela). */}
        <p className={excedeu ? "ident__ajuda ident__ajuda--erro" : "ident__ajuda"}>
          {excedeu
            ? `O nome precisa ter no máximo ${MAX_NOME_EXIBICAO} caracteres.`
            : nomeLimpo
              ? `${nomeLimpo.length} de ${MAX_NOME_EXIBICAO} caracteres.`
              : `Deixando em branco, aparece o nome cadastrado: ${tenant?.nome || MARCA_PLATAFORMA}.`}
        </p>
      </section>

      <section className="ident__card">
        <p className="ident__rotulo">Logo</p>
        <p className="ident__ajuda">
          Uma imagem PNG com fundo transparente fica melhor. O sistema ajusta o tamanho sozinho.
        </p>

        <div className="ident__acoes">
          <button
            type="button"
            className="ident__botao"
            onClick={escolherArquivo}
            disabled={enviando || salvando}
          >
            {enviando ? (
              <><LuLoaderCircle size={16} className="ident__girando" aria-hidden /> Enviando…</>
            ) : (
              <><LuImagePlus size={16} aria-hidden /> {logoUrl ? "Trocar logo" : "Enviar logo"}</>
            )}
          </button>

          {logoUrl && !confirmandoRemocao && (
            <button
              type="button"
              className="ident__botao ident__botao--fantasma"
              onClick={() => setConfirmandoRemocao(true)}
              disabled={enviando || salvando}
            >
              <LuTrash2 size={16} aria-hidden /> Remover
            </button>
          )}
        </div>

        {confirmandoRemocao && (
          <div className="ident__confirmar" role="alertdialog" aria-label="Remover o logo">
            <p className="ident__confirmar-texto">
              Sem logo, o sistema volta a mostrar o nome do estabelecimento escrito. Remover?
            </p>
            <div className="ident__acoes">
              <button type="button" className="ident__botao ident__botao--perigo" onClick={removerLogo}>
                Remover logo
              </button>
              <button
                type="button"
                className="ident__botao ident__botao--fantasma"
                onClick={() => setConfirmandoRemocao(false)}
              >
                Manter
              </button>
            </div>
          </div>
        )}

        <input
          ref={inputArquivo}
          className="ident__arquivo"
          type="file"
          accept={ACCEPT_IMAGEM}
          onChange={aoEscolher}
          data-testid="ident-arquivo"
        />
      </section>

      {erro && (
        <p className="ident__aviso ident__aviso--erro" role="alert">
          <LuTriangleAlert size={16} aria-hidden /> {erro}
        </p>
      )}

      {ok && !mudou && (
        <p className="ident__aviso ident__aviso--ok" role="status">
          <LuCircleCheck size={16} aria-hidden /> Identidade salva.
        </p>
      )}

      <div className="ident__rodape">
        <button type="button" className="ident__salvar" onClick={salvar} disabled={!podeSalvar}>
          {salvando ? (
            <><LuLoaderCircle size={16} className="ident__girando" aria-hidden /> Salvando…</>
          ) : "Salvar identidade"}
        </button>
        {!mudou && !salvando && (
          <span className="ident__rodape-dica">Nada mudou ainda.</span>
        )}
      </div>
    </div>
  );
}
