import { useState, useEffect, useMemo, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { buscarConfigImpressao, salvarConfigImpressao, montarCupomPreNota, CONFIG_IMPRESSAO_PADRAO } from "@/lib/impressao";
import { gerarHtmlComPerfil } from "@/lib/impressao/drivers/browserRaster";
import { logoUrlTenant } from "@/lib/tema";
import { LuCircleCheck, LuCircleAlert, LuRefreshCw } from "react-icons/lu";
import "./LayoutComanda.css";

/**
 * Layout da comanda — o que sai IMPRESSO no papel que vai para a mão do
 * cliente: cabeçalho (logo, endereço, CNPJ) e rodapé (mensagem). É a
 * outra metade da aba Impressão: "Impressora e papel" cuida do
 * equipamento (driver, largura, fonte), esta cuida do conteúdo.
 *
 * Os campos já existiam em `CONFIG_IMPRESSAO_PADRAO` e já eram lidos por
 * `resolverIdentidadeTenant` nos DOIS caminhos de impressão (HTML do
 * navegador e texto ESC/POS da Ponte) — só não havia tela para editá-los.
 * Nada do pipeline de renderização muda aqui.
 *
 * Multi-tenant (decisão 017): nome e logo vêm do tenant, nunca do código.
 */

// Limites de tamanho. São prevenção de erro, não validação de tela: papel
// térmico tem 32 (58mm) ou 48 (80mm) colunas — texto muito maior que isso
// vira um bloco ilegível no rodapé do cupom.
const MAX_ENDERECO = 120;
const MAX_RODAPE = 120;
const DIGITOS_CNPJ = 14;

// Venda de exemplo da pré-visualização — nunca é uma venda real. Passa
// pelo MESMO montador que o fechamento usa (`montarCupomPreNota`), então
// o que o dono vê aqui é a renderização exata que sai no papel, não uma
// imitação. Itens genéricos de propósito: é um exemplo mostrado a todo
// estabelecimento, não pode ser o cardápio de nenhum (decisão 017).
const VENDA_EXEMPLO = {
  comanda: "42",
  items: [
    { name: "Prato do dia", qty: 2, price: 32.5, emoji: "🍽️", obs: ["sem cebola"] },
    { name: "Refrigerante lata", qty: 1, price: 6, emoji: "🥤", obs: [] },
  ],
  valorTaxa: 7.1,
  total: 78.1,
  pagamentos: [{ metodo: "pix", valor: 78.1, troco: 0 }],
};

const CHAVES_LAYOUT = ["mostrarLogo", "mostrarEnderecoCnpj", "endereco", "cnpj", "rodapePersonalizado"];

/**
 * Aplica a máscara 00.000.000/0000-00 conforme se digita. Prevenção de
 * erro (princípio nº1): o dono digita só números e o CNPJ sai formatado
 * igual no papel de todo mundo, sem depender de ele acertar a pontuação.
 * Pura.
 *
 * @param {any} valor
 * @returns {string}
 */
export function formatarCnpj(valor) {
  const d = String(valor ?? "").replace(/\D/g, "").slice(0, DIGITOS_CNPJ);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Normaliza a fatia de layout: é ela que vai para o banco E a que
 * alimenta a pré-visualização — assim o que o dono vê é exatamente o
 * que ele salva, sem espaço sobrando nem pontuação torta no meio. Pura.
 *
 * @param {object} valores
 * @returns {{mostrarLogo: boolean, mostrarEnderecoCnpj: boolean, endereco: string, cnpj: string, rodapePersonalizado: string}}
 */
export function normalizarLayout(valores) {
  return {
    mostrarLogo: valores?.mostrarLogo !== false,
    mostrarEnderecoCnpj: valores?.mostrarEnderecoCnpj === true,
    endereco: String(valores?.endereco ?? "").trim().slice(0, MAX_ENDERECO),
    cnpj: formatarCnpj(valores?.cnpj),
    rodapePersonalizado: String(valores?.rodapePersonalizado ?? "").trim().slice(0, MAX_RODAPE),
  };
}

// Uma linha = um interruptor com o texto que explica o que acontece nos
// dois estados. O texto muda com a chave de propósito: quem lê descobre
// o efeito sem precisar clicar para descobrir (mesmo padrão de
// "Onde cada item imprime").
function LinhaChave({ titulo, descricao, ligado, onAlternar }) {
  return (
    <div className="layout-comanda__linha-toggle">
      <div>
        <div className="layout-comanda__label layout-comanda__label--inline">{titulo}</div>
        <div className="layout-comanda__ajuda">{descricao}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={titulo}
        onClick={onAlternar}
        className={`layout-comanda__toggle${ligado ? " layout-comanda__toggle--on" : ""}`}
      >
        <span className="layout-comanda__toggle-bolinha" />
      </button>
    </div>
  );
}

export default function LayoutComanda() {
  const { tenant } = useApp();

  const [layout, setLayout] = useState(() => normalizarLayout(CONFIG_IMPRESSAO_PADRAO));
  // Última fatia gravada — é contra ela que "Salvar" decide se há algo a
  // salvar, para o botão não convidar a gravar o que já está no banco.
  const [layoutSalvo, setLayoutSalvo] = useState(null);
  const [configCompleta, setConfigCompleta] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState(null); // null | "sucesso" | "erro"

  // Falha na LEITURA não pode virar tela normal com os valores de
  // fábrica: o dono veria o rodapé padrão no lugar do dele e, ao salvar
  // por cima, apagaria a configuração real que só não foi lida. Erro de
  // leitura tranca a tela (mesma regra de "Impressora e papel").
  const carregar = useCallback(() => {
    setCarregando(true);
    setErroCarga(null);
    buscarConfigImpressao()
      .then(({ data, error }) => {
        if (error || !data) throw error ?? new Error("Não deu para ler a configuração de impressão.");
        const fatia = normalizarLayout(data);
        setConfigCompleta(data);
        setLayout(fatia);
        setLayoutSalvo(fatia);
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

  const atualizarCampo = (campo, valor) => {
    setLayout((prev) => ({ ...prev, [campo]: valor }));
    setStatus(null);
  };

  const paraSalvar = useMemo(() => normalizarLayout(layout), [layout]);

  const alterado = useMemo(
    () => layoutSalvo != null && CHAVES_LAYOUT.some((k) => paraSalvar[k] !== layoutSalvo[k]),
    [paraSalvar, layoutSalvo],
  );

  // Grava só a fatia de layout por cima do que já está salvo — salvar o
  // cabeçalho nunca descarta a impressora escolhida na outra aba.
  const salvar = async () => {
    if (salvando || !alterado) return;
    setSalvando(true);
    setStatus(null);
    try {
      const config = { ...(configCompleta ?? {}), ...paraSalvar };
      const { error } = await salvarConfigImpressao(config);
      if (error) {
        setStatus("erro");
        return;
      }
      setConfigCompleta(config);
      setLayoutSalvo(paraSalvar);
      setStatus("sucesso");
    } finally {
      setSalvando(false);
      setTimeout(() => setStatus((s) => (s === "sucesso" ? null : s)), 2500);
    }
  };

  // Pré-visualização ao vivo — é o que torna a tela intuitiva: o dono vê
  // o cupom mudar enquanto mexe, com o NOME e a LOGO do próprio
  // estabelecimento, na largura e na fonte já configuradas na aba
  // "Impressora e papel". Nada de imaginar o resultado.
  const htmlPreview = useMemo(() => {
    const documento = montarCupomPreNota({ venda: VENDA_EXEMPLO, tenant, configImpressao: paraSalvar });
    return gerarHtmlComPerfil(documento, configCompleta?.perfilImpressora);
  }, [paraSalvar, tenant, configCompleta]);

  // Ligar "mostrar logo" sem logo cadastrada não dá erro nenhum — o
  // cabeçalho só cai para o nome escrito. Sem este aviso o dono ligaria a
  // chave e ficaria procurando a logo que nunca existiu.
  const semLogoCadastrada = !logoUrlTenant(tenant?.tema);

  const digitosCnpj = paraSalvar.cnpj.replace(/\D/g, "").length;
  const cnpjIncompleto = digitosCnpj > 0 && digitosCnpj < DIGITOS_CNPJ;

  if (erroCarga) {
    return (
      <div className="layout-comanda__erro-carga">
        <LuCircleAlert size={20} />
        <div>
          <strong>Não deu para carregar o layout da comanda.</strong>
          <p>{erroCarga}</p>
          <p>Nada foi alterado. Verifique a internet e tente de novo.</p>
        </div>
        <button type="button" className="layout-comanda__botao-recarregar" onClick={carregar}>
          <LuRefreshCw size={16} /> Tentar de novo
        </button>
      </div>
    );
  }

  if (carregando) {
    return <div className="layout-comanda__carregando">Carregando…</div>;
  }

  return (
    <div className="layout-comanda">
      <p className="layout-comanda__intro">
        Escolha o que sai impresso na comanda do cliente — a conta que vai para a mesa e o
        comprovante do pagamento. A via da cozinha não muda aqui: ela sai só com os itens,
        sem logo e sem endereço, para o cozinheiro ler rápido.
      </p>

      <div className="layout-comanda__colunas">
        <div className="layout-comanda__form">

          {/* ── Seção 1 — Cabeçalho (topo do papel) ─────────────────── */}
          <section className="layout-comanda__secao">
            <h3 className="layout-comanda__titulo-secao">Cabeçalho</h3>

            <LinhaChave
              titulo="Imprimir a logo do estabelecimento"
              descricao={layout.mostrarLogo
                ? "A logo sai no topo da comanda. Sem logo cadastrada, sai o nome escrito."
                : "Sai só o nome do estabelecimento escrito, sem imagem — gasta menos tinta e imprime mais rápido."}
              ligado={layout.mostrarLogo}
              onAlternar={() => atualizarCampo("mostrarLogo", !layout.mostrarLogo)}
            />
            {layout.mostrarLogo && semLogoCadastrada && (
              <div className="layout-comanda__status layout-comanda__status--atencao">
                <LuCircleAlert size={13} />
                Este estabelecimento ainda não tem logo. Cadastre em Configurações → Identidade;
                até lá o cabeçalho sai com o nome escrito.
              </div>
            )}

            <LinhaChave
              titulo="Imprimir endereço e CNPJ"
              descricao={layout.mostrarEnderecoCnpj
                ? "Saem logo abaixo do nome, no topo da comanda."
                : "A comanda sai só com o nome do estabelecimento no topo."}
              ligado={layout.mostrarEnderecoCnpj}
              onAlternar={() => atualizarCampo("mostrarEnderecoCnpj", !layout.mostrarEnderecoCnpj)}
            />

            {/* Os campos só aparecem com a chave ligada: preencher um
                endereço que não vai ser impresso é trabalho jogado fora. */}
            {layout.mostrarEnderecoCnpj && (
              <div className="layout-comanda__campos-fiscais">
                {/* Rótulo é <label for> e o texto de ajuda fica FORA dele:
                    dentro, o leitor de tela anuncia a explicação inteira
                    como se fosse o nome do campo. */}
                <div className="layout-comanda__campo">
                  <label className="layout-comanda__label" htmlFor="layout-comanda-endereco">Endereço</label>
                  <input
                    id="layout-comanda-endereco"
                    type="text"
                    value={layout.endereco}
                    maxLength={MAX_ENDERECO}
                    onChange={(e) => atualizarCampo("endereco", e.target.value)}
                    placeholder="Rua, número, bairro — cidade/UF"
                    className="layout-comanda__input"
                  />
                </div>

                <div className="layout-comanda__campo">
                  <label className="layout-comanda__label" htmlFor="layout-comanda-cnpj">CNPJ</label>
                  <input
                    id="layout-comanda-cnpj"
                    type="text"
                    inputMode="numeric"
                    value={layout.cnpj}
                    onChange={(e) => atualizarCampo("cnpj", formatarCnpj(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    className="layout-comanda__input"
                  />
                  {cnpjIncompleto && (
                    <span className="layout-comanda__status layout-comanda__status--atencao">
                      <LuCircleAlert size={13} /> Faltam {DIGITOS_CNPJ - digitosCnpj} números para o CNPJ ficar completo.
                    </span>
                  )}
                </div>

                <div className="layout-comanda__ajuda">
                  Em branco, a linha simplesmente não é impressa. A comanda não é
                  documento fiscal — isso aqui é só a identificação do estabelecimento.
                </div>
              </div>
            )}
          </section>

          {/* ── Seção 2 — Rodapé (fim do papel) ─────────────────────── */}
          <section className="layout-comanda__secao">
            <h3 className="layout-comanda__titulo-secao">Rodapé</h3>

            <div className="layout-comanda__campo">
              <label className="layout-comanda__label" htmlFor="layout-comanda-rodape">Mensagem no fim da comanda</label>
              <input
                id="layout-comanda-rodape"
                type="text"
                value={layout.rodapePersonalizado}
                maxLength={MAX_RODAPE}
                onChange={(e) => atualizarCampo("rodapePersonalizado", e.target.value)}
                placeholder="Ex.: Obrigado pela preferência!"
                className="layout-comanda__input"
              />
              <span className="layout-comanda__ajuda">
                Sai na última linha, para o cliente ler ao guardar o papel. Wi-fi, telefone,
                Instagram, horário — o que você quiser. Em branco, nada é impresso no rodapé.
              </span>
            </div>
          </section>

          <div className="layout-comanda__acoes">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando || !alterado}
              title={!alterado && !salvando ? "Nada mudou desde a última vez que você salvou" : undefined}
              className="layout-comanda__btn-salvar"
            >
              {salvando ? "Salvando…" : "Salvar layout"}
            </button>
            {status === "sucesso" && (
              <span className="layout-comanda__status layout-comanda__status--sucesso">
                <LuCircleCheck size={13} /> Salvo — a próxima comanda já sai assim
              </span>
            )}
            {status === "erro" && (
              <span className="layout-comanda__status layout-comanda__status--erro">
                <LuCircleAlert size={13} /> Falha ao salvar — nada mudou
              </span>
            )}
            {!alterado && !salvando && status == null && (
              <span className="layout-comanda__ajuda">Tudo salvo.</span>
            )}
          </div>
        </div>

        {/* Pré-visualização ao vivo — mesma renderização que sai no papel. */}
        <div className="layout-comanda__preview-coluna">
          <div className="layout-comanda__label">Como vai sair no papel</div>
          <div className="layout-comanda__preview-moldura">
            <iframe title="Pré-visualização da comanda" srcDoc={htmlPreview} className="layout-comanda__preview-iframe" />
          </div>
          <div className="layout-comanda__ajuda">
            Exemplo com uma venda de mentira. A largura e o tamanho da letra vêm da aba
            “Impressora e papel”.
          </div>
        </div>
      </div>
    </div>
  );
}
