import { useEffect, useRef, useState } from "react";
import { LuUser, LuSearch, LuCheck, LuX } from "react-icons/lu";
import { listarClientes, cadastrarCliente } from "@/features/clientes/dados/clientes";
import { mascararTelefone, telefoneValido, formatarTelefone } from "@/lib/telefone";
import "./ClienteFiadoSelector.css";

/**
 * F010 — seleção/cadastro rápido de cliente para fiado, sem sair da
 * tela de checkout do PDV. Fiado exige cliente identificado
 * (docs/03_REGRAS_DE_NEGOCIO/CLIENTES.md), então este seletor só
 * aparece quando o método "fiado" está em uso e bloqueia a confirmação
 * até um cliente ser escolhido ou cadastrado.
 */
export default function ClienteFiadoSelector({ cliente, onSelecionar, usuario, placeholder = "Fiado exige cliente, busque por nome ou telefone" }) {
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

  // Mesmo cadastro rápido, mesma regra de telefone do módulo de Clientes:
  // aqui também dava para salvar "123" e descobrir depois, na hora de cobrar
  // o fiado, que o número não existe.
  const telefoneOk = telefoneValido(novoTelefone);

  const handleCadastrarRapido = async () => {
    if (salvando || !telefoneOk) return;
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
      <div className="cliente-fiado-selecionado">
        <LuCheck size={16} className="cliente-fiado-selecionado__icone" />
        <div className="cliente-fiado__texto">
          <div className="cliente-fiado-selecionado__nome">{cliente.nome}</div>
          {cliente.telefone && <div className="cliente-fiado-selecionado__telefone">{formatarTelefone(cliente.telefone)}</div>}
        </div>
        <button
          onClick={() => onSelecionar(null)}
          className="cliente-fiado-selecionado__trocar"
          aria-label="Trocar cliente"
        >
          <LuX size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="cliente-fiado">
      <div className="cliente-fiado-busca">
        <LuSearch size={15} className="cliente-fiado-busca__icone" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={placeholder}
          className="cliente-fiado-busca__input"
        />
      </div>

      {erro && <div className="cliente-fiado-estado__erro" role="alert">{erro}</div>}

      {carregando && <div className="cliente-fiado-estado__carregando">Buscando...</div>}

      {!carregando && busca.trim() && resultados.length > 0 && (
        <div className="cliente-fiado-resultados">
          {resultados.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelecionar(c)}
              className="cliente-fiado-resultado"
            >
              <LuUser size={14} className="cliente-fiado-resultado__icone" />
              <div className="cliente-fiado__texto">
                <div className="cliente-fiado-resultado__nome">{c.nome}</div>
                {c.telefone && <div className="cliente-fiado-resultado__telefone">{formatarTelefone(c.telefone)}</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {!carregando && busca.trim() && resultados.length === 0 && !mostrarCadastro && (
        <button
          onClick={() => setMostrarCadastro(true)}
          className="cliente-fiado-acao__cadastro-rapido"
        >
          + Cadastrar "{busca}" como novo cliente
        </button>
      )}

      {mostrarCadastro && (
        <div className="cliente-fiado-cadastro">
          <div className="cliente-fiado-cadastro__label">Telefone de <strong>{busca}</strong> (obrigatório)</div>
          <input
            value={novoTelefone}
            onChange={(e) => setNovoTelefone(mascararTelefone(e.target.value))}
            placeholder="(00) 00000-0000"
            inputMode="numeric"
            aria-invalid={novoTelefone.trim().length > 0 && !telefoneOk}
            className="cliente-fiado-cadastro__input-telefone"
          />
          {novoTelefone.trim().length > 0 && !telefoneOk && (
            <div className="cliente-fiado-cadastro__aviso">
              Telefone incompleto, informe DDD e número.
            </div>
          )}
          <div className="cliente-fiado-cadastro__botoes">
            <button
              onClick={() => setMostrarCadastro(false)}
              className="cliente-fiado-cadastro__botao"
            >
              Cancelar
            </button>
            <button
              onClick={handleCadastrarRapido}
              disabled={salvando || !telefoneOk}
              className="cliente-fiado-cadastro__botao-confirmar"
            >
              {salvando ? "Salvando..." : "Cadastrar e usar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
