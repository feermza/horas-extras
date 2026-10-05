import { describe, expect, it } from "vitest";
import { normalizarTexto } from "../../src/motor/texto.js";

const EJEMPLOS = [
  ["  Aus.  Familiar   enfermo ", "AUS FAMILIAR ENFERMO"],
  ["PEREZ, Juan A.", "PEREZ JUAN A"],
  ["P/EXCEPCIONAL A/86", "P EXCEPCIONAL A 86"],
  ["A CTA. LIC.", "A CTA LIC"],
  ["Licencia anual ordinaria", "LICENCIA ANUAL ORDINARIA"],
  ["Justificación PÉREZ", "JUSTIFICACION PEREZ"],
  ["NUÑEZ", "NUNEZ"],
  [null, ""],
  ["", ""],
  [".,;", ""],
];

describe("normalizarTexto", () => {
  it("aplica los ejemplos de observaciones y catálogos", () => {
    for (const [entrada, esperado] of EJEMPLOS) {
      expect(normalizarTexto(entrada)).toBe(esperado);
    }
  });

  it("convierte Ñ en N al quitar las marcas de la descomposición NFD", () => {
    expect(normalizarTexto("NUÑEZ")).toBe("NUNEZ");
    expect(normalizarTexto("nuñez")).toBe("NUNEZ");
    expect(normalizarTexto("ÁÉÍÓÚÜÑ")).toBe("AEIOUUN");
  });

  it("trata null y undefined como vacío, y el resto con String()", () => {
    expect(normalizarTexto(null)).toBe("");
    expect(normalizarTexto(undefined)).toBe("");
    expect(normalizarTexto(86)).toBe("86");
  });

  it("es idempotente en todos los ejemplos", () => {
    const entradas = [...EJEMPLOS.map(([entrada]) => entrada), undefined, 86, "nuñez"];
    for (const entrada of entradas) {
      const unaVez = normalizarTexto(entrada);
      expect(normalizarTexto(unaVez)).toBe(unaVez);
    }
  });
});
