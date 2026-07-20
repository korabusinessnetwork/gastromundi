// ──────────────────────────────────────────────────────────────────
// CardapioPage — vitrine pública de delivery (anon, por slug).
//
// Orquestra o fluxo inteiro: white-label do tenant (mesma marca do
// pré-login) → cardápio → produto (complementos) → sacola → entrega
// (CEP/taxa) → pagamento → confirmação. Login NÃO é obrigatório: fala
// só com as 3 RPCs por slug; preço/taxa sempre recalculados no servidor.
//
// Intuitividade (Princípio nº 1): uma coisa por vez em bottom-sheet,
// barra fixa da sacola sempre à mão, estados de carregando/erro/vazio/
// fechado com feedback humano.
// ──────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import {
  gerarVariaveisTema,
  aplicarVariaveisTema,
  limparVariaveisTema,
  aplicarTituloDocumento,
  nomeExibicaoTenant,
  logoUrlTenant,
} from "@/lib/tema";
import { layoutDoTema, varianteDoHorario, variaveisDoLayout } from "@/layouts";
import { resolverSlugTenant, slugDoSubdominio } from "@/lib/tenantSlug";
import { buscarBrandingPorSlug } from "@/lib/tenant";
import { lerBrandingCache, salvarBrandingCache } from "@/lib/brandingCache";
import {
  carregarCardapio,
  enviarPedido,
  formatarPreco,
  montarPayloadPedido,
} from "@/lib/delivery";
import { useCarrinho } from "./useCarrinho";
import CardapioLista from "./CardapioLista";
import ProdutoModal from "./ProdutoModal";
import SacolaModal from "./SacolaModal";
import CheckoutEntrega from "./CheckoutEntrega";
import CheckoutPagamento from "./CheckoutPagamento";
import Confirmacao from "./Confirmacao";
import "./vitrine.css";

const ENTREGA_INICIAL = {
  nome: "",
  telefone: "",
  cep: "",
  bairro: "",
  endereco: "",
  complemento: "",
  taxa: 0,
};
const PAGAMENTO_INICIAL = { forma: "", trocoPara: "", levarMaquininha: false };

