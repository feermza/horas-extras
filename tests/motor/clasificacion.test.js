import { describe, expect, it } from "vitest";
import {
  TIPOS_DIA,
  clasificarDia,
  diaDeLaSemana,
} from "../../src/motor/clasificacion.js";

/**
 * @param {() => void} accion
 */
function errorDeProgramacion(accion) {
  /** @type {unknown} */
  let error;
  try {
    accion();
  } catch (capturado) {
    error = capturado;
  }
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(RangeError);
}

describe("TIPOS_DIA", () => {
  it("está congelado y conserva las cinco claves", () => {
    expect(Object.isFrozen(TIPOS_DIA)).toBe(true);
    expect(TIPOS_DIA).toEqual({
      FERIADO: "FERIADO",
      ASUETO: "ASUETO",
      SABADO: "SABADO",
      DOMINGO: "DOMINGO",
      HABIL_NORMAL: "HABIL_NORMAL",
    });
  });
});

describe("diaDeLaSemana", () => {
  it("cuenta en UTC, de domingo 0 a sábado 6", () => {
    expect(diaDeLaSemana("2026-08-17")).toBe(1);
    expect(diaDeLaSemana("2026-08-20")).toBe(4);
    expect(diaDeLaSemana("2026-08-22")).toBe(6);
    expect(diaDeLaSemana("2026-08-23")).toBe(0);
    expect(diaDeLaSemana("2028-02-29")).toBe(2);
  });

  it("lanza RangeError si el formato no es exacto o el día no existe", () => {
    const invalidas = ["2026-02-29", "2026-13-01", "2026-8-1", "2026/08/01", "", null, 20260817];
    for (const fecha of invalidas) {
      expect(() => diaDeLaSemana(fecha)).toThrow(RangeError);
    }
  });
});

describe("clasificarDia", () => {
  it("clasifica hábil, sábado y domingo sin feriado ni asueto", () => {
    expect(clasificarDia("2026-08-19", [], [])).toEqual({
      tipo: TIPOS_DIA.HABIL_NORMAL,
      detalle: null,
    });
    expect(clasificarDia("2026-08-22", [], [])).toEqual({
      tipo: TIPOS_DIA.SABADO,
      detalle: null,
    });
    expect(clasificarDia("2026-08-23", [], [])).toEqual({
      tipo: TIPOS_DIA.DOMINGO,
      detalle: null,
    });
  });

  it("aplica la prioridad de la sección 3.3", () => {
    const feriado = { fecha: "2026-08-20", descripcion: "Cierre del edificio" };
    const asueto = { fecha: "2026-08-20", descripcion: "Puente" };

    expect(clasificarDia("2026-08-20", [feriado], [asueto]).tipo).toBe(TIPOS_DIA.FERIADO);
    expect(clasificarDia("2026-08-20", [], [asueto]).tipo).toBe(TIPOS_DIA.ASUETO);

    expect(clasificarDia("2026-08-22", [{ fecha: "2026-08-22", descripcion: "Feriado sábado" }], []).tipo)
      .toBe(TIPOS_DIA.FERIADO);
    expect(clasificarDia("2026-08-23", [{ fecha: "2026-08-23", descripcion: "Feriado domingo" }], []).tipo)
      .toBe(TIPOS_DIA.FERIADO);
    expect(clasificarDia("2026-08-22", [], [{ fecha: "2026-08-22", descripcion: "Asueto sábado" }]).tipo)
      .toBe(TIPOS_DIA.ASUETO);
    expect(clasificarDia("2026-08-23", [], [{ fecha: "2026-08-23", descripcion: "Paro" }]).tipo)
      .toBe(TIPOS_DIA.ASUETO);
  });

  it("devuelve el feriado o el asueto original como detalle", () => {
    const feriado = { fecha: "2026-08-17", descripcion: "Acto institucional" };
    const porFeriado = clasificarDia("2026-08-17", [feriado], []);
    expect(porFeriado.detalle).toBe(feriado);
    expect(porFeriado.detalle.descripcion).toBe("Acto institucional");

    const asueto = { fecha: "2026-08-20", descripcion: "Paro" };
    const porAsueto = clasificarDia("2026-08-20", [], [asueto]);
    expect(porAsueto.tipo).toBe(TIPOS_DIA.ASUETO);
    expect(porAsueto.detalle).toBe(asueto);
  });

  it("no usa el texto de la descripción para clasificar", () => {
    const resultado = clasificarDia(
      "2026-08-19",
      [{ fecha: "2026-08-19", descripcion: "ASUETO" }],
      [],
    );
    expect(resultado.tipo).toBe(TIPOS_DIA.FERIADO);
    expect(resultado.detalle.descripcion).toBe("ASUETO");
  });

  it("rechaza feriados o asuetos duplicados en la misma fecha", () => {
    errorDeProgramacion(() => clasificarDia("2026-08-19", [
      { fecha: "2026-08-19", descripcion: "Uno" },
      { fecha: "2026-08-19", descripcion: "Dos" },
    ], []));
    errorDeProgramacion(() => clasificarDia("2026-08-20", [], [
      { fecha: "2026-08-20", descripcion: "Uno" },
      { fecha: "2026-08-20", descripcion: "Dos" },
    ]));
  });

  it("no muta los arreglos congelados", () => {
    const feriados = Object.freeze([
      Object.freeze({ fecha: "2026-08-22", descripcion: "Cierre" }),
    ]);
    const asuetos = Object.freeze([
      Object.freeze({ fecha: "2026-08-22", descripcion: "Puente" }),
    ]);
    const resultado = clasificarDia("2026-08-22", feriados, asuetos);
    expect(resultado.tipo).toBe(TIPOS_DIA.FERIADO);
    expect(resultado.detalle).toBe(feriados[0]);
    expect(feriados).toHaveLength(1);
    expect(asuetos).toHaveLength(1);
  });
});
