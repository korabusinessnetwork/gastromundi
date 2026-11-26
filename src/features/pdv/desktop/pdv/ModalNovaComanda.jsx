import { fecharAoClicarFora } from "@/lib/overlayFechar";

// Janela de nova comanda com nome personalizado.
export default function ModalNovaComanda({ tela }) {
  const {
    setShowNova, nomeComanda, setNomeComanda, criando, handleNovaComanda,
  } = tela;
  return (
        <div
          {...fecharAoClicarFora(() => setShowNova(false))}
          className="pdv__nova-overlay"
        >
          <div className="pdv__nova-card">
            <div className="pdv__modal-titulo pdv__nova-titulo">Nova Comanda</div>
            <div className="pdv__modal-desc pdv__nova-desc">
              Informe o nome ou número da mesa
            </div>

            <label className="pdv__modal-label">
              Nome / Número
            </label>
            <input
              autoFocus
              value={nomeComanda}
              onChange={e => setNomeComanda(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleNovaComanda()}
              placeholder="Ex: Mesa 1, Balcão, Delivery..."
              maxLength={30}
              className="pdv__modal-input pdv__nova-input"
            />

            <div className="pdv__nova-acoes">
              <button
                onClick={() => setShowNova(false)}
                className="pdv__modal-btn pdv__modal-btn--secundario pdv__nova-btn"
              >
                Cancelar
              </button>
              <button
                onClick={handleNovaComanda}
                disabled={!nomeComanda.trim() || criando}
                className={`pdv__modal-btn pdv__modal-btn--primario pdv__nova-btn pdv__nova-btn-abrir${nomeComanda.trim() ? " pdv__nova-btn-abrir--ativo" : ""}`}
              >
                {criando ? "Abrindo..." : "Abrir"}
              </button>
            </div>
          </div>
        </div>
  );
}
