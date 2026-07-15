import { useEffect, useState } from "react";
import { montarSvgQrCode } from "@/lib/qrCodeSvg";
import "./CupomNfce.css";

/**
 * <CupomNfce> — DANFE NFC-e (o cupom do consumidor), Leva 4.
 *
 * Renderiza a ESTRUTURA já montada por `montarDanfeNfce` (src/lib/nfceDanfe.js).
 * Toda a lógica do cupom (totais, formatação, tarjas, estado pendente) vive
 * na função pura e testada; aqui é só apresentação — CSS separado do JSX
 * (decisão 018), num layout de cupom térmico estreito.
 *
 * Por que é intuitivo (Princípio nº1): lê de cima para baixo como um cupom
 * de verdade — emitente, itens, total em destaque, pagamento/troco, e por
 * fim a chave + QR para consulta. As tarjas de aviso (homologação,
 * contingência, pendente) aparecem no topo, em cor de alerta, para não
 * passarem despercebidas. Alvos e fontes legíveis a distância no PDV.
 *
 * O QR só é exibido quando a nota tem `urlQrCode` (nota autorizada, url já
 * pronta pela Leva 3). Sem ela, mostra o estado pendente — nunca inventa
 * um QR. A geração do SVG do QR é offline e gratuita (qrCodeSvg.js).
 *
 * @param {{ danfe: object }} props  danfe = retorno de montarDanfeNfce
 */
export default function CupomNfce({ danfe }) {
  const [qrSvg, setQrSvg] = useState(null);
  const [qrErro, setQrErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    setQrSvg(null);
    setQrErro(false);
    if (danfe?.mostrarQrCode && danfe?.urlQrCode) {
      montarSvgQrCode(danfe.urlQrCode)
        .then((svg) => ativo && setQrSvg(svg))
        .catch(() => ativo && setQrErro(true));
    }
    return () => {
      ativo = false;
    };
  }, [danfe?.urlQrCode, danfe?.mostrarQrCode]);

  if (!danfe) return null;

  const {
    emitente,
    itens,
    totais,
    pagamentos,
    troco,
    consumidor,
    chaveFormatada,
    avisos,
    autorizada,
    protocolo,
    textoLegal,
  } = danfe;

  return (
    <div className="cupom-nfce" role="document" aria-label="Cupom NFC-e">
      {/* Tarjas de aviso (homologação / contingência / pendente) */}
      {avisos?.length > 0 && (
        <div className="cupom-nfce__avisos">
          {avisos.map((aviso, i) => (
            <p key={i} className="cupom-nfce__aviso">
              {aviso}
            </p>
          ))}
        </div>
      )}

      {/* Emitente */}
      <header className="cupom-nfce__emitente">
        <strong className="cupom-nfce__nome">{emitente.nome}</strong>
        {emitente.razaoSocial && emitente.razaoSocial !== emitente.nome && (
          <span className="cupom-nfce__linha">{emitente.razaoSocial}</span>
        )}
        {emitente.cnpj && <span className="cupom-nfce__linha">CNPJ {emitente.cnpj}</span>}
        {emitente.endereco && <span className="cupom-nfce__linha">{emitente.endereco}</span>}
      </header>

      <p className="cupom-nfce__titulo">
        DANFE NFC-e — Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica
      </p>

      {/* Itens */}
      <table className="cupom-nfce__itens">
        <thead>
          <tr>
            <th className="cupom-nfce__col-desc">Item</th>
            <th className="cupom-nfce__col-qtd">Qtd</th>
            <th className="cupom-nfce__col-unit">Unit.</th>
            <th className="cupom-nfce__col-total">Total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it) => (
            <tr key={it.indice}>
              <td className="cupom-nfce__col-desc">
                <span className="cupom-nfce__item-cod">{it.codigo}</span> {it.descricao}
              </td>
              <td className="cupom-nfce__col-qtd">
                {it.quantidade} {it.unidade}
              </td>
              <td className="cupom-nfce__col-unit">{it.valorUnitario}</td>
              <td className="cupom-nfce__col-total">{it.valorTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totais */}
      <dl className="cupom-nfce__totais">
        <div>
          <dt>Qtd. itens</dt>
          <dd>{totais.quantidadeItens}</dd>
        </div>
        <div>
          <dt>Subtotal</dt>
          <dd>R$ {totais.valorProdutos}</dd>
        </div>
        {totais.temDesconto && (
          <div>
            <dt>Desconto</dt>
            <dd>- R$ {totais.valorDesconto}</dd>
          </div>
        )}
        <div className="cupom-nfce__total-final">
          <dt>Total a pagar</dt>
          <dd>R$ {totais.valorTotal}</dd>
        </div>
      </dl>

      {/* Pagamentos */}
      <dl className="cupom-nfce__pagamentos">
        {pagamentos.map((p, i) => (
          <div key={i}>
            <dt>{p.rotulo}</dt>
            <dd>R$ {p.valor}</dd>
          </div>
        ))}
        {troco && (
          <div className="cupom-nfce__troco">
            <dt>Troco</dt>
            <dd>R$ {troco}</dd>
          </div>
        )}
      </dl>

      {/* Consumidor */}
      <p className="cupom-nfce__consumidor">
        {consumidor.identificado
          ? `Consumidor: ${consumidor.documento}${consumidor.nome ? ` — ${consumidor.nome}` : ""}`
          : consumidor.texto}
      </p>

      {/* Chave de acesso */}
      {chaveFormatada && (
        <div className="cupom-nfce__chave">
          <span className="cupom-nfce__chave-titulo">Chave de acesso</span>
          <span className="cupom-nfce__chave-valor">{chaveFormatada}</span>
        </div>
      )}

      {/* Protocolo / estado */}
      {autorizada ? (
        <p className="cupom-nfce__protocolo">Protocolo de autorização: {protocolo}</p>
      ) : (
        <p className="cupom-nfce__pendente">Aguardando autorização da SEFAZ</p>
      )}

      {/* QR Code (só quando a url veio pronta) */}
      {danfe.mostrarQrCode && (
        <div className="cupom-nfce__qr">
          {qrSvg ? (
            // SVG gerado offline pela lib de QR — conteúdo controlado (não é
            // entrada de usuário, é a url de consulta montada no servidor).
            <div
              className="cupom-nfce__qr-img"
              aria-label="QR Code de consulta da NFC-e"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : qrErro ? (
            <p className="cupom-nfce__qr-erro">Não foi possível gerar o QR Code.</p>
          ) : (
            <p className="cupom-nfce__qr-carregando">Gerando QR Code…</p>
          )}
        </div>
      )}

      <p className="cupom-nfce__legal">{textoLegal}</p>
    </div>
  );
}
