import { useEffect, useRef, useState } from "react";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { LuUser, LuSearch, LuCheck, LuX } from "react-icons/lu";
import { listarClientes, cadastrarCliente } from "@/lib/clientes";
import "./ClienteFiadoSelector.css";

/**
 * F010 — seleção/cadastro rápido de cliente para fiado, sem sair da
 * tela de checkout do PDV. Fiado exige cliente identificado
 * (docs/03_REGRAS_DE_NEGOCIO/CLIENTES.md), então este seletor só
 * aparece quando o método "fiado" está em uso e bloqueia a confirmação
 * até um cliente ser escolhido ou cadastrado.
 */
export default function ClienteFiadoSelector({ cliente, onSelecionar, usuario }) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [mostrarCadastro, setMostrarCadastro] = useState(false);
  const [novoTelefone, setNovoTelefone] = useState("");
  const [salvando, setSalvando] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (cliente) return; // já selecionado, não busca
    if (!busca.trim()) { setResultados([]); setErro(null); return; }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setCarregando(true);
      setErro(null);
      const { data, error } = await listarClientes({ busca });
      setCarregando(false);
      if (error) { setErro("Não foi possível buscar clientes agora."); return; }
      setResultados(data ?? []);
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [busca, cliente]);

  const handleCadastrarRapido = async () => {
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    const { data, error } = await cadastrarCliente({ nome: busca, telefone: novoTelefone }, usuario);
    setSalvando(false);
    if (error) { setErro(error.message ?? "Não foi possível cadastrar o cliente."); return; }
    onSelecionar(data);
    setMostrarCadastro(false);
  };

  if (cliente) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderRadius: 10,
        border: `1.5px solid ${alfa(C.accent, "55")}`, background: varColor(C.alow),
      }}>
        <LuCheck size={16} color={varColor(C.accent)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="cliente-fiado-selecionado__nome" style={{ color: varColor(C.text) }}>{cliente.nome}</div>
          {cliente.telefone && <div className="cliente-fiado-selecionado__telefone" style={{ color: varColor(C.muted) }}>{cliente.telefone}</div>}
        </div>
        <button
          onClick={() => onSelecionar(null)}
          style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", padding: 4, display: "flex" }}
        >
          <LuX size={16} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        border: `1.5px solid var(${C.border})`, borderRadius: 10, padding: "8px 12px",
        background: varColor(C.surface),
      }}>
        <LuSearch size={15} color={varColor(C.muted)} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Fiado exige cliente — busque por nome ou telefone"
          className="cliente-fiado-busca__input"
          style={{
            flex: 1, border: "none", background: "none", outline: "none",
            color: varColor(C.text),
          }}
        />
      </div>

      {erro && <div className="cliente-fiado-estado__erro" style={{ color: varColor(C.red) }}>{erro}</div>}

      {carregando && <div className="cliente-fiado-estado__carregando" style={{ color: varColor(C.muted) }}>Buscando...</div>}

      {!carregando && busca.trim() && resultados.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
          {resultados.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelecionar(c)}
              style={{
                display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                padding: "8px 12px", borderRadius: 8, border: `1px solid var(${C.border})`,
                background: varColor(C.card), cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <LuUser size={14} color={varColor(C.muted)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cliente-fiado-resultado__nome" style={{ color: varColor(C.text) }}>{c.nome}</div>
                {c.telefone && <div className="cliente-fiado-resultado__telefone" style={{ color: varColor(C.muted) }}>{c.telefone}</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {!carregando && busca.trim() && resultados.length === 0 && !mostrarCadastro && (
        <button
          onClick={() => setMostrarCadastro(true)}
          className="cliente-fiado-acao__cadastro-rapido"
          style={{
            padding: "9px 12px", borderRadius: 8, border: `1.5px dashed ${alfa(C.accent, "66")}`,
            background: "none", color: varColor(C.accent), cursor: "pointer",
            textAlign: "left",
          }}
        >
          + Cadastrar "{busca}" como novo cliente
        </button>
      )}

      {mostrarCadastro && (
        <div style={{
          display: "flex", flexDirection: "column", gap: 8,
          padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${alfa(C.accent, "44")}`, background: varColor(C.surface),
        }}>
          <div className="cliente-fiado-cadastro__label" style={{ color: varColor(C.muted) }}>Telefone de <strong>{busca}</strong> (obrigatório)</div>
          <input
            value={novoTelefone}
            onChange={(e) => setNovoTelefone(e.target.value)}
            placeholder="(00) 00000-0000"
            className="cliente-fiado-cadastro__input-telefone"
            style={{
              padding: "8px 10px", borderRadius: 8, border: `1.5px solid var(--gm-input-border)`,
              background: "var(--gm-input-bg)", color: varColor(C.text), outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setMostrarCadastro(false)}
              className="cliente-fiado-cadastro__botao"
              style={{
                flex: 1, padding: "8px", borderRadius: 8, border: `1.5px solid var(${C.border})`,
                background: "none", color: varColor(C.muted), cursor: "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleCadastrarRapido}
              disabled={salvando || !novoTelefone.trim()}
              className="cliente-fiado-cadastro__botao-confirmar"
              style={{
                flex: 2, padding: "8px", borderRadius: 8, border: "none",
                background: (salvando || !novoTelefone.trim()) ? varColor(C.faint) : varColor(C.accent),
                color: "#fff", cursor: (salvando || !novoTelefone.trim()) ? "not-allowed" : "pointer",
              }}
            >
              {salvando ? "Salvando..." : "Cadastrar e usar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
