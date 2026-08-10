import { useEffect, useState } from "react";
import { LuClock } from "react-icons/lu";
import "./AvisoSessao.css";

/**
 * Aviso de que a sessão está prestes a expirar por inatividade.
 *
 * A sessão vencia calada: em horário de pico, o operador voltava do salão,
 * tocava na tela e caía no login sem entender por quê — às vezes no meio de um
 * atendimento. Aqui ele vê o tempo correndo e tem um botão grande para ficar.
 *
 * Por que é intuitivo (princípio nº 1): aparece sozinho no centro da tela, diz
 * em uma frase o que vai acontecer e quando ("sua sessão vai encerrar em
 * 1:47"), e a única ação em destaque é a que quase todo mundo quer — continuar
 * conectado. Não pede decisão nenhuma de quem simplesmente voltou a trabalhar:
 * mexer no mouse, tocar na tela ou digitar já cancela o aviso.
 *
 * Recebe tudo por props (é montado dentro do AppProvider, como o
 * IndicadorRede). Estilo fora do JSX (decisão 018) e cores por token --gm-*
 * para acompanhar o tema do estabelecimento (decisão 017).
 *
 * @param {boolean} visivel     mostra o aviso
 * @param {number}  totalMs     quanto tempo o aviso dura antes do logout
 * @param {Function} onContinuar clique em "Continuar conectado"
 */
export default function AvisoSessao({ visivel, totalMs, onContinuar }) {
  const [restanteMs, setRestanteMs] = useState(totalMs);

  useEffect(() => {
    if (!visivel) return;
    // O relógio nasce do momento em que o aviso apareceu, não da soma de ticks:
    // aba em segundo plano faz o navegador atrasar timers, e um contador por
    // subtração ficaria mentindo sobre o tempo que sobra.
    const inicio = Date.now();
    setRestanteMs(totalMs);
    const t = setInterval(() => {
      setRestanteMs(Math.max(0, totalMs - (Date.now() - inicio)));
    }, 1000);
    return () => clearInterval(t);
  }, [visivel, totalMs]);

  if (!visivel) return null;

  const segundos = Math.ceil(restanteMs / 1000);
  const relogio = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;

  return (
    <div className="aviso-sessao" role="alertdialog" aria-modal="true" aria-labelledby="aviso-sessao-titulo">
      <div className="aviso-sessao__caixa">
        <LuClock size={30} className="aviso-sessao__icone" aria-hidden="true" />

        <h2 id="aviso-sessao-titulo" className="aviso-sessao__titulo">
          Você ainda está aí?
        </h2>

        <p className="aviso-sessao__texto">
          Por segurança, sua sessão vai encerrar em{" "}
          <strong className="aviso-sessao__relogio">{relogio}</strong> por falta de uso.
        </p>

        <button type="button" className="aviso-sessao__botao" onClick={onContinuar} autoFocus>
          Continuar conectado
        </button>

        <p className="aviso-sessao__rodape">
          Mexer no mouse, digitar ou tocar na tela também mantém você conectado.
        </p>
      </div>
    </div>
  );
}
