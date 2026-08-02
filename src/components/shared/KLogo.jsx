import "./KLogo.css";

// `size` é dado de runtime, então é a única coisa que continua vindo do JSX —
// e entra como custom property, já com unidade: sem o "px", o calc() do CSS
// recebe número puro e descarta a regra em silêncio.
export default function KLogo({ size = 28 }) {
  return (
    <div className="klogo" style={{ "--klogo-size": `${size}px` }}>
      K
    </div>
  );
}