export default function CardapioPage() {
  // Slug do subdomínio (fallback só em dev/apex, como no resto do app).
  const slug = useMemo(() => slugDoSubdominio() ?? resolverSlugTenant(), []);

  // Marca (nome/logo) — cache por origem pinta certo já na 1ª tela.
  const [marca, setMarca] = useState(() => {
    const cache = lerBrandingCache();
    if (cache?.nome || cache?.logo) return { nome: cache.nome ?? "", logo: cache.logo };
    return { nome: "", logo: null };
  });

  const [cardapio, setCardapio] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  // Fluxo (bottom-sheets sobre o cardápio): produto | sacola | entrega |
  // pagamento | confirmacao. `produtoAberto` guarda o produto em edição.
  const [produtoAberto, setProdutoAberto] = useState(null);
  const [tela, setTela] = useState(null);
  const [entrega, setEntrega] = useState(ENTREGA_INICIAL);
  const [pagamento, setPagamento] = useState(PAGAMENTO_INICIAL);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const { itens, adicionar, remover, alterarQtd, limpar, subtotal, quantidade } =
    useCarrinho(slug);

  // ── White-label: aplica o tema do tenant (--gm-*) e a marca, igual ao
  //    pré-login. A vitrine toda usa var(--gm-*), então se recolore sozinha.
  useEffect(() => {
    let ativo = true;
    (async () => {
      const { data } = await buscarBrandingPorSlug(slug);
      if (!ativo || !data) return;
      const variaveis = {
        ...variaveisDoLayout(layoutDoTema(data.tema), varianteDoHorario(new Date().getHours())),
        ...gerarVariaveisTema(data.tema),
      };
      if (Object.keys(variaveis).length > 0) {
        limparVariaveisTema();
        aplicarVariaveisTema(variaveis);
      }
      const nome = nomeExibicaoTenant(data.tema, data.nome || "");
      setMarca({ nome, logo: logoUrlTenant(data.tema) });
      aplicarTituloDocumento(nome ? `${nome} · Delivery` : "Delivery");
      salvarBrandingCache({ nome, logo: logoUrlTenant(data.tema), variaveis });
    })();
    return () => {
      ativo = false;
    };
  }, [slug]);

  // ── Carrega o cardápio público pelo slug.
  useEffect(() => {
    let ativo = true;
    (async () => {
      setCarregando(true);
      setErro("");
      const { data, error } = await carregarCardapio(slug);
      if (!ativo) return;
      if (error) {
        setErro("Não conseguimos carregar o cardápio agora. Tente novamente em instantes.");
        setCardapio(null);
      } else if (!data) {
        // Slug sem delivery configurado (RPC devolve NULL): endereço sem loja.
        setCardapio(null);
        setErro("");
      } else {
        setCardapio(data);
      }
      setCarregando(false);
    })();
    return () => {
      ativo = false;
    };
  }, [slug]);

  const aberto = !!cardapio?.aberto;

  function onAdicionar(item) {
    adicionar(item);
    setProdutoAberto(null);
  }

  async function confirmarPedido() {
    if (enviando) return;
    setEnviando(true);
    const payload = montarPayloadPedido({
      cliente: { nome: entrega.nome, telefone: entrega.telefone },
      entrega,
      pagamento,
      itens,
    });
    const { data, error } = await enviarPedido(slug, payload);
    setEnviando(false);
    if (error || !data?.ok) {
      setErro(error?.message || "Não foi possível enviar o pedido. Tente novamente.");
      setTela("pagamento");
      return;
    }
    setResultado(data);
    setTela("confirmacao");
  }

  function fecharConfirmacao() {
    // Sucesso: limpa sacola e volta ao cardápio zerado para um novo pedido.
    limpar();
    setEntrega(ENTREGA_INICIAL);
    setPagamento(PAGAMENTO_INICIAL);
    setResultado(null);
    setTela(null);
    setErro("");
  }

  // ── Estados de página inteira (carregando / erro / sem loja) ───────
  if (carregando) {
    return (
      <div className="vitrine">
        <div className="vitrine__wrap">
          <div className="vitrine__estado">
            <div className="vitrine__estado-emoji">⏳</div>
            <p>Carregando o cardápio…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!cardapio) {
    return (
      <div className="vitrine">
        <div className="vitrine__wrap">
          <div className="vitrine__estado">
            <div className="vitrine__estado-emoji">{erro ? "😕" : "🏪"}</div>
            <p>
              {erro ||
                "Este endereço ainda não tem delivery disponível. Confira o link do estabelecimento."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vitrine">
      <div className="vitrine__wrap">
        {/* Cabeçalho fixo com a marca do estabelecimento + status */}
        <header className="vitrine__header">
          {marca.logo ? (
            <img className="vitrine__logo" src={marca.logo} alt={marca.nome || "Logo"} />
          ) : null}
          <div>
            <p className="vitrine__marca">{marca.nome || "Cardápio"}</p>
            <span
              className={`vitrine__status ${aberto ? "vitrine__status--aberto" : "vitrine__status--fechado"}`}
            >
              {aberto ? "Aberto agora" : "Fechado no momento"}
            </span>
          </div>
        </header>

        {/* Loja fechada: mostra o cardápio, mas avisa e bloqueia o pedido */}
        {!aberto && (
          <div className="vitrine__aviso">
            O estabelecimento está fechado agora. Você pode ver o cardápio, mas os
            pedidos abrem no horário de funcionamento.
          </div>
        )}

        {erro && aberto && <div className="vitrine__aviso vitrine__aviso--erro">{erro}</div>}

        <CardapioLista cardapio={cardapio} onAbrirProduto={setProdutoAberto} />

        {/* Espaço para a barra fixa da sacola não cobrir o último card */}
        <div style={{ height: quantidade > 0 && aberto ? 88 : 24 }} />
      </div>

      {/* Barra fixa da sacola — só aparece com itens e loja aberta */}
      {quantidade > 0 && aberto && (
        <div className="sacola-barra">
          <button
            className="sacola-barra__inner"
            onClick={() => setTela("sacola")}
            aria-label="Ver a sacola"
          >
            <span className="sacola-barra__badge">{quantidade}</span>
            <span>Ver sacola</span>
            <span className="btn__preco">{formatarPreco(subtotal)}</span>
          </button>
        </div>
      )}

      {/* Modais / bottom-sheets — um passo por vez */}
      {produtoAberto && (
        <ProdutoModal
          produto={produtoAberto}
          onFechar={() => setProdutoAberto(null)}
          onAdicionar={onAdicionar}
        />
      )}

      {tela === "sacola" && (
        <SacolaModal
          itens={itens}
          subtotal={subtotal}
          pedidoMinimo={cardapio.pedido_minimo}
          onFechar={() => setTela(null)}
          onAlterarQtd={alterarQtd}
          onRemover={remover}
          onAvancar={() => setTela("entrega")}
        />
      )}

      {tela === "entrega" && (
        <CheckoutEntrega
          slug={slug}
          dados={entrega}
          onMudar={(patch) => setEntrega((d) => ({ ...d, ...patch }))}
          onVoltar={() => setTela("sacola")}
          onAvancar={() => setTela("pagamento")}
        />
      )}

      {tela === "pagamento" && (
        <CheckoutPagamento
          dados={pagamento}
          subtotal={subtotal}
          taxa={entrega.taxa}
          onMudar={(patch) => setPagamento((d) => ({ ...d, ...patch }))}
          onVoltar={() => setTela("entrega")}
          onConfirmar={confirmarPedido}
          enviando={enviando}
        />
      )}

      {tela === "confirmacao" && (
        <Confirmacao
          resultado={resultado}
          tempoPreparo={cardapio.tempo_preparo_min}
          onFechar={fecharConfirmacao}
        />
      )}
    </div>
  );
}
