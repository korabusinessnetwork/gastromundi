import { describe, it, expect, vi } from "vitest";
import { fecharAoClicarFora } from "./overlayFechar";

// Simula um par de eventos: `alvo` é o e.target; o overlay é o e.currentTarget.
const fundo = { id: "overlay" };
const dentro = { id: "modal" };
const ev = (alvo) => ({ target: alvo, currentTarget: fundo });

describe("fecharAoClicarFora", () => {
  it("fecha quando o clique começa e termina no fundo", () => {
    const onClose = vi.fn();
    const h = fecharAoClicarFora(onClose);
    h.onMouseDown(ev(fundo));
    h.onClick(ev(fundo));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("NÃO fecha quando arrasta de dentro e solta no fundo (seleção de texto)", () => {
    const onClose = vi.fn();
    const h = fecharAoClicarFora(onClose);
    h.onMouseDown(ev(dentro)); // começou dentro do modal
    h.onClick(ev(fundo)); // soltou no fundo
    expect(onClose).not.toHaveBeenCalled();
  });

  it("NÃO fecha quando o clique termina dentro do modal", () => {
    const onClose = vi.fn();
    const h = fecharAoClicarFora(onClose);
    h.onMouseDown(ev(fundo));
    h.onClick(ev(dentro));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("respeita o guard podeFechar=false (ex.: salvando)", () => {
    const onClose = vi.fn();
    const h = fecharAoClicarFora(onClose, false);
    h.onMouseDown(ev(fundo));
    h.onClick(ev(fundo));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("é robusto a onClose ausente", () => {
    const h = fecharAoClicarFora(undefined);
    h.onMouseDown(ev(fundo));
    expect(() => h.onClick(ev(fundo))).not.toThrow();
  });

  it("reseta o sinalizador entre interações", () => {
    const onClose = vi.fn();
    const h = fecharAoClicarFora(onClose);
    // 1ª: começa dentro, não fecha
    h.onMouseDown(ev(dentro));
    h.onClick(ev(fundo));
    // 2ª: clique limpo no fundo, fecha (não pode ter ficado "sujo" da anterior)
    h.onMouseDown(ev(fundo));
    h.onClick(ev(fundo));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
