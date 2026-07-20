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

export default function CheckoutEntrega({ slug, dados, onMudar, onVoltar, onAvancar }) {
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [taxa, setTaxa] = useState(null); // { ok, taxa, motivo, km }
  const [calculandoTaxa, setCalculandoTaxa] = useState(false);
  const cepAnterior = useRef("");

  // Quando o CEP fica completo: ViaCEP preenche bairro/rua (uma vez por CEP).
  useEffect(() => {
    const cep = apenasDigitosCep(dados.cep);
    if (!cepCompleto(cep) || cep === cepAnterior.current) return;
    cepAnterior.current = cep;

    let ativo = true;
    (async () => {
      setBuscandoCep(true);
      const { data } = await buscarEnderecoViaCep(cep);
      if (!ativo) return;
      // Preenche o que veio do ViaCEP (sem sobrescrever o que o cliente digitou).
      onMudar({
        bairro: dados.bairro || data?.bairro || "",
        endereco:
          dados.endereco ||
          [data?.logradouro, data?.cidade && `${data.cidade}/${data.uf}`]
            .filter(Boolean)
            .join(" - "),
      });
      setBuscandoCep(false);
    })();
    return () => {
      ativo = false;
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
      return;
    }
    const bairro = dados.bairro || "";
    const endereco = dados.endereco || "";

    let ativo = true;
    const t = setTimeout(async () => {
      setCalculandoTaxa(true);

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
  }, [dados.cep, dados.bairro, dados.endereco, slug]);

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
              <p className="linha-sacola__extra" style={{ marginTop: 6 }}>
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
            className="btn btn--primario"
            onClick={onAvancar}
            disabled={!podeAvancar}
            style={{ marginTop: 8 }}
          >
            <span>Ir para o pagamento</span>
          </button>
        </div>
      </div>
    </div>
  );
}
