import { useState, useCallback } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { listarImpressorasPonte } from "@/features/ponte/dados/ponte";
import {
  LuCircleCheck, LuCircleAlert, LuLoader, LuRefreshCw, LuPrinter, LuTrash2
} from "react-icons/lu";
import { resumoImpressora } from "./apoio";

export default function CardPonto({ ponto, somenteUm, confirmando, onAtualizar, onMarcarPadrao, onPedirExclusao, onCancelarExclusao, onConfirmarExclusao }) {
  // Detecção de impressoras via Ponte KORA — mesmo mecanismo e mesma
  // distinção "ausente" (Ponte fechada) vs "erro" de PerfilImpressora.jsx,
  // só que por card: cada ponto escolhe sua própria impressora do Windows.
  const [statusPonte, setStatusPonte] = useState("idle"); // idle | buscando | ok | ausente | erro
  const [impressorasPonte, setImpressorasPonte] = useState([]);
  const [erroPonte, setErroPonte] = useState("");

  const [redeHost, setRedeHost] = useState(ponto.impressora?.tipo === "rede" ? (ponto.impressora.host ?? "") : "");
  const [redePorta, setRedePorta] = useState(String(ponto.impressora?.tipo === "rede" ? (ponto.impressora.porta ?? 9100) : 9100));

  const buscarImpressoras = useCallback(async () => {
    setStatusPonte("buscando");
    setErroPonte("");
    const { data, error } = await listarImpressorasPonte();
    if (error) {
      // Marca posta por `erroAmigavelPonte` em @/lib/ponte — ver o mesmo
      // trecho em PerfilImpressora.jsx.
      const semConexao = error.foraDoAr === true;
      setImpressorasPonte([]);
      if (semConexao) {
        setStatusPonte("ausente");
      } else {
        setStatusPonte("erro");
        setErroPonte(error.message || "A Ponte respondeu algo inesperado.");
      }
      return;
    }
    setImpressorasPonte(data?.impressoras ?? []);
    setStatusPonte("ok");
  }, []);

  const escolherWindows = (nome) => onAtualizar({ impressora: { tipo: "windows", nome } });
  const usarRede = () => {
    const host = redeHost.trim();
    if (!host) return;
    const porta = Number(redePorta) || 9100;
    onAtualizar({ impressora: { tipo: "rede", host, porta } });
  };

  return (
    <div className="pontos-impressao__card">
      <div className="pontos-impressao__card-topo">
        <input
          type="text"
          value={ponto.nome}
          onChange={(e) => onAtualizar({ nome: e.target.value.slice(0, 40) })}
          placeholder="Ex.: Cozinha, Bar, Chapa, Sobremesas"
          className="pontos-impressao__input-nome"
        />
        {ponto.padrao ? (
          <span className="pontos-impressao__tag-padrao">
            <LuCircleCheck size={13} /> Ponto padrão
          </span>
        ) : (
          <button type="button" onClick={onMarcarPadrao} className="pontos-impressao__btn-tornar-padrao">
            Tornar padrão
          </button>
        )}
      </div>

      {ponto.padrao && (
        <p className="pontos-impressao__ajuda-padrao">
          Tudo que não estiver configurado na seção "Para onde vai cada item" sai neste ponto.
        </p>
      )}

      <div className="pontos-impressao__impressora">
        {ponto.impressora && (
          <div className="pontos-impressao__status pontos-impressao__status--sucesso">
            <LuCircleCheck size={13} /> Impressora: {resumoImpressora(ponto.impressora)}
          </div>
        )}

        <button
          type="button"
          onClick={buscarImpressoras}
          disabled={statusPonte === "buscando"}
          className="pontos-impressao__btn-detectar"
        >
          {statusPonte === "buscando"
            ? <LuLoader size={14} className="pontos-impressao__spin" color={varColor(C.blue)} />
            : <LuRefreshCw size={14} />}
          Procurar impressoras
        </button>

        {statusPonte === "ausente" && (
          <div className="pontos-impressao__status pontos-impressao__status--atencao">
            <LuCircleAlert size={13} color={varColor(C.warn)} /> A Ponte não está rodando neste computador. Dê dois
            cliques no KoraPonte.exe, ele trabalha em segundo plano, sem abrir janela, e procure de novo.
          </div>
        )}
        {statusPonte === "erro" && (
          <div className="pontos-impressao__status pontos-impressao__status--erro">
            <LuCircleAlert size={13} /> {erroPonte}
          </div>
        )}
        {statusPonte === "ok" && impressorasPonte.length === 0 && (
          <div className="pontos-impressao__status pontos-impressao__status--atencao">
            <LuCircleAlert size={13} color={varColor(C.warn)} /> Nenhuma impressora encontrada neste computador.
          </div>
        )}
        {statusPonte === "ok" && impressorasPonte.length > 0 && (
          <div className="pontos-impressao__lista-impressoras">
            {impressorasPonte.map((imp) => {
              const ativo = ponto.impressora?.tipo === "windows" && ponto.impressora?.nome === imp.nome;
              return (
                <button
                  key={imp.nome}
                  type="button"
                  onClick={() => escolherWindows(imp.nome)}
                  className={`pontos-impressao__opcao-impressora${ativo ? " pontos-impressao__opcao-impressora--ativa" : ""}`}
                >
                  <LuPrinter size={14} />
                  {imp.nome}
                  {imp.padrao && <span className="pontos-impressao__tag-padrao-windows">padrão do Windows</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="pontos-impressao__separador">ou impressora de rede</div>
        <div className="pontos-impressao__rede">
          <input
            type="text"
            placeholder="IP da impressora, ex: 192.168.0.50"
            value={redeHost}
            onChange={(e) => setRedeHost(e.target.value)}
            className="pontos-impressao__input pontos-impressao__input--host"
          />
          <input
            type="text"
            inputMode="numeric"
            placeholder="Porta"
            value={redePorta}
            onChange={(e) => setRedePorta(e.target.value)}
            className="pontos-impressao__input pontos-impressao__input--porta"
          />
          <button type="button" onClick={usarRede} disabled={!redeHost.trim()} className="pontos-impressao__btn-usar-rede">
            Usar esta impressora
          </button>
        </div>
      </div>

      <div className="pontos-impressao__card-rodape">
        {confirmando ? (
          <div className="pontos-impressao__confirma-exclusao">
            <span>Remover "{ponto.nome || "este ponto"}"? Os itens dele passam a sair no ponto padrão.</span>
            <div className="pontos-impressao__confirma-botoes">
              <button type="button" onClick={onConfirmarExclusao} className="pontos-impressao__btn-confirmar-exclusao">Remover</button>
              <button type="button" onClick={onCancelarExclusao} className="pontos-impressao__btn-cancelar">Cancelar</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPedirExclusao}
            disabled={somenteUm}
            title={somenteUm ? "Precisa existir ao menos um ponto de impressão" : undefined}
            className="pontos-impressao__btn-remover"
          >
            <LuTrash2 size={14} /> Remover ponto
          </button>
        )}
      </div>
    </div>
  );
}

// ── Seção 2 — Para onde vai cada item ──────────────────────────────────
