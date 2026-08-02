// ──────────────────────────────────────────────────────────────────
// CheckoutEntrega — nome/telefone + CEP → ViaCEP traz bairro/rua → taxa
// calculada no servidor (calcularTaxaEntrega). Degradação graciosa: se o
// ViaCEP falhar, o cliente digita bairro/endereço à mão (nunca trava por
// terceiro). "Fora da área de entrega" bloqueia o avanço com aviso claro.
//
// Dois modos, decididos pelo SERVIDOR (o cliente não sabe qual é): por
// área (bairro/CEP) resolve na 1ª chamada; por distância (km) o servidor
// responde motivo:'sem_coordenada' — então geocodificamos o endereço
// digitado (Nominatim/OSM, grátis) e recalculamos com a coordenada. O
// preço por anel é sempre do servidor.
// ──────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import {
  apenasDigitosCep,
  buscarEnderecoViaCep,
  calcularTaxaEntrega,
  cepCompleto,
  formatarCep,
  formatarPreco,
  geocodificarEndereco,
} from "@/lib/delivery";
import "./CheckoutEntrega.css";

export default function CheckoutEntrega({ slug, dados, onMudar, onVoltar, onAvancar }) {
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [taxa, setTaxa] = useState(null); // { ok, taxa, motivo, km }
  const [erroTaxa, setErroTaxa] = useState("");
  const [calculandoTaxa, setCalculandoTaxa] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const cepAnterior = useRef("");

  // O que está nos campos AGORA, para as respostas que chegam atrasadas. A
  // closure do efeito congela `dados` no instante em que ele foi agendado.
  const dadosRef = useRef(dados);
  useEffect(() => {
    dadosRef.current = dados;
  });

  // Quando o CEP fica completo: ViaCEP preenche bairro/rua (uma vez por CEP).
  useEffect(() => {
    const cep = apenasDigitosCep(dados.cep);
    if (!cepCompleto(cep) || cep === cepAnterior.current) return;

    let ativo = true;
    setBuscandoCep(true);
    (async () => {
      const { data } = await buscarEnderecoViaCep(cep);
      if (!ativo) return;
      setBuscandoCep(false);
      // Só marca o CEP como resolvido quando o ViaCEP REALMENTE respondeu.
      // Marcar antes de perguntar transformava uma queda de rede (ou o
      // ViaCEP fora do ar) em "esse CEP não preenche nada" para sempre:
      // redigitar o mesmo CEP não tentava de novo, e o cliente acabava
      // digitando bairro e rua à mão sem entender por quê.
      if (!data) return;
      cepAnterior.current = cep;
      // O que o cliente digitou ENQUANTO o ViaCEP respondia tem que valer.
      // Lendo da closure, o bairro capturado era o de antes da busca (vazio)
      // — e a resposta passava por cima do bairro que o cliente tinha
      // acabado de corrigir, na frente dele.
      const atual = dadosRef.current;
      onMudar({
        bairro: atual.bairro || data.bairro || "",
        endereco:
          atual.endereco ||
          [data.logradouro, data.cidade && `${data.cidade}/${data.uf}`]
            .filter(Boolean)
            .join(" - "),
      });
    })();
    return () => {
      ativo = false;
      // Desligar aqui, e não só no caminho feliz: bastava apagar um dígito
      // enquanto o ViaCEP respondia para o "Buscando endereço…" ficar colado
      // na tela pelo resto da sessão, anunciando uma busca que não existia
      // mais. O cliente esperava por ela.
      setBuscandoCep(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.cep, slug]);

  // Calcula a taxa (servidor decide o modo). Recalcula com debounce quando
  // CEP/bairro/endereço mudam. No modo por km, o servidor pede coordenada
  // (motivo:'sem_coordenada') → geocodificamos o endereço e tentamos de novo.
  useEffect(() => {
    const cep = apenasDigitosCep(dados.cep);
    if (!cepCompleto(cep)) {
      setTaxa(null);
      setErroTaxa("");
      setCalculandoTaxa(false);
      return;
    }
    const bairro = dados.bairro || "";
    const endereco = dados.endereco || "";

    // JÁ marca como recalculando — não daqui a 700 ms, quando o debounce
    // dispara. Nessa janela a taxa na tela era a do endereço ANTERIOR e o
    // botão continuava liberado: dava tempo de trocar o bairro e avançar
    // pagando R$ 5 de um endereço que custa R$ 20 (ou que nem é atendido).
    // O servidor recalcula no fim, então o cliente só descobria no último
    // clique — cobrado a mais ou recusado depois de preencher tudo.
    let ativo = true;
    setCalculandoTaxa(true);
    const t = setTimeout(async () => {
      // 1ª tentativa sem coordenada — o modo por área (bairro/CEP) resolve aqui.
      let { data: res } = await calcularTaxaEntrega(slug, cep, bairro);

      // Modo por distância: o servidor pediu coordenada. Geocodifica o
      // endereço digitado e recalcula. Falha de geocode → mantém o motivo.
      let coord = null;
      if (res?.motivo === "sem_coordenada" && endereco.trim()) {
        const texto = [endereco, bairro].filter(Boolean).join(", ");
        const { data: geo } = await geocodificarEndereco(texto);
        if (geo) {
          coord = geo;
          const r2 = await calcularTaxaEntrega(slug, cep, bairro, geo.lat, geo.lng);
          res = r2.data;
        }
      }

      if (!ativo) return;
      setTaxa(res);
      // Sem resposta nenhuma (rede caída, RPC fora do ar, estabelecimento sem
      // entrega configurada) a tela não dizia UMA palavra: nenhum aviso,
      // nenhuma taxa, e o "Ir para o pagamento" desabilitado sem motivo
      // visível. O cliente preenchia tudo e ficava clicando num botão morto.
      setErroTaxa(
        res
          ? ""
          : "Não conseguimos calcular a taxa de entrega agora. Confira sua conexão e tente de novo."
      );
      if (res?.ok) {
        onMudar({
          taxa: Number(res.taxa) || 0,
          lat: coord ? coord.lat : null,
          lng: coord ? coord.lng : null,
        });
      }
      setCalculandoTaxa(false);
    }, 700);

    return () => {
      ativo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.cep, dados.bairro, dados.endereco, slug, tentativa]);

  const semCoordenada = taxa?.motivo === "sem_coordenada";
  const indisponivelKm = taxa?.motivo === "origem_indefinida";
  const foraDeArea = taxa && !taxa.ok && !semCoordenada && !indisponivelKm;
  const temTaxa = taxa?.ok;
  const podeAvancar =
    dados.nome.trim() &&
    cepCompleto(dados.cep) &&
    dados.endereco.trim() &&
    temTaxa &&
    !calculandoTaxa;

  return (
    <div className="modal-fundo" onClick={onVoltar}>
      <div className="modal-painel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-topo">
          <h2 className="modal-titulo">Entrega</h2>
          <button className="modal-fechar" onClick={onVoltar} aria-label="Voltar">
            ×
          </button>
        </div>

        <div className="modal-corpo">
          <div className="campo">
            <label className="campo__label" htmlFor="ent-nome">
              Seu nome
            </label>
            <input
              id="ent-nome"
              className="campo__input"
              value={dados.nome}
              maxLength={60}
              onChange={(e) => onMudar({ nome: e.target.value })}
              placeholder="Como te chamamos?"
            />
          </div>

          <div className="campo">
            <label className="campo__label" htmlFor="ent-tel">
              Telefone (opcional)
            </label>
            <input
              id="ent-tel"
              className="campo__input"
              value={dados.telefone}
              maxLength={20}
              inputMode="tel"
              onChange={(e) => onMudar({ telefone: e.target.value })}
              placeholder="Pra falar com você se precisar"
            />
          </div>

          <div className="campo">
            <label className="campo__label" htmlFor="ent-cep">
              CEP
            </label>
            <input
              id="ent-cep"
              className="campo__input"
              value={formatarCep(dados.cep)}
              inputMode="numeric"
              onChange={(e) => onMudar({ cep: apenasDigitosCep(e.target.value) })}
              placeholder="00000-000"
            />
            {buscandoCep && (
              <p className="linha-sacola__extra checkout-entrega__buscando">
                Buscando endereço…
              </p>
            )}
          </div>

          <div className="campo">
            <label className="campo__label" htmlFor="ent-bairro">
              Bairro
            </label>
            <input
              id="ent-bairro"
              className="campo__input"
              value={dados.bairro}
              maxLength={80}
              onChange={(e) => onMudar({ bairro: e.target.value })}
              placeholder="Seu bairro"
            />
          </div>

          <div className="campo">
            <label className="campo__label" htmlFor="ent-end">
              Endereço (rua, número)
            </label>
            <input
              id="ent-end"
              className="campo__input"
              value={dados.endereco}
              maxLength={160}
              onChange={(e) => onMudar({ endereco: e.target.value })}
              placeholder="Rua, número"
            />
          </div>

          <div className="campo">
            <label className="campo__label" htmlFor="ent-compl">
              Complemento (opcional)
            </label>
            <input
              id="ent-compl"
              className="campo__input"
              value={dados.complemento}
              maxLength={80}
              onChange={(e) => onMudar({ complemento: e.target.value })}
              placeholder="Apto, bloco, referência"
            />
          </div>

          {calculandoTaxa && (
            <div className="vitrine__aviso">Calculando a taxa de entrega…</div>
          )}
          {!calculandoTaxa && erroTaxa && (
            <div className="vitrine__aviso vitrine__aviso--erro" role="alert">
              <span>{erroTaxa}</span>
              <button
                type="button"
                className="vitrine__aviso-acao"
                onClick={() => setTentativa((n) => n + 1)}
              >
                Tentar de novo
              </button>
            </div>
          )}
          {!calculandoTaxa && semCoordenada && (
            <div className="vitrine__aviso vitrine__aviso--erro">
              Não consegui localizar seu endereço no mapa. Confira a rua e o número
              para calcular a entrega.
            </div>
          )}
          {!calculandoTaxa && indisponivelKm && (
            <div className="vitrine__aviso vitrine__aviso--erro">
              A entrega por distância está indisponível no momento. Fale com o
              estabelecimento.
            </div>
          )}
          {!calculandoTaxa && foraDeArea && (
            <div className="vitrine__aviso vitrine__aviso--erro">
              Esse endereço está fora da nossa área de entrega. Confira o CEP ou o
              bairro.
            </div>
          )}
          {temTaxa && (
            <div className="resumo">
              <div className="resumo__linha">
                <span>Taxa de entrega{Number(taxa?.km) > 0 ? ` · ${String(taxa.km).replace(".", ",")} km` : ""}</span>
                <span>
                  {Number(dados.taxa) > 0 ? formatarPreco(dados.taxa) : "Grátis"}
                </span>
              </div>
            </div>
          )}

          <button
            className="btn btn--primario checkout-entrega__avancar"
            onClick={onAvancar}
            disabled={!podeAvancar}
          >
            <span>Ir para o pagamento</span>
          </button>
        </div>
      </div>
    </div>
  );
}
