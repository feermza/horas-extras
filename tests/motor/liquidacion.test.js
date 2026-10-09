import { describe, expect, it } from "vitest";
import { liquidar } from "../../src/motor/liquidacion.js";

describe("liquidar", () => {
  it("L1: 5:30 simples a 1234,50 se redondea a 6790", () => {
    expect(liquidar({
      minutosSimples: 5 * 60 + 30,
      minutosDobles: 0,
      valorHoraBase: "1234,50",
    })).toEqual({ minutosEquivalentes: 330, importe: 6790 });
  });

  it("L2: 3:00 simples y 1:00 doble a 4500 dan 22500", () => {
    expect(liquidar({
      minutosSimples: 3 * 60,
      minutosDobles: 60,
      valorHoraBase: 4500,
    })).toEqual({ minutosEquivalentes: 300, importe: 22500 });
  });

  it("L3: 0:00 da importe 0", () => {
    expect(liquidar({
      minutosSimples: 0,
      minutosDobles: 0,
      valorHoraBase: "4500",
    })).toEqual({ minutosEquivalentes: 0, importe: 0 });
  });

  it("L4: 1 minuto a 100 se redondea a 2", () => {
    expect(liquidar({
      minutosSimples: 1,
      minutosDobles: 0,
      valorHoraBase: "100",
    })).toEqual({ minutosEquivalentes: 1, importe: 2 });
  });

  it("acepta el mismo decimal con punto y como número", () => {
    const esperado = { minutosEquivalentes: 330, importe: 6790 };
    expect(liquidar({
      minutosSimples: 330,
      minutosDobles: 0,
      valorHoraBase: "1234.50",
    })).toEqual(esperado);
    expect(liquidar({
      minutosSimples: 330,
      minutosDobles: 0,
      valorHoraBase: 1234.5,
    })).toEqual(esperado);
  });

  it("un valor hora inválido o negativo lanza RangeError", () => {
    const base = { minutosSimples: 1, minutosDobles: 0 };
    expect(() => liquidar({ ...base, valorHoraBase: "abc" })).toThrow(RangeError);
    expect(() => liquidar({ ...base, valorHoraBase: "-1" })).toThrow(RangeError);
    expect(() => liquidar({ ...base, valorHoraBase: -1 })).toThrow(RangeError);
    expect(() => liquidar({ ...base, valorHoraBase: "" })).toThrow(RangeError);
  });
});
