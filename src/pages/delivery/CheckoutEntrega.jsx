// ──────────────────────────────────────────────────────────────────
// CheckoutEntrega — nome/telefone + CEP → ViaCEP traz bairro/rua → taxa
// calculada no servidor (calcularTaxaEntrega). Degradação graciosa: se o
// ViaCEP falhar, o cliente digita bairro/endereço à mão (nunca trava por
// terceiro). "Fora da área de entrega" bloqueia o avanço com aviso claro.
// ──────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import {
  apenasDigitosCep,
  buscarEnderecoViaCep,
  calcularTaxaEntrega,
  cepCompleto,
  formatarCep,
  formatarPreco,
} from "@/lib/delivery";

export default function CheckoutEntrega({ slug, dados, onMudar, onVoltar, onAvancar }) {
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [taxa, setTaxa] = useState(null); // { ok, taxa, motivo }
  const [calculandoTaxa, setCalculandoTaxa] = useState(false);
  const cepAnterior = useRef("");

  // Quando o CEP fica completo: ViaCEP (bairro/rua) → taxa (servidor).
  useEffect(() => {
    const cep = apenasDigitosCep(dados.cep);
    if (!cepCompleto(cep) || cep === cepAnterior.current) return;
    cepAnterior.current = cep;

    let ativo = true;
    (async () => {
      setBuscandoCep(true);
      const { data } = await buscarEnderecoViaCep(cep);
      if (!ativo) return;
      const bairro = data?.bairro || dados.bairro || "";
      // Preenche o que veio do ViaCEP (sem sobrescrever o que o cliente já digitou).
      onMudar({
        bairro,
        endereco:
          dados.endereco ||
          [data?.logradouro, data?.cidade && `${data.cidade}/${data.uf}`]
            .filter(Boolean)
            .join(" - "),
      });
      setBuscandoCep(false);

      setCalculandoTaxa(true);
      const { data: taxaRes } = await calcularTaxaEntrega(slug, cep, bairro);
      if (!ativo) return;
      setTaxa(taxaRes);
      if (taxaRes?.ok) onMudar({ taxa: Number(taxaRes.taxa) || 0 });
      setCalculandoTaxa(false);
    })();
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados.cep, slug]);

  const foraDeArea = taxa && !taxa.ok;
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
          {foraDeArea && (
            <div className="vitrine__aviso vitrine__aviso--erro">
              Esse endereço está fora da nossa área de entrega. Confira o CEP ou o
              bairro.
            </div>
          )}
          {temTaxa && (
            <div className="resumo">
              <div className="resumo__linha">
                <span>Taxa de entrega</span>
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
