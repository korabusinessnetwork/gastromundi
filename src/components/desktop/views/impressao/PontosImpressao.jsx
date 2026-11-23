import { useState, useEffect, useCallback, useMemo } from "react";
import { useCatalogo } from "@/context/AppContext";
import { buscarConfigImpressao } from "@/lib/impressao";
import {
  normalizarPontos, novoPonto, removerPonto, definirPadrao
} from "@/lib/impressao/pontos";
import {
  LuCircleAlert, LuRefreshCw
} from "react-icons/lu";
import "./PontosImpressao.css";
import SecaoQuandoImprimir from "./SecaoQuandoImprimir";
import SecaoPontos from "./SecaoPontos";
import SecaoRoteamento from "./SecaoRoteamento";

// Leva "Pontos de impressão" (2026-07-28): antes existia só UM destino de
// impressão (a impressora do caixa, configurada em "Layout da comanda").
// Agora o dono pode ter vários — cozinha, bar, chapa — cada item do
// cardápio saindo na impressora certa. Esta tela cobre as duas perguntas
// que o dono fez, em duas seções (cada uma com seu próprio Salvar,
// Princípio nº1 — nunca some com o que não foi confirmado):
//   1. "Pontos de impressão"      → quais impressoras existem.
//   2. "Para onde vai cada item"  → o que sai em cada uma.

export default function PontosImpressao() {
  const { products } = useCatalogo();
  const [configCompleta, setConfigCompleta] = useState(null);
  const [pontos, setPontos] = useState([]);
  const [roteamento, setRoteamento] = useState({ categorias: {}, produtos: {} });
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(null);

  // Se a leitura falhar, a tela NÃO pode abrir: sem config no lugar ela
  // sintetizaria o ponto padrão e mostraria a configuração de fábrica como
  // se fosse a salva — e um Salvar em cima disso apagaria a de verdade.
  // Então erro de leitura vira tela de erro com "Tentar de novo".
  const carregar = useCallback(() => {
    setCarregando(true);
    setErroCarga(null);
    buscarConfigImpressao()
      .then(({ data, error }) => {
        if (error || !data) throw error ?? new Error("Não deu para ler a configuração de impressão.");
        setConfigCompleta(data);
        setPontos(normalizarPontos(data.pontosImpressao, data.perfilImpressora));
        setRoteamento({
          categorias: data.roteamento?.categorias ?? {},
          produtos: data.roteamento?.produtos ?? {},
        });
        setCarregando(false);
      })
      .catch((e) => {
        setErroCarga(e?.message || "Não deu para ler a configuração de impressão.");
        setCarregando(false);
      });
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const adicionarPonto = () => {
    setPontos((prev) => [...prev, novoPonto(prev)]);
  };

  const atualizarPonto = useCallback((id, patch) => {
    setPontos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const marcarPadrao = useCallback((id) => {
    setPontos((prev) => definirPadrao(prev, id));
  }, []);

  // Sem useCallback aqui de propósito: removerPonto precisa do valor atual
  // de `pontos` E `roteamento` juntos (não é update funcional isolado),
  // então a função é recriada a cada render — barato, e evita fechar
  // sobre estado velho.
  const excluirPonto = (id) => {
    const resultado = removerPonto(pontos, roteamento, id);
    setPontos(resultado.pontos);
    setRoteamento(resultado.roteamento);
  };

  // Categorias do cardápio de verdade (mesmo padrão do PDV — category
  // é texto livre de products.category) — não existe cadastro à parte
  // de categorias, então a lista vem direto dos produtos existentes.
  const categorias = useMemo(
    () => [...new Set((products ?? []).map((p) => p.category).filter(Boolean))],
    [products]
  );

  if (carregando) {
    return <div className="pontos-impressao__carregando">Carregando…</div>;
  }

  if (erroCarga) {
    return (
      <div className="pontos-impressao__erro-carga">
        <LuCircleAlert size={20} />
        <div>
          <strong>Não deu para carregar a configuração de impressão.</strong>
          <p>{erroCarga}</p>
          <p>Nada foi alterado. Verifique a internet e tente de novo.</p>
        </div>
        <button type="button" className="pontos-impressao__botao-recarregar" onClick={carregar}>
          <LuRefreshCw size={16} /> Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="pontos-impressao">
      <SecaoQuandoImprimir
        configCompleta={configCompleta}
        onSalvo={setConfigCompleta}
      />
      <SecaoPontos
        pontos={pontos}
        onAdicionar={adicionarPonto}
        onAtualizar={atualizarPonto}
        onMarcarPadrao={marcarPadrao}
        onExcluir={excluirPonto}
        configCompleta={configCompleta}
        onSalvo={setConfigCompleta}
      />
      <SecaoRoteamento
        pontos={pontos}
        roteamento={roteamento}
        setRoteamento={setRoteamento}
        categorias={categorias}
        products={products ?? []}
        configCompleta={configCompleta}
        onSalvo={setConfigCompleta}
      />
    </div>
  );
}

// ── Seção 0 — Quando imprimir ──────────────────────────────────────────
