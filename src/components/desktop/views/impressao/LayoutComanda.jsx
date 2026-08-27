import { useState, useEffect, useMemo, useCallback } from "react";
import { LuCircleCheck, LuCircleAlert, LuRefreshCw } from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import {
  buscarConfigImpressao,
  salvarConfigImpressao,
  resolverIdentidadeTenant,
  CONFIG_IMPRESSAO_PADRAO,
  PERFIL_IMPRESSORA_PADRAO,
} from "@/lib/impressao";
import { gerarHtmlComPerfil } from "@/lib/impressao/drivers/browserRaster";
import { logoUrlTenant } from "@/lib/tema";
import { formatarDocumento, validarCnpj, apenasDigitos } from "@/lib/documento";
import "./LayoutComanda.css";

/**
 * Aba "Layout da comanda" (Configurações → Impressão) — o que aparece
 * impresso na comanda que o cliente leva: logo no topo, endereço/CNPJ e
 * a mensagem do rodapé.
 *
 * Por que existe: `mostrarLogo`, `mostrarEnderecoCnpj`, `endereco`, `cnpj`
 * e `rodapePersonalizado` já eram lidos por `resolverIdentidadeTenant` e
 * já saíam no comprovante, no cupom/pré-nota e nos comprovantes de caixa —
 * mas nenhuma tela os escrevia. Mudar o rodapé impresso era `UPDATE` na
 * tabela `config` pelo SQL Editor, e um estabelecimento não tem como fazer
 * isso (decisão 017: nada de configuração que só a plataforma consegue mexer).
 *
 * Escopo: só o CONTEÚDO do papel. Largura, corte e tamanho da letra
 * continuam na aba "Papel e impressora" (são característica do
 * equipamento, não do estabelecimento), e nome/logo da marca continuam na
 * aba "Identidade" — aqui só se decide se o logo SAI no papel, não qual é.
 *
 * A via de produção (ticket de cozinha) não tem cabeçalho de propósito e
 * não é afetada por nada desta tela.
 *
 * Por que é intuitiva (Princípio nº1): a comanda de exemplo fica ao lado e
 * se redesenha a cada tecla, com o logo e o nome DO PRÓPRIO
 * estabelecimento — o dono vê o papel antes de gastar bobina, em vez de
 * imprimir para descobrir como ficou. Endereço e CNPJ só aparecem quando a
 * chave correspondente está ligada, então não há campo pedindo dado que
 * não vai sair. E "Salvar" só acende quando existe algo novo para salvar.
 */

// Limites de digitação: papel térmico de 58/80mm não comporta linha longa
// — texto maior que isso sairia quebrado ou cortado na impressora. Cortar
// na digitação é prevenção de erro, melhor que avisar depois (Princípio nº1).
const MAX_ENDERECO = 120;
const MAX_CNPJ = 18; // 00.000.000/0000-00
const MAX_RODAPE = 120;

// Comanda de exemplo só para a pré-visualização — nunca é uma venda real.
// Os itens são genéricos porque esta tela é vista por TODO estabelecimento
// (decisão 017); a identidade (nome/logo) vem do tenant, essa sim é real.
const COMANDA_EXEMPLO = {
  tipo: "comprovante",
  comanda: "42",
  itens: [
    { nome: "Hambúrguer artesanal", qty: 2, preco: 32.5, emoji: "🍔", obs: ["sem cebola"] },
    { nome: "Refrigerante lata", qty: 1, preco: 6, emoji: "🥤", obs: [] },
  ],
  subtotal: 71, valorTaxa: 7.1, ajuste: null, valorAjuste: 0, total: 78.1,
  pagamentos: [{ metodo: "pix", valor: 78.1, troco: 0 }], trocoTotal: 0,
  naoFiscal: false, avisoNaoFiscal: "",
};

