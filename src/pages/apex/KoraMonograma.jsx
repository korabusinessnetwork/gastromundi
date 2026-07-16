/**
 * Monograma oficial da KORA — K em três traços arredondados:
 * haste vertical roxa + diagonal superior azul + diagonal inferior
 * verde (geometria do handoff de design: haste 7×30 em x=2; diagonais
 * 7×19 em x=9 rotacionadas ±45° a partir do ponto (9,15)).
 *
 * Inline (sem asset externo). Em fundo escuro a haste muda de cor —
 * `haste` permite as variantes do design (ex.: #B8B0F0 no CTA final,
 * #77768A no rodapé); azul/verde não variam.
 */
export default function KoraMonograma({ className, haste = "var(--kora-roxo)" }) {
  return (
    <svg className={className} viewBox="-3 -8 36 44" role="img" aria-label="Símbolo da KORA">
      <rect x="2" y="0" width="7" height="30" rx="3.5" fill={haste} />
      <rect x="9" y="-4" width="7" height="19" rx="3.5" fill="var(--kora-azul)" transform="rotate(45 9 15)" />
      <rect x="9" y="15" width="7" height="19" rx="3.5" fill="var(--kora-verde)" transform="rotate(-45 9 15)" />
    </svg>
  );
}
