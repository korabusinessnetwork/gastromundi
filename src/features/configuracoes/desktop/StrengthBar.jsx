import { passwordStrength, sanitizeInput } from "@/utils";

// A senha que vai para o Auth passa por `sanitizeInput`, que remove < > " ' `
// e apara espaços das pontas. A barra tem que medir ESSA senha, não a que
// está no campo: medindo a crua ela mostrava "Forte" para `Ab1<<<<`, que na
// prática é `Ab1`. E o aviso existe para o admin não descobrir isso depois.
export default function StrengthBar({ pwd }) {
  if (!pwd) return null;
  const efetiva = sanitizeInput(pwd, 100);
  const s = passwordStrength(efetiva);
  return (
    <div className="usuarios-tab__strength" style={{ "--forca-cor": s.color }}>
      <div className="usuarios-tab__strength-barras">
        {[1, 2, 3, 4].map(i => (
          // TD015: barras de tamanho fixo em que a posição É o dado, ela indica o nível da senha.
          <div key={i} className={`usuarios-tab__strength-barra${i <= s.level ? " usuarios-tab__strength-barra--cheia" : ""}`} />
        ))}
      </div>
      <div className="usuarios-tab__strength-label">{s.label}</div>
      {efetiva !== pwd && (
        <div className="usuarios-tab__strength-aviso">
          Os caracteres <code>&lt; &gt; " ' `</code> e os espaços das pontas não entram na senha.
          {efetiva ? ` A senha será: ${efetiva.length} caractere${efetiva.length > 1 ? "s" : ""}.` : " Assim ela ficaria vazia."}
        </div>
      )}
    </div>
  );
}
