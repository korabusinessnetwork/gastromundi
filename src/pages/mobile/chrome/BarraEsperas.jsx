import React from 'react';
import { LuPause, LuSend } from 'react-icons/lu';
import { fmtDinheiro } from '@/pages/mobile/fmt';
import './BarraEsperas.css';

/**
 * BarraEsperas — Pill de atenção: pedidos em espera.
 *
 * Props (congeladas):
 * - qtd: number (quantidade de pedidos)
 * - total: number (valor total em reais)
 * - onClick: () => void (tappable em toda a pill)
 */
export default function BarraEsperas({ qtd, total, onClick }) {
  return (
    <button
      className="barra-esperas"
      onClick={onClick}
      aria-label={`${qtd} pedidos em espera, total de ${fmtDinheiro(total)}. Toque para revisar e enviar.`}
    >
      <div className="barra-esperas__conteudo">
        <LuPause size={20} />
        <span className="barra-esperas__texto">
          {qtd} pedido{qtd !== 1 ? 's' : ''} em espera · <span className="barra-esperas__valor">{fmtDinheiro(total)}</span>
        </span>
      </div>
      <div className="barra-esperas__acao">
        <span>Revisar e enviar</span>
        <LuSend size={18} />
      </div>
    </button>
  );
}
