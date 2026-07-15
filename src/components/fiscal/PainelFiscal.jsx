import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuShieldCheck, LuLockKeyhole, LuLoaderCircle, LuTriangleAlert,
  LuRotateCw, LuCircleCheck, LuSave,
} from "react-icons/lu";
import { buscarConfigFiscal, salvarConfigFiscal } from "@/lib/fiscalConfigRepo";
import { validarConfigFiscal } from "@/lib/validarConfigFiscal";
import InutilizarNumeracao from "./InutilizarNumeracao";
import "./PainelFiscal.css";

/**
 * <PainelFiscal> — onboarding fiscal do estabelecimento (Leva 13): a tela
 * onde o gestor cadastra CNPJ, IE, endereço, série, ambiente e os endpoints
 * públicos da SEFAZ que fazem a NFC-e ser emitida com a identidade DELE.
 *
 * Por que é intuitiva (Princípio nº1): campos agrupados em seções com nome do
 * dia a dia (Identidade / Endereço / Emissão / Endpoints), nada de jargão cru
 * ("Ambiente: Produção / Homologação (teste)", não "tpAmb"). Prevenção de erro
 * > mensagem: valida inline (erro sob cada campo) e o botão Salvar fica
 * desabilitado enquanto houver erro; ligar Produção — a ação que passa a
 * emitir nota REAL — pede confirmação explícita. TODOS os estados ficam
 * visíveis: carregando, salvando, sucesso (✓) e erro (com "tentar de novo").
 * Um aviso fixo explica que o certificado A1 e o VALOR do CSC são
 * configurados à parte, por segurança — o gestor não procura onde colar o
 * certificado nem tenta algo inseguro.
 *
 * FRONTEIRA DE SEGREDO: só toca dado NÃO-secreto (via fiscalConfigRepo, que
 * tem allow-list). Não há — e não pode haver — campo de certificado ou de
 * valor de CSC. O `csc_id` aqui é só o identificador (vai em claro no QR).
 */

const CAMPOS_IDENTIDADE = [
  { chave: "cnpj", label: "CNPJ", placeholder: "00.000.000/0000-00", inputMode: "numeric" },
  { chave: "ie", label: "Inscrição Estadual (IE)", hint: "Só números, ou ISENTO." },
  { chave: "im", label: "Inscrição Municipal", opcional: true },
  { chave: "razao_social", label: "Razão social" },
  { chave: "nome_fantasia", label: "Nome fantasia", opcional: true },
];

const CAMPOS_ENDERECO = [
  { chave: "uf", label: "UF", placeholder: "RS", maxLength: 2, estreito: true },
  { chave: "codigo_municipio", label: "Código IBGE do município", hint: "7 dígitos.", inputMode: "numeric", estreito: true },
  { chave: "municipio", label: "Município" },
  { chave: "logradouro", label: "Logradouro" },
  { chave: "numero_end", label: "Número", estreito: true },
  { chave: "complemento", label: "Complemento", opcional: true },
  { chave: "bairro", label: "Bairro" },
  { chave: "cep", label: "CEP", placeholder: "00000-000", inputMode: "numeric", estreito: true },
  { chave: "fone", label: "Telefone", opcional: true },
];

const CAMPOS_ENDPOINTS = [
  { chave: "url_autorizacao", label: "URL de autorização (NFeAutorizacao4)" },
  { chave: "url_qrcode", label: "URL de consulta do QR Code" },
  { chave: "url_recepcao_evento", label: "URL de recepção de evento (cancelamento)" },
  { chave: "url_inutilizacao", label: "URL de inutilização de numeração" },
];

const REGIMES = [
  { valor: "", label: "Selecione…" },
  { valor: 1, label: "Simples Nacional" },
  { valor: 2, label: "Simples Nacional — excesso de sublimite" },
  { valor: 3, label: "Regime Normal" },
];

// Padrões seguros para o primeiro cadastro (ver migration 20260731): nasce em
// homologação e desligado — ninguém emite nota real por engano.
const PADRAO = { ambiente: 2, serie: 1, ativo: false, crt: "" };

