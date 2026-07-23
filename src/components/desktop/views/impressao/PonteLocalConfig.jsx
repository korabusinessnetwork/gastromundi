// Leva 13 — aba "Pedidos sem Internet" (Ponte KORA).
//
// Intuitiva por design: um status de uma linha diz se a ponte está
// rodando; quando está, a tela vira um QR gigante + 3 passos numerados —
// o gerente só aponta a câmera do celular. Quando não está, mostra o
// caminho de instalação em linguagem de balcão, sem jargão.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { pingPonte, buscarInfoPonte, montarEnderecoPalm } from "@/lib/ponte";
import "./PonteLocalConfig.css";

const INTERVALO_MS = 5000;

export default function PonteLocalConfig({ sz }) {
  const [status, setStatus] = useState("procurando"); // procurando | rodando | ausente
  const [endereco, setEndereco] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);

  useEffect(() => {
    let vivo = true;
    const verificar = async () => {
      const { error } = await pingPonte();
      if (!vivo) return;
      if (error) {
        setStatus("ausente");
        setEndereco(null);
        return;
      }
      setStatus("rodando");
      const { data: info } = await buscarInfoPonte();
      if (!vivo) return;
      setEndereco(montarEnderecoPalm(info));
    };
    verificar();
    const timer = setInterval(verificar, INTERVALO_MS);
    return () => { vivo = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!endereco) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(endereco, { width: 400, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [endereco]);

  return (
    <div className="ponte-config">
      <div className="ponte-config__status">
        <span className={`ponte-config__dot ${status === "rodando" ? "ponte-config__dot--on" : "ponte-config__dot--off"}`} />
        {status === "procurando" && "Procurando a ponte neste computador…"}
        {status === "rodando"    && "Ponte rodando neste computador — pedidos funcionam mesmo sem internet."}
        {status === "ausente"    && "Ponte não encontrada neste computador."}
      </div>

      {status === "rodando" && (
        <div className="ponte-config__card">
          {qrDataUrl
            ? <img className="ponte-config__qr" src={qrDataUrl} alt="QR code do modo local" />
            : <div className="ponte-config__qr" />}
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ marginTop: 0 }}><strong>Prepare os celulares da equipe (uma vez só):</strong></p>
            <ol className="ponte-config__passos">
              <li>Conecte o celular no <strong>Wi-Fi do estabelecimento</strong> (o mesmo do caixa).</li>
              <li>Escaneie o QR ao lado com a câmera.</li>
              <li>Salve a página que abrir na tela inicial — é por ela que o pedido sai quando a internet cair.</li>
            </ol>
            {endereco && (
              <>
                <p className="ponte-config__muted" style={{ marginBottom: 6 }}>Ou digite o endereço no celular:</p>
                <div className="ponte-config__endereco">{endereco}</div>
              </>
            )}
          </div>
        </div>
      )}

      {status === "ausente" && (
        <div className="ponte-config__card">
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ marginTop: 0 }}>
              A ponte é um programinha <strong>gratuito</strong> que roda neste computador e faz o pedido do
              celular chegar no caixa e na impressora <strong>mesmo sem internet</strong>.
            </p>
            <p><strong>Para ligar:</strong></p>
            <ol className="ponte-config__passos">
              <li>Instale o Node.js (grátis, em nodejs.org) — uma vez só.</li>
              <li>Abra a pasta <code>ponte</code> do sistema e rode <code>node servidor.js</code>.</li>
              <li>Deixe a janela aberta — esta tela detecta a ponte sozinha em segundos.</li>
            </ol>
            <p className="ponte-config__muted">O passo a passo completo está no arquivo <code>ponte/README.md</code>.</p>
          </div>
        </div>
      )}
    </div>
  );
}
