import { useState } from "react";
import { salvarConfigImpressao } from "@/lib/impressao";
import {
  LuCircleCheck, LuCircleAlert, LuPlus
} from "react-icons/lu";
import CardPonto from "./CardPonto";

export default function SecaoPontos({ pontos, onAdicionar, onAtualizar, onMarcarPadrao, onExcluir, configCompleta, onSalvo }) {
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState(null); // null | "sucesso" | "erro"
  // Confirmação de exclusão (ação destrutiva, Princípio nº1): guarda o id
  // do ponto que está pedindo confirmação, não um booleano solto.
  const [confirmandoId, setConfirmandoId] = useState(null);

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    setStatus(null);
    try {
      const config = { ...(configCompleta ?? {}), pontosImpressao: pontos };
      const { error } = await salvarConfigImpressao(config);
      setStatus(error ? "erro" : "sucesso");
      if (!error) onSalvo(config);
    } finally {
      setSalvando(false);
      setTimeout(() => setStatus((s) => (s === "sucesso" ? null : s)), 2500);
    }
  };

  return (
    <section className="pontos-impressao__secao">
      <h3 className="pontos-impressao__titulo-secao">Pontos de impressão</h3>
      <p className="pontos-impressao__intro">
        Cada ponto é uma impressora ligada a um setor da produção, cozinha, bar, chapa.
        Dê um nome e escolha a impressora dele; na seção abaixo você diz o que sai em cada um.
      </p>

      <div className="pontos-impressao__lista-cards">
        {pontos.map((ponto) => (
          <CardPonto
            key={ponto.id}
            ponto={ponto}
            somenteUm={pontos.length <= 1}
            confirmando={confirmandoId === ponto.id}
            onAtualizar={(patch) => onAtualizar(ponto.id, patch)}
            onMarcarPadrao={() => onMarcarPadrao(ponto.id)}
            onPedirExclusao={() => setConfirmandoId(ponto.id)}
            onCancelarExclusao={() => setConfirmandoId(null)}
            onConfirmarExclusao={() => {
              onExcluir(ponto.id);
              setConfirmandoId(null);
            }}
          />
        ))}
      </div>

      <button type="button" onClick={onAdicionar} className="pontos-impressao__btn-adicionar">
        <LuPlus size={16} /> Adicionar ponto de impressão
      </button>

      <div className="pontos-impressao__acoes">
        <button type="button" onClick={salvar} disabled={salvando} className="pontos-impressao__btn-salvar">
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        {status === "sucesso" && (
          <span className="pontos-impressao__status pontos-impressao__status--sucesso"><LuCircleCheck size={13} /> Salvo</span>
        )}
        {status === "erro" && (
          <span className="pontos-impressao__status pontos-impressao__status--erro"><LuCircleAlert size={13} /> Falha ao salvar</span>
        )}
      </div>
    </section>
  );
}