export default function PainelFiscal() {
  const [campos, setCampos] = useState(PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga]   = useState(false);
  const [salvando, setSalvando]     = useState(false);
  const [sucesso, setSucesso]       = useState(false);
  const [erroSalvar, setErroSalvar] = useState("");
  const [tocado, setTocado]         = useState({});
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [confirmarProd, setConfirmarProd] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      setCarregando(true);
      setErroCarga(false);
      const { data, error } = await buscarConfigFiscal();
      if (!ativo) return;
      if (error) { setErroCarga(true); setCarregando(false); return; }
      if (data) setCampos((prev) => ({ ...prev, ...semNulos(data) }));
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, []);

  const { ok, erros } = validarConfigFiscal(campos);

  const alterar = (chave, valor) => {
    setSucesso(false);
    setCampos((c) => ({ ...c, [chave]: valor }));
    setTocado((t) => ({ ...t, [chave]: true }));
  };

  // Mostra o erro de um campo só depois de tocado ou de uma tentativa de salvar
  // — evita um paredão de vermelho no formulário em branco (prevenção de erro).
  const mostrar = (chave) => (tocado[chave] || tentouSalvar) && erros[chave];

  // Ambiente é a ação sensível: Homologação → Produção passa a emitir nota
  // REAL, então pede confirmação antes de aplicar.
  const mudarAmbiente = (valor) => {
    const novo = Number(valor);
    if (novo === 1 && Number(campos.ambiente) === 2) { setConfirmarProd(true); return; }
    alterar("ambiente", novo);
  };
  const confirmarProducao = () => { alterar("ambiente", 1); setConfirmarProd(false); };

  const handleSalvar = async (e) => {
    e.preventDefault();
    setTentouSalvar(true);
    if (!ok || salvando) return;
    setSalvando(true);
    setErroSalvar("");
    setSucesso(false);
    const { error } = await salvarConfigFiscal(montarPayload(campos));
    setSalvando(false);
    if (error) { setErroSalvar("Não foi possível salvar. Verifique a conexão e tente de novo."); return; }
    setSucesso(true);
  };

  if (carregando) {
    return (
      <div className="painel-fiscal">
        <div className="painel-fiscal__estado">
          <LuLoaderCircle size={30} className="painel-fiscal__spinner" />
          <p>Carregando a configuração fiscal…</p>
        </div>
      </div>
    );
  }

  if (erroCarga) {
    return (
      <div className="painel-fiscal">
        <div className="painel-fiscal__estado painel-fiscal__estado--erro">
          <LuTriangleAlert size={30} />
          <p>Não foi possível carregar a configuração.</p>
          <button type="button" className="painel-fiscal__retry" onClick={() => window.location.reload()}>
            <LuRotateCw size={15} /> Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <form className="painel-fiscal" onSubmit={handleSalvar} noValidate>
      <header className="painel-fiscal__cabecalho">
        <h1 className="painel-fiscal__titulo">
          <LuShieldCheck size={22} /> Configuração fiscal
        </h1>
        <p className="painel-fiscal__subtitulo">
          Os dados fiscais do seu estabelecimento para emitir a NFC-e. Preencha
          com atenção — é com isto que a nota sai no CNPJ certo.
        </p>
      </header>

      {/* Aviso de segurança permanente: o certificado e o VALOR do CSC ficam
          à parte. Evita que o gestor procure onde colar o certificado. */}
      <div className="painel-fiscal__aviso" role="note">
        <LuLockKeyhole size={20} className="painel-fiscal__aviso-icone" />
        <div>
          <strong>Certificado digital e senha do CSC ficam à parte, por segurança.</strong>
          <span>
            O certificado A1 (arquivo .pfx) e o <em>valor</em> do CSC não são
            preenchidos aqui — eles são guardados em cofre seguro, fora do
            aplicativo. Nesta tela você configura só a identidade fiscal e o
            <em> ID</em> do CSC (o identificador que aparece no QR Code, e não é secreto).
          </span>
        </div>
      </div>

      {/* ── Identidade ── */}
      <fieldset className="painel-fiscal__secao">
        <legend className="painel-fiscal__legenda">Identidade</legend>
        <div className="painel-fiscal__grade">
          {CAMPOS_IDENTIDADE.map((f) => (
            <Campo
              key={f.chave} campo={f} valor={campos[f.chave]}
              erro={mostrar(f.chave)}
              onChange={(v) => alterar(f.chave, v)}
            />
          ))}
          <div className="painel-fiscal__campo">
            <label htmlFor="pf-crt" className="painel-fiscal__label">Regime tributário</label>
            <select
              id="pf-crt" className="painel-fiscal__input"
              value={campos.crt ?? ""}
              onChange={(e) => alterar("crt", e.target.value)}
            >
              {REGIMES.map((r) => <option key={String(r.valor)} value={r.valor}>{r.label}</option>)}
            </select>
            {mostrar("crt") && <span className="painel-fiscal__erro-campo">{erros.crt}</span>}
          </div>
        </div>
      </fieldset>

      {/* ── Endereço ── */}
      <fieldset className="painel-fiscal__secao">
        <legend className="painel-fiscal__legenda">Endereço do emitente</legend>
        <div className="painel-fiscal__grade">
          {CAMPOS_ENDERECO.map((f) => (
            <Campo
              key={f.chave} campo={f} valor={campos[f.chave]}
              erro={mostrar(f.chave)}
              onChange={(v) => alterar(f.chave, v)}
            />
          ))}
        </div>
      </fieldset>

      {/* ── Emissão ── */}
      <fieldset className="painel-fiscal__secao">
        <legend className="painel-fiscal__legenda">Emissão</legend>
        <div className="painel-fiscal__grade">
          <div className="painel-fiscal__campo painel-fiscal__campo--estreito">
            <label htmlFor="pf-ambiente" className="painel-fiscal__label">Ambiente de emissão</label>
            <select
              id="pf-ambiente" className="painel-fiscal__input"
              value={Number(campos.ambiente)}
              onChange={(e) => mudarAmbiente(e.target.value)}
            >
              <option value={2}>Homologação (teste)</option>
              <option value={1}>Produção</option>
            </select>
            <span className="painel-fiscal__hint">
              Comece em Homologação. Só passe para Produção quando for emitir de verdade.
            </span>
          </div>

          <Campo
            campo={{ chave: "serie", label: "Série da NFC-e", inputMode: "numeric", estreito: true }}
            valor={campos.serie} erro={mostrar("serie")}
            onChange={(v) => alterar("serie", v)}
          />

          <Campo
            campo={{ chave: "csc_id", label: "ID do CSC (idToken)", inputMode: "numeric", estreito: true,
              hint: "Identificador de até 6 dígitos — aparece no QR Code. NÃO é o valor secreto do CSC.", opcional: true }}
            valor={campos.csc_id} erro={mostrar("csc_id")}
            onChange={(v) => alterar("csc_id", v)}
          />

          <div className="painel-fiscal__campo painel-fiscal__campo--switch">
            <label className="painel-fiscal__switch">
              <input
                type="checkbox"
                checked={!!campos.ativo}
                onChange={(e) => alterar("ativo", e.target.checked)}
              />
              <span>Emissão fiscal ativa</span>
            </label>
            <span className="painel-fiscal__hint">
              Ligue só quando tudo estiver configurado — a partir daí as vendas emitem NFC-e.
            </span>
          </div>
        </div>
      </fieldset>

      {/* ── Endpoints ── */}
      <fieldset className="painel-fiscal__secao">
        <legend className="painel-fiscal__legenda">Endpoints da SEFAZ</legend>
        <p className="painel-fiscal__ajuda-secao">
          URLs dos webservices, fornecidas pela SEFAZ do seu estado (SEFAZ-RS).
          São públicas — não são segredo.
        </p>
        <div className="painel-fiscal__grade painel-fiscal__grade--largo">
          {CAMPOS_ENDPOINTS.map((f) => (
            <Campo
              key={f.chave} campo={{ ...f, larga: true, inputMode: "url" }} valor={campos[f.chave]}
              erro={mostrar(f.chave)}
              onChange={(v) => alterar(f.chave, v)}
            />
          ))}
        </div>
      </fieldset>

      {/* ── Rodapé: feedback + salvar ── */}
      <footer className="painel-fiscal__rodape">
        {sucesso && (
          <span className="painel-fiscal__sucesso" role="status">
            <LuCircleCheck size={17} /> Configuração salva
          </span>
        )}
        {erroSalvar && (
          <span className="painel-fiscal__erro-salvar" role="alert">
            <LuTriangleAlert size={17} /> {erroSalvar}
          </span>
        )}
        <button type="submit" className="painel-fiscal__salvar" disabled={!ok || salvando}>
          {salvando
            ? (<><LuLoaderCircle size={16} className="painel-fiscal__spinner" /> Salvando…</>)
            : (<><LuSave size={16} /> Salvar configuração</>)}
        </button>
      </footer>

      {/* Confirmação da ação sensível: ligar Produção */}
      {confirmarProd && createPortal(
        <div
          className="painel-fiscal__overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmarProd(false); }}
        >
          <div className="painel-fiscal__modal" role="dialog" aria-modal="true" aria-label="Mudar para Produção">
            <div className="painel-fiscal__modal-icone"><LuTriangleAlert size={22} /></div>
            <h2 className="painel-fiscal__modal-titulo">Mudar para Produção?</h2>
            <p className="painel-fiscal__modal-texto">
              Isso passa a emitir <strong>notas fiscais reais</strong> para os seus
              clientes, com valor fiscal. Confirme só quando o estabelecimento
              estiver pronto para emitir de verdade.
            </p>
            <div className="painel-fiscal__modal-acoes">
              <button type="button" className="painel-fiscal__modal-cancelar" onClick={() => setConfirmarProd(false)}>
                Continuar em Homologação
              </button>
              <button type="button" className="painel-fiscal__modal-confirmar" onClick={confirmarProducao}>
                Sim, usar Produção
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </form>

    {/* Inutilização de numeração — ação fiscal rara e deliberada de gestor,
        que usa a mesma série já configurada acima. Seção separada e com tom de
        aviso: é sobre números NÃO emitidos, não pertence ao histórico de notas
        nem ao fluxo do caixa. */}
    <InutilizarNumeracao serieAtual={campos.serie} />
    </>
  );
}

/** Campo de texto genérico com rótulo, dica e erro sob o campo. */
function Campo({ campo, valor, erro, onChange }) {
  const id = `pf-${campo.chave}`;
  const classe = [
    "painel-fiscal__campo",
    campo.estreito ? "painel-fiscal__campo--estreito" : "",
    campo.larga ? "painel-fiscal__campo--larga" : "",
  ].join(" ").trim();

  return (
    <div className={classe}>
      <label htmlFor={id} className="painel-fiscal__label">
        {campo.label}{campo.opcional && <span className="painel-fiscal__opcional"> (opcional)</span>}
      </label>
      <input
        id={id}
        className={`painel-fiscal__input ${erro ? "painel-fiscal__input--erro" : ""}`}
        value={valor ?? ""}
        placeholder={campo.placeholder}
        inputMode={campo.inputMode}
        maxLength={campo.maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
      {campo.hint && <span className="painel-fiscal__hint">{campo.hint}</span>}
      {erro && <span className="painel-fiscal__erro-campo">{erro}</span>}
    </div>
  );
}

/** Converte null → "" nos campos vindos do banco (inputs controlados). */
function semNulos(data) {
  const out = {};
  for (const [k, v] of Object.entries(data)) out[k] = v == null ? "" : v;
  // ativo é boolean; ambiente/serie numéricos — preserva o tipo se veio nulo.
  if (data.ativo != null) out.ativo = !!data.ativo;
  return out;
}

/** Normaliza tipos antes de enviar ao repositório (o allow-list filtra o resto). */
function montarPayload(c) {
  const texto = (v) => String(v ?? "").trim();
  const digitos = (v) => texto(v).replace(/\D/g, "");
  const ouNull = (v) => (texto(v) === "" ? null : texto(v));
  return {
    cnpj: digitos(c.cnpj),
    ie: texto(c.ie),
    im: ouNull(c.im),
    razao_social: texto(c.razao_social),
    nome_fantasia: ouNull(c.nome_fantasia),
    crt: texto(c.crt) === "" ? null : Number(c.crt),
    uf: texto(c.uf).toUpperCase(),
    codigo_municipio: digitos(c.codigo_municipio),
    municipio: texto(c.municipio),
    logradouro: texto(c.logradouro),
    numero_end: texto(c.numero_end),
    complemento: ouNull(c.complemento),
    bairro: texto(c.bairro),
    cep: digitos(c.cep),
    fone: ouNull(c.fone),
    ambiente: Number(c.ambiente),
    serie: Number(c.serie),
    csc_id: ouNull(c.csc_id),
    ativo: !!c.ativo,
    url_qrcode: ouNull(c.url_qrcode),
    url_autorizacao: ouNull(c.url_autorizacao),
    url_recepcao_evento: ouNull(c.url_recepcao_evento),
    url_inutilizacao: ouNull(c.url_inutilizacao),
  };
}
