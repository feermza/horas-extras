import { describe, expect, it } from "vitest";
import { textoAviso } from "../../src/motor/avisos.js";

describe("textoAviso", () => {
  it("redacta cada aviso de la sección 10.2", () => {
    expect(textoAviso({
      codigo: "EXCEDENTE_SOBRE_TOPE",
      realizada: 7 * 60,
      tope: 4 * 60,
      excedente: 3 * 60,
    }, 50)).toBe("Realizó 7:00, autorizadas 4:00: 3:00 para autorizar");

    expect(textoAviso({
      codigo: "SIN_AUTORIZACION_DIA",
      realizada: 3 * 60,
    }, 50)).toBe("Sin horas autorizadas para este tipo de día: 3:00 para autorizar");

    expect(textoAviso({ codigo: "BAJO_UMBRAL" }, 50)).toBe("Menos de 0:50: no se computa");
    expect(textoAviso({ codigo: "BAJO_UMBRAL" }, 45)).toBe("Menos de 0:45: no se computa");

    expect(textoAviso({
      codigo: "TRABAJO_DOMINGO_SIN_AUTORIZACION",
      realizada: 3 * 60,
    }, 50)).toBe("Trabajó en domingo: 3:00 para autorizar");

    expect(textoAviso({
      codigo: "TRABAJO_SABADO_NO_HABILITADO",
      realizada: 3 * 60,
    }, 50)).toBe("Trabajó en sábado no habilitado: 3:00 para autorizar");

    expect(textoAviso({
      codigo: "MARCACIONES_EN_DIA_JUSTIFICADO",
      novedad: "AUSENTE POR ENFERMEDAD",
    }, 50)).toBe("Hay marcaciones en un día justificado (AUSENTE POR ENFERMEDAD)");

    expect(textoAviso({ codigo: "MARCACIONES_INCOMPLETAS" }, 50))
      .toBe("Marcaciones incompletas: horas estimadas");

    expect(textoAviso({
      codigo: "OBSERVACION_NO_RECONOCIDA",
      texto: "NOTA SUELTA",
    }, 50)).toBe("Observación no reconocida: NOTA SUELTA");
  });

  it("un código desconocido lanza RangeError", () => {
    expect(() => textoAviso({ codigo: "TURNO_DISTINTO_CONFIG" }, 50)).toThrow(RangeError);
  });
});