// Só os campos desta tela, normalizados. O que vem do banco é JSON livre:
// chave ausente cai no default, e string vira string (um número gravado
// por engano viraria `.trim is not a function` no input controlado).
function extrairLayout(config) {
  const base = { ...CONFIG_IMPRESSAO_PADRAO, ...(config ?? {}) };
  return {
    mostrarLogo: base.mostrarLogo !== false,
    mostrarEnderecoCnpj: base.mostrarEnderecoCnpj === true,
    endereco: String(base.endereco ?? ""),
    cnpj: String(base.cnpj ?? ""),
    rodapePersonalizado: String(base.rodapePersonalizado ?? ""),
  };
}

function mesmoLayout(a, b) {
  return a.mostrarLogo === b.mostrarLogo
    && a.mostrarEnderecoCnpj === b.mostrarEnderecoCnpj
    && a.endereco.trim() === b.endereco.trim()
    && a.cnpj.trim() === b.cnpj.trim()
    && a.rodapePersonalizado.trim() === b.rodapePersonalizado.trim();
}

export default function LayoutComanda() {
  const { tenant } = useApp();

  const [configCompleta, setConfigCompleta] = useState(null);
  const [campos, setCampos] = useState(() => extrairLayout(null));
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState(null); // null | "sucesso" | "erro"

  // Falha na LEITURA tranca a tela, igual à aba de impressora: abrir com os
  // valores de fábrica e deixar salvar por cima apagaria o rodapé/CNPJ reais
  // do estabelecimento, que só não foram lidos.
  const carregar = useCallback(() => {
    setCarregando(true);
    setErroCarga(null);
    buscarConfigImpressao()
      .then(({ data, error }) => {
        if (error || !data) throw error ?? new Error("Não deu para ler a configuração de impressão.");
        setConfigCompleta(data);
        setCampos(extrairLayout(data));
        setCarregando(false);
      })
      .catch((e) => {
        setErroCarga(e?.message || "Não deu para ler a configuração de impressão.");
        setCarregando(false);
      });
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atualizar = (campo, valor) => {
    setCampos((prev) => ({ ...prev, [campo]: valor }));
    setStatus(null);
  };

  // A identidade da prévia passa pela MESMA função que a impressão de
  // verdade usa — inclusive a allowlist de esquema do logo. Se a URL do
  // logo não for aceita lá, também não aparece aqui.
  const identidade = useMemo(
    () => resolverIdentidadeTenant(tenant, campos),
    [tenant, campos]
  );

  // O perfil vem do que está salvo (aba "Papel e impressora"): a prévia
  // sai na largura e no tamanho de letra reais do estabelecimento.
  const htmlPreview = useMemo(
    () => gerarHtmlComPerfil(
      { ...COMANDA_EXEMPLO, identidade },
      configCompleta?.perfilImpressora ?? PERFIL_IMPRESSORA_PADRAO
    ),
    [identidade, configCompleta]
  );

  const temLogo = Boolean(logoUrlTenant(tenant?.tema));
  const larguraPrevia = configCompleta?.perfilImpressora?.larguraMm ?? PERFIL_IMPRESSORA_PADRAO.larguraMm;

  // CNPJ é opcional; digitado errado, sai errado no papel de todo mundo.
  // Só trava o salvamento quando o bloco está LIGADO — CNPJ meio digitado
  // com a chave desligada não é erro, é campo que ninguém vai imprimir.
  const cnpjPreenchido = apenasDigitos(campos.cnpj).length > 0;
  const cnpjInvalido = cnpjPreenchido && !validarCnpj(campos.cnpj);
  const travaCnpj = campos.mostrarEnderecoCnpj && cnpjInvalido;

  const mudou = configCompleta ? !mesmoLayout(campos, extrairLayout(configCompleta)) : false;
  const podeSalvar = mudou && !travaCnpj && !salvando;

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    setStatus(null);
    try {
      // Grava só os cinco campos desta tela por cima da última config lida —
      // nunca o objeto inteiro montado aqui, senão salvar o rodapé
      // empurraria pro banco a impressora/os pontos como estavam no
      // carregamento, desfazendo o que foi mexido em outra aba.
      const config = {
        ...(configCompleta ?? {}),
        mostrarLogo: campos.mostrarLogo,
        mostrarEnderecoCnpj: campos.mostrarEnderecoCnpj,
        endereco: campos.endereco.trim(),
        cnpj: campos.cnpj.trim(),
        rodapePersonalizado: campos.rodapePersonalizado.trim(),
      };
      const { error } = await salvarConfigImpressao(config);
      setStatus(error ? "erro" : "sucesso");
      if (!error) {
        setConfigCompleta(config);
        setCampos(extrairLayout(config));
      }
    } finally {
      setSalvando(false);
    }
  };

  if (erroCarga) {
    return (
      <div className="layout-comanda__erro-carga" role="alert">
        <LuCircleAlert size={20} aria-hidden />
        <div>
          <strong>Não deu para carregar o layout da comanda.</strong>
          <p>{erroCarga}</p>
          <p>Nada foi alterado. Verifique a internet e tente de novo.</p>
        </div>
        <button type="button" className="layout-comanda__botao-recarregar" onClick={carregar}>
          <LuRefreshCw size={16} aria-hidden /> Tentar de novo
        </button>
      </div>
    );
  }

  if (carregando) {
    return <div className="layout-comanda__carregando" role="status">Carregando…</div>;
  }

  return (
    <div className="layout-comanda">
      <p className="layout-comanda__intro">
        É isto que sai impresso na comanda que o cliente leva — no comprovante de pagamento, na
        pré-nota e nos comprovantes de caixa. O ticket da cozinha não muda.
      </p>

      <div className="layout-comanda__colunas">
        <div className="layout-comanda__form">

          {/* ── Logo ────────────────────────────────────────────────── */}
          <section className="layout-comanda__secao">
            <h3 className="layout-comanda__titulo-secao">Topo do papel</h3>

            <div className="layout-comanda__linha-toggle">
              <div>
                <div className="layout-comanda__label layout-comanda__label--inline">Imprimir o logo</div>
                <div className="layout-comanda__ajuda">
                  {temLogo
                    ? "Desligando, sai o nome do estabelecimento escrito no lugar da imagem."
                    : "Você ainda não enviou um logo — por enquanto sai o nome escrito. O logo é enviado na aba Identidade."}
                </div>
              </div>
              <button
                type="button"
                onClick={() => atualizar("mostrarLogo", !campos.mostrarLogo)}
                className={`layout-comanda__toggle${campos.mostrarLogo ? " layout-comanda__toggle--on" : ""}`}
                role="switch"
                aria-checked={campos.mostrarLogo}
                aria-label="Imprimir o logo"
              >
                <span className="layout-comanda__toggle-bolinha" />
              </button>
            </div>
          </section>

          {/* ── Endereço e CNPJ ─────────────────────────────────────── */}
          <section className="layout-comanda__secao">
            <h3 className="layout-comanda__titulo-secao">Endereço e CNPJ</h3>

            <div className="layout-comanda__linha-toggle">
              <div>
                <div className="layout-comanda__label layout-comanda__label--inline">Imprimir endereço e CNPJ</div>
                <div className="layout-comanda__ajuda">
                  Aparecem logo abaixo do nome. Este papel não substitui nota fiscal.
                </div>
              </div>
              <button
                type="button"
                onClick={() => atualizar("mostrarEnderecoCnpj", !campos.mostrarEnderecoCnpj)}
                className={`layout-comanda__toggle${campos.mostrarEnderecoCnpj ? " layout-comanda__toggle--on" : ""}`}
                role="switch"
                aria-checked={campos.mostrarEnderecoCnpj}
                aria-label="Imprimir endereço e CNPJ"
              >
                <span className="layout-comanda__toggle-bolinha" />
              </button>
            </div>

            {/* Campos só aparecem quando vão ser impressos — sem isso, o dono
                preenche o endereço e não entende por que não sai no papel. */}
            {campos.mostrarEnderecoCnpj && (
              <>
                <div className="layout-comanda__campo">
                  <label className="layout-comanda__label" htmlFor="layout-endereco">Endereço</label>
                  <input
                    id="layout-endereco"
                    type="text"
                    className="layout-comanda__input"
                    value={campos.endereco}
                    maxLength={MAX_ENDERECO}
                    placeholder="Rua das Flores, 120 — Centro"
                    onChange={(e) => atualizar("endereco", e.target.value)}
                  />
                </div>

                <div className="layout-comanda__campo">
                  <label className="layout-comanda__label" htmlFor="layout-cnpj">CNPJ</label>
                  <input
                    id="layout-cnpj"
                    type="text"
                    inputMode="numeric"
                    className="layout-comanda__input"
                    value={campos.cnpj}
                    maxLength={MAX_CNPJ}
                    placeholder="00.000.000/0000-00"
                    aria-invalid={cnpjInvalido || undefined}
                    onChange={(e) => atualizar("cnpj", formatarDocumento(e.target.value, "cnpj"))}
                  />
                  {cnpjInvalido && (
                    <div className="layout-comanda__status layout-comanda__status--erro">
                      <LuCircleAlert size={13} aria-hidden /> Confira os 14 dígitos do CNPJ.
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          {/* ── Rodapé ──────────────────────────────────────────────── */}
          <section className="layout-comanda__secao">
            <h3 className="layout-comanda__titulo-secao">Mensagem do rodapé</h3>

            <div className="layout-comanda__campo">
              <label className="layout-comanda__label" htmlFor="layout-rodape">
                Última linha da comanda
              </label>
              <input
                id="layout-rodape"
                type="text"
                className="layout-comanda__input"
                value={campos.rodapePersonalizado}
                maxLength={MAX_RODAPE}
                placeholder={CONFIG_IMPRESSAO_PADRAO.rodapePersonalizado}
                onChange={(e) => atualizar("rodapePersonalizado", e.target.value)}
              />
              <div className="layout-comanda__ajuda">
                {campos.rodapePersonalizado.trim()
                  ? `${campos.rodapePersonalizado.trim().length} de ${MAX_RODAPE} caracteres.`
                  : "Deixando em branco, a comanda sai sem mensagem no fim."}
              </div>
            </div>
          </section>

          <div className="layout-comanda__acoes">
            <button
              type="button"
              onClick={salvar}
              disabled={!podeSalvar}
              title={travaCnpj ? "Corrija o CNPJ para poder salvar" : undefined}
              className="layout-comanda__btn-salvar"
            >
              {salvando ? "Salvando…" : "Salvar layout"}
            </button>
            {status === "sucesso" && !mudou && (
              <span className="layout-comanda__status layout-comanda__status--sucesso" role="status">
                <LuCircleCheck size={13} aria-hidden /> Salvo
              </span>
            )}
            {status === "erro" && (
              <span className="layout-comanda__status layout-comanda__status--erro" role="alert">
                <LuCircleAlert size={13} aria-hidden /> Não deu para salvar. Tente de novo.
              </span>
            )}
            {!mudou && !salvando && status !== "sucesso" && (
              <span className="layout-comanda__ajuda">Nada mudou ainda.</span>
            )}
          </div>
        </div>

        {/* Prévia ao vivo — é o que torna a tela intuitiva: o dono vê a
            comanda mudando enquanto digita, com a marca dele, em vez de
            imprimir para descobrir como ficou. */}
        <div className="layout-comanda__preview-coluna">
          <div className="layout-comanda__label">Como vai sair ({larguraPrevia}mm)</div>
          <div className="layout-comanda__preview-moldura">
            <iframe
              title="Pré-visualização da comanda"
              srcDoc={htmlPreview}
              className="layout-comanda__preview-iframe"
            />
          </div>
          <div className="layout-comanda__ajuda">
            Comanda de exemplo. Os itens e os valores são só ilustrativos.
          </div>
        </div>
      </div>
    </div>
  );
}
