import { useState } from "react";
import { salvarConfigImpressao } from "@/lib/impressao";
import { aparelhoImprimeLancamentos, definirAparelhoImprimeLancamentos } from "@/lib/impressao/aparelho";
import {
  LuCircleCheck, LuCircleAlert
} from "react-icons/lu";
import LinhaChave from "./LinhaChave";

export default function SecaoQuandoImprimir({ configCompleta, onSalvo }) {
  const [aoLancar, setAoLancar] = useState(configCompleta?.imprimirAoLancar !== false);
  const [contaNoCheckout, setContaNoCheckout] = useState(configCompleta?.imprimirContaNoCheckout === true);
  const [esteAparelho, setEsteAparelho] = useState(aparelhoImprimeLancamentos);
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState(null); // null | "sucesso" | "erro"

  // Grava uma chave só da config do estabelecimento. Se a gravação falhar,
  // o interruptor VOLTA para onde estava: um interruptor que ficou ligado
  // sem ter sido salvo é pior que nenhum.
  const salvarChave = async (campo, valor, reverter) => {
    if (salvando) return;
    setSalvando(true);
    setStatus(null);
    try {
      const config = { ...(configCompleta ?? {}), [campo]: valor };
      const { error } = await salvarConfigImpressao(config);
      if (error) {
        reverter();
        setStatus("erro");
        return;
      }
      onSalvo(config);
      setStatus("sucesso");
    } finally {
      setSalvando(false);
      setTimeout(() => setStatus((s) => (s === "sucesso" ? null : s)), 2500);
    }
  };

  const alternarAoLancar = () => {
    const novo = !aoLancar;
    setAoLancar(novo);
    salvarChave("imprimirAoLancar", novo, () => setAoLancar(!novo));
  };

  const alternarContaNoCheckout = () => {
    const novo = !contaNoCheckout;
    setContaNoCheckout(novo);
    salvarChave("imprimirContaNoCheckout", novo, () => setContaNoCheckout(!novo));
  };

  // Esta é a única chave da tela que NÃO vai para o banco: vale só neste
  // computador (ver lib/impressao/aparelho). Por isso salva na hora e sem
  // estado de erro — localStorage não falha pela rede.
  const alternarEsteAparelho = () => {
    const novo = !esteAparelho;
    setEsteAparelho(novo);
    definirAparelhoImprimeLancamentos(novo);
  };

  return (
    <section className="pontos-impressao__secao">
      <h3 className="pontos-impressao__titulo-secao">Quando imprimir</h3>

      <LinhaChave
        titulo="Imprimir sozinho ao lançar o pedido"
        descricao={aoLancar
          ? "Assim que o garçom lança, o papel sai na produção, ninguém precisa lembrar de mandar imprimir."
          : "O papel só sai quando alguém pedir na tela da Cozinha. Nada é impresso ao lançar."}
        ligado={aoLancar}
        onAlternar={alternarAoLancar}
        desabilitado={salvando}
      />

      <LinhaChave
        titulo="Imprimir a conta do cliente ao fechar a comanda"
        descricao={contaNoCheckout
          ? "Ao abrir o fechamento, a conta (pré-nota) sai sozinha para o cliente conferir."
          : "A conta só sai quando alguém apertar “Pré-nota” na tela de fechamento."}
        ligado={contaNoCheckout}
        onAlternar={alternarContaNoCheckout}
        desabilitado={salvando}
      />

      <LinhaChave
        titulo="Este computador imprime os pedidos do Palm"
        descricao={esteAparelho
          ? "Pedidos lançados no celular do garçom saem na impressora ligada a ESTE computador, com ou sem internet."
          : "Este computador ignora os pedidos lançados no celular. Outro computador precisa estar com esta chave ligada, senão nada é impresso."}
        ligado={esteAparelho}
        onAlternar={alternarEsteAparelho}
      />
      <p className="pontos-impressao__aviso-aparelho">
        Esta última chave vale só neste computador. Se você tem mais de um caixa
        aberto, deixe ligada em um só, senão o mesmo pedido sai em duas vias.
      </p>

      <div className="pontos-impressao__acoes">
        {status === "sucesso" && (
          <span className="pontos-impressao__status pontos-impressao__status--sucesso"><LuCircleCheck size={13} /> Salvo</span>
        )}
        {status === "erro" && (
          <span className="pontos-impressao__status pontos-impressao__status--erro"><LuCircleAlert size={13} /> Falha ao salvar, nada mudou</span>
        )}
      </div>
    </section>
  );
}

// ── Seção 1 — Pontos de impressão ──────────────────────────────────────
