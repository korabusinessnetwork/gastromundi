import { useState } from "react";
import "./DemoClientes.css";
import { CLIENTES_DEMO, formatarBRL } from "./demoDados";

/**
 * Clientes da demo — busca que filtra ao digitar e um cadastro local
 * (nome + telefone) pra mostrar como é rápido criar um cliente. Tudo
 * em memória; ao sair da tela volta ao estado inicial.
 */
export default function DemoClientes() {
  const [clientes, setClientes] = useState(CLIENTES_DEMO);
  const [busca, setBusca] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");

  const visiveis = clientes.filter((c) =>
    c.nome.toLowerCase().includes(busca.trim().toLowerCase())
  );

  const salvar = () => {
    const nome = novoNome.trim();
    if (!nome) return;
    setClientes((lista) => [
      {
        id: Date.now(),
        nome,
        telefone: novoTelefone.trim() || "—",
        fiado: 0,
        ultimaVisita: "agora",
      },
      ...lista,
    ]);
    setNovoNome("");
    setNovoTelefone("");
    setFormAberto(false);
    setBusca("");
  };

  return (
    <div className="demo-clientes">
      <div className="demo-clientes__acoes">
        <input
          type="search"
          className="demo-clientes__busca"
          placeholder="Buscar cliente pelo nome…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button
          type="button"
          className="demo-clientes__novo"
          aria-expanded={formAberto}
          onClick={() => setFormAberto((v) => !v)}
        >
          + Novo cliente
        </button>
      </div>

      {formAberto && (
        <div className="demo-clientes__form">
          <input
            type="text"
            className="demo-clientes__form-input"
            placeholder="Nome do cliente (obrigatório)"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && salvar()}
          />
          <input
            type="tel"
            className="demo-clientes__form-input"
            placeholder="Telefone (opcional)"
            value={novoTelefone}
            onChange={(e) => setNovoTelefone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && salvar()}
          />
          <button
            type="button"
            className="demo-clientes__salvar"
            disabled={!novoNome.trim()}
            onClick={salvar}
          >
            Salvar
          </button>
        </div>
      )}

      {visiveis.length === 0 ? (
        <div className="demo-clientes__vazio">
          Nenhum cliente com esse nome — cadastre no botão acima.
        </div>
      ) : (
        <ul className="demo-clientes__lista">
          {visiveis.map((c) => (
            <li key={c.id} className="demo-clientes__cliente">
              <span className="demo-clientes__avatar" aria-hidden="true">
                {c.nome.charAt(0).toUpperCase()}
              </span>
              <div className="demo-clientes__info">
                <span className="demo-clientes__nome">{c.nome}</span>
                <span className="demo-clientes__detalhe">
                  {c.telefone} · última visita: {c.ultimaVisita}
                </span>
              </div>
              {c.fiado > 0 ? (
                <span className="demo-clientes__fiado">
                  Fiado: {formatarBRL(c.fiado)}
                </span>
              ) : (
                <span className="demo-clientes__em-dia">Em dia</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
