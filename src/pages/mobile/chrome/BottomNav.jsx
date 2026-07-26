import React from 'react';
import { LuUtensils, LuLayoutGrid, LuChartBar, LuMenu } from 'react-icons/lu';
import './BottomNav.css';

/**
 * BottomNav — Abas fixas no rodapé do /palm.
 *
 * Props (congeladas):
 * - ativa: "pedido" | "comandas" | "painel" | "mais"
 * - onNavegar: (chave) => void
 * - comandasBadge: number (0 = sem badge)
 */
export default function BottomNav({ ativa, onNavegar, comandasBadge = 0 }) {
  const abas = [
    { chave: 'pedido', icon: LuUtensils, label: 'Pedido' },
    { chave: 'comandas', icon: LuLayoutGrid, label: 'Comandas' },
    { chave: 'painel', icon: LuChartBar, label: 'Painel' },
    { chave: 'mais', icon: LuMenu, label: 'Mais' },
  ];

  return (
    <nav className="bottom-nav" role="tablist">
      {abas.map((aba) => {
        const Icon = aba.icon;
        const isAtiva = ativa === aba.chave;
        return (
          <button
            key={aba.chave}
            role="tab"
            aria-selected={isAtiva}
            className={`bottom-nav__aba ${isAtiva ? 'bottom-nav__aba--ativa' : ''}`}
            onClick={() => onNavegar(aba.chave)}
          >
            <div className="bottom-nav__aba-icon">
              <Icon size={24} />
              {aba.chave === 'comandas' && comandasBadge > 0 && (
                <span className="bottom-nav__badge">{comandasBadge}</span>
              )}
            </div>
            <span className="bottom-nav__aba-label">{aba.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
