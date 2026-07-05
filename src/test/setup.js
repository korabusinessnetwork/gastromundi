import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Sem `test.globals: true` no vitest.config.js, o auto-cleanup do
// @testing-library/react entre testes não é registrado sozinho —
// sem isso, o DOM de um teste de componente vaza para o próximo
// (ex.: dois botões "Novo lançamento" no documento ao mesmo tempo,
// quebrando queries como getByRole com "Found multiple elements").
afterEach(() => {
  cleanup();
});
