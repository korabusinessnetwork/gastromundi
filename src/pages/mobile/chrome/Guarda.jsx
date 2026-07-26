import React from 'react';
import { LuCheck, LuCircleCheck, LuRefreshCw, LuWifiOff } from 'react-icons/lu';
import './Guarda.css';

/**
 * Guarda — Telas de estado/guard (loading, caixa fechado, sem internet).
 *
 * Props (congeladas):
 * - tipo: "loading" | "caixaFechado" | "offline"
 * - onAcao: () => void (refresh / abrir wifi)
 * - ponteEndereco: string | null (usado só para "offline")
 */
export default function Guarda({ tipo, onAcao, ponteEndereco }) {
  return (
    <div className="guarda">
      <div className="guarda__conteudo">
        {tipo === 'loading' && (
          <>
            <div className="guarda__spinner-container">
              <div className="guarda__spinner"></div>
            </div>
            <h1 className="guarda__titulo">Conectando ao caixa…</h1>
            <p className="guarda__subtexto">
              Buscando o caixa do estabelecimento. Isso leva poucos segundos.
            </p>
          </>
        )}

        {tipo === 'caixaFechado' && (
          <>
            <div className="guarda__icon-container guarda__icon-container--green">
              <LuCircleCheck size={64} />
            </div>
            <h1 className="guarda__titulo">Caixa fechado</h1>
            <p className="guarda__subtexto">
              O caixa de hoje já foi fechado. Peça ao responsável para abrir um novo caixa no PDV.
            </p>
            <button className="guarda__botao guarda__botao--acao" onClick={onAcao}>
              <LuRefreshCw size={20} />
              <span>Verificar de novo</span>
            </button>
          </>
        )}

        {tipo === 'offline' && (
          <>
            <div className="guarda__icon-container guarda__icon-container--warn">
              <LuWifiOff size={64} />
            </div>
            <h1 className="guarda__titulo">Sem internet</h1>
            <p className="guarda__subtexto">
              Você está no Wi-Fi do restaurante. Dá pra lançar o pedido direto no caixa pela rede local.
            </p>
            <button className="guarda__botao guarda__botao--accent" onClick={onAcao}>
              <span>Lançar pelo Wi-Fi do caixa</span>
            </button>
            <p className="guarda__rodape">Aparece só quando a ponte local está configurada</p>
          </>
        )}
      </div>
    </div>
  );
}
