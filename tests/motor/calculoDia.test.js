import { describe, expect, it } from "vitest";
import { calcularDia, configuracionVigente } from "../../src/motor/calculoDia.js";
import { parsearDuracion } from "../../src/motor/tiempo.js";
import { catalogo } from "./fixtures/catalogo.js";

/** 2026-08-19 es miércoles. 2026-08-22 es sábado. 2026-08-23 es domingo. */
const FECHA_HABIL = "2026-08-19";
const FECHA_SABADO = "2026-08-22";
const FECHA_DOMINGO = "2026-08-23";

/**
 * @param {string} texto
 * @returns {number}
 */
function hm(texto) {
  const minutos = parsearDuracion(texto);
  if (minutos === null) {
    throw new Error(`Duración inválida en la prueba: ${texto}`);
  }
  return minutos;
}

/**
 * @param {string} ingreso
 * @param {string|null} salida
 * @returns {{ ingreso: string, salida: string|null }}
 */
function par(ingreso, salida) {
  return { ingreso, salida };
}

/**
 * @param {object} [parcial]
 * @returns {object}
 */
function cfgBase(parcial = {}) {
  return {
    vigencia_desde: "2026-01-01",
    vigencia_hasta: null,
    horario_inicio: "08:00",
    horario_fin: "14:30",
    duracion_jornada: "06:30",
    tope_extra_habil: "04:00",
    sabado_inicio: null,
    sabado_fin: null,
    sabado_tope: "00:00",
    tope_feriado: "04:00",
    tope_asueto: "04:00",
    tope_paro: "04:00",
    tope_lao_receso: "08:00",
    valor_hora_base: 4500,
    ...parcial,
  };
}

/**
 * @param {object} [parcial]
 * @returns {object}
 */
function calcular(parcial = {}) {
  return calcularDia({
    fecha: parcial.fecha ?? FECHA_HABIL,
    marcaciones: parcial.marcaciones ?? [],
    observacion: parcial.observacion ?? "",
    configuraciones: parcial.configuraciones ?? [cfgBase(parcial.cfg)],
    feriados: parcial.feriados ?? [],
    eventos: parcial.eventos ?? [],
    catalogo: { ...catalogo, umbral_minimo: parcial.umbral ?? "00:50" },
  });
}

/**
 * @param {string} fecha
 * @param {string} descripcion
 * @returns {object[]}
 */
function feriado(fecha, descripcion) {
  return [{ fecha, descripcion }];
}

/**
 * @param {string} fecha
 * @param {"ASUETO"|"PARO"} tipo
 * @param {string|null} topeEspecial
 * @returns {object[]}
 */
function evento(fecha, tipo, topeEspecial) {
  return [{ fecha, tipo, descripcion: tipo, tope_especial: topeEspecial }];
}

/**
 * @param {object} resultado
 * @param {{
 *   realizada: string,
 *   autorizada: string,
 *   computada: string,
 *   excedente: string,
 *   avisos: string[],
 *   noComputable?: string,
 *   trab?: string,
 *   factor?: number,
 *   metodo?: string,
 * }} columnas
 */
function expectColumnas(resultado, columnas) {
  expect(resultado.bloqueante).toBeNull();
  expect(resultado.Hs_Extra_Realizada).toBe(hm(columnas.realizada));
  expect(resultado.Tope_Aplicable).toBe(hm(columnas.autorizada));
  expect(resultado.Hs_Computada_Sistema).toBe(hm(columnas.computada));
  expect(resultado.Hs_Excedente).toBe(hm(columnas.excedente));
  expect(resultado.Hs_Final).toBe(resultado.Hs_Computada_Sistema);
  expect(resultado.Hs_No_Computable).toBe(hm(columnas.noComputable ?? "0:00"));
  if (columnas.trab !== undefined) {
    expect(resultado.Hs_Trab).toBe(hm(columnas.trab));
  }
  expect(resultado.factor).toBe(columnas.factor ?? 1);
  if (columnas.metodo !== undefined) {
    expect(resultado.metodo).toBe(columnas.metodo);
  }
  expect(resultado.avisos.map((aviso) => aviso.codigo)).toEqual(columnas.avisos);
  expect(resultado.editable).toBe(hm(columnas.realizada) > 0);
}

describe("Anexo A.1", () => {
  it("caso 1: hábil, después", () => {
    const resultado = calcular({ marcaciones: [par("08:00", "17:10")] });
    expectColumnas(resultado, {
      realizada: "2:40",
      autorizada: "4:00",
      computada: "2:40",
      excedente: "0:00",
      avisos: [],
    });
  });

  it("caso 2: llegada anticipada", () => {
    const resultado = calcular({ marcaciones: [par("07:05", "14:30")] });
    expectColumnas(resultado, {
      realizada: "0:00",
      autorizada: "4:00",
      computada: "0:00",
      excedente: "0:00",
      noComputable: "0:55",
      avisos: [],
    });
  });

  it("caso 3: bajo el umbral", () => {
    const resultado = calcular({ marcaciones: [par("08:00", "15:15")] });
    expectColumnas(resultado, {
      realizada: "0:45",
      autorizada: "4:00",
      computada: "0:00",
      excedente: "0:45",
      avisos: ["BAJO_UMBRAL"],
    });
  });

  it("caso 4: umbral exacto", () => {
    const resultado = calcular({ marcaciones: [par("08:00", "15:20")] });
    expectColumnas(resultado, {
      realizada: "0:50",
      autorizada: "4:00",
      computada: "0:50",
      excedente: "0:00",
      avisos: [],
    });
  });

  it("caso 5: llegada anticipada y salida tarde", () => {
    const resultado = calcular({ marcaciones: [par("07:00", "16:00")] });
    expectColumnas(resultado, {
      realizada: "1:30",
      autorizada: "4:00",
      computada: "1:30",
      excedente: "0:00",
      noComputable: "1:00",
      avisos: [],
    });
  });

  it("caso 6: excede el tope", () => {
    const resultado = calcular({ marcaciones: [par("08:00", "21:30")] });
    expectColumnas(resultado, {
      realizada: "7:00",
      autorizada: "4:00",
      computada: "4:00",
      excedente: "3:00",
      avisos: ["EXCEDENTE_SOBRE_TOPE"],
    });
    expect(resultado.avisos[0]).toEqual({
      codigo: "EXCEDENTE_SOBRE_TOPE",
      realizada: hm("7:00"),
      tope: hm("4:00"),
      excedente: hm("3:00"),
      novedad: null,
      texto: null,
    });
  });

  it("caso 7: permiso media jornada", () => {
    const resultado = calcular({
      observacion: "PERMISO MEDIA JORNADA",
      marcaciones: [par("08:00", "13:00")],
    });
    expectColumnas(resultado, {
      realizada: "1:30",
      autorizada: "4:00",
      computada: "1:30",
      excedente: "0:00",
      avisos: [],
    });
  });

  it("caso 8: permiso, bajo umbral", () => {
    const resultado = calcular({
      observacion: "PERMISO MEDIA JORNADA",
      marcaciones: [par("08:00", "12:10")],
    });
    expectColumnas(resultado, {
      realizada: "0:40",
      autorizada: "4:00",
      computada: "0:00",
      excedente: "0:40",
      avisos: ["BAJO_UMBRAL"],
    });
  });

  it("caso 9: permiso, sin extra", () => {
    const resultado = calcular({
      observacion: "PERMISO MEDIA JORNADA",
      marcaciones: [par("08:00", "11:00")],
    });
    expectColumnas(resultado, {
      realizada: "0:00",
      autorizada: "4:00",
      computada: "0:00",
      excedente: "0:00",
      avisos: [],
    });
  });

  it("caso 10: feriado con exceso, factor 2", () => {
    const resultado = calcular({
      feriados: feriado(FECHA_HABIL, "Feriado de prueba"),
      marcaciones: [par("08:00", "16:00")],
    });
    expectColumnas(resultado, {
      realizada: "8:00",
      autorizada: "4:00",
      computada: "4:00",
      excedente: "4:00",
      factor: 2,
      avisos: ["EXCEDENTE_SOBRE_TOPE"],
    });
  });

  it("caso 11: feriado sin tope definido", () => {
    const resultado = calcular({
      cfg: { tope_feriado: "00:00" },
      feriados: feriado(FECHA_HABIL, "Feriado de prueba"),
      marcaciones: [par("08:00", "11:00")],
    });
    expectColumnas(resultado, {
      realizada: "3:00",
      autorizada: "0:00",
      computada: "0:00",
      excedente: "3:00",
      factor: 2,
      avisos: ["SIN_AUTORIZACION_DIA"],
    });
  });

  it("caso 12: domingo", () => {
    const resultado = calcular({
      fecha: FECHA_DOMINGO,
      marcaciones: [par("08:00", "11:00")],
    });
    expectColumnas(resultado, {
      realizada: "3:00",
      autorizada: "0:00",
      computada: "0:00",
      excedente: "3:00",
      avisos: ["TRABAJO_DOMINGO_SIN_AUTORIZACION"],
    });
  });

  it("caso 13: sábado habilitado", () => {
    const resultado = calcular({
      fecha: FECHA_SABADO,
      cfg: { sabado_inicio: "08:00", sabado_fin: "12:00", sabado_tope: "04:00" },
      marcaciones: [par("08:00", "13:00")],
    });
    expectColumnas(resultado, {
      realizada: "4:00",
      autorizada: "4:00",
      computada: "4:00",
      excedente: "0:00",
      noComputable: "1:00",
      avisos: [],
    });
  });

  it("caso 14: sábado no habilitado", () => {
    const resultado = calcular({
      fecha: FECHA_SABADO,
      marcaciones: [par("08:00", "11:00")],
    });
    expectColumnas(resultado, {
      realizada: "3:00",
      autorizada: "0:00",
      computada: "0:00",
      excedente: "3:00",
      avisos: ["TRABAJO_SABADO_NO_HABILITADO"],
    });
  });

  it("caso 15: licencia anual ordinaria en día hábil", () => {
    const resultado = calcular({
      observacion: "LIC. ANUAL ORDINARIA",
      marcaciones: [par("08:00", "13:00")],
    });
    expectColumnas(resultado, {
      realizada: "5:00",
      autorizada: "8:00",
      computada: "5:00",
      excedente: "0:00",
      avisos: [],
    });
    expect(resultado.novedad.codigo).toBe("LICENCIA_ANUAL_ORDINARIA");
  });

  it("caso 16: justificación común con marcaciones", () => {
    const resultado = calcular({
      observacion: "AUSENTE POR ENFERMEDAD",
      marcaciones: [par("08:00", "12:00")],
    });
    expectColumnas(resultado, {
      realizada: "0:00",
      autorizada: "0:00",
      computada: "0:00",
      excedente: "0:00",
      avisos: ["MARCACIONES_EN_DIA_JUSTIFICADO"],
    });
    expect(resultado.avisos[0].novedad).toBe("AUSENTE POR ENFERMEDAD");
  });

  it("caso 17: cruce de medianoche", () => {
    const resultado = calcular({ marcaciones: [par("22:00", "01:30")] });
    expect(resultado.Hs_Trab).toBe(hm("3:30"));
  });

  it("caso 18: asueto con tope especial 02:00", () => {
    const resultado = calcular({
      eventos: evento(FECHA_HABIL, "ASUETO", "02:00"),
      marcaciones: [par("08:00", "11:00")],
    });
    expectColumnas(resultado, {
      realizada: "3:00",
      autorizada: "2:00",
      computada: "2:00",
      excedente: "1:00",
      avisos: ["EXCEDENTE_SOBRE_TOPE"],
    });
  });

  it("caso 19: dos novedades en la misma fecha", () => {
    const resultado = calcular({
      observacion: "AUSENTE POR ENFERMEDAD DUELO",
    });
    expect(resultado.bloqueante).toBe("NOVEDAD_DUPLICADA_EN_FECHA");
  });

  it("caso 20: licencia anual ordinaria en feriado, factor 1", () => {
    const resultado = calcular({
      observacion: "LIC. ANUAL ORDINARIA",
      feriados: feriado(FECHA_HABIL, "Feriado de prueba"),
      marcaciones: [par("08:00", "13:00")],
    });
    expectColumnas(resultado, {
      realizada: "5:00",
      autorizada: "8:00",
      computada: "5:00",
      excedente: "0:00",
      factor: 1,
      avisos: [],
    });
  });

  it("caso 21: licencia anual ordinaria en sábado no habilitado", () => {
    const resultado = calcular({
      fecha: FECHA_SABADO,
      observacion: "LIC. ANUAL ORDINARIA",
      marcaciones: [par("08:00", "11:00")],
    });
    expectColumnas(resultado, {
      realizada: "3:00",
      autorizada: "8:00",
      computada: "3:00",
      excedente: "0:00",
      avisos: [],
    });
  });

  it("caso 22: licencia anual ordinaria en domingo", () => {
    const resultado = calcular({
      fecha: FECHA_DOMINGO,
      observacion: "LIC. ANUAL ORDINARIA",
      marcaciones: [par("08:00", "11:00")],
    });
    expectColumnas(resultado, {
      realizada: "3:00",
      autorizada: "8:00",
      computada: "3:00",
      excedente: "0:00",
      avisos: [],
    });
  });

  it("caso 23: licencia anual ordinaria en feriado con exceso, factor 1", () => {
    const resultado = calcular({
      observacion: "LIC. ANUAL ORDINARIA",
      feriados: feriado(FECHA_HABIL, "Feriado de prueba"),
      marcaciones: [par("08:00", "17:00")],
    });
    expectColumnas(resultado, {
      realizada: "9:00",
      autorizada: "8:00",
      computada: "8:00",
      excedente: "1:00",
      factor: 1,
      avisos: ["EXCEDENTE_SOBRE_TOPE"],
    });
  });

  it("caso 24: licencia anual ordinaria en asueto con tope especial", () => {
    const resultado = calcular({
      observacion: "LIC. ANUAL ORDINARIA",
      eventos: evento(FECHA_HABIL, "ASUETO", "02:00"),
      marcaciones: [par("08:00", "11:00")],
    });
    expectColumnas(resultado, {
      realizada: "3:00",
      autorizada: "8:00",
      computada: "3:00",
      excedente: "0:00",
      avisos: [],
    });
  });

  it("caso 25: hábil con salida pasada la medianoche", () => {
    const resultado = calcular({ marcaciones: [par("18:00", "00:03")] });
    expectColumnas(resultado, {
      realizada: "6:03",
      autorizada: "4:00",
      computada: "4:00",
      excedente: "2:03",
      avisos: ["EXCEDENTE_SOBRE_TOPE"],
    });
  });

  it("caso 26: domingo con 0:30", () => {
    const resultado = calcular({
      fecha: FECHA_DOMINGO,
      marcaciones: [par("08:00", "08:30")],
    });
    expectColumnas(resultado, {
      realizada: "0:30",
      autorizada: "0:00",
      computada: "0:00",
      excedente: "0:30",
      avisos: ["TRABAJO_DOMINGO_SIN_AUTORIZACION"],
    });
  });

  it("caso 27: hábil con tres marcaciones", () => {
    const resultado = calcular({
      marcaciones: [par("08:00", "14:30"), par("18:00", null)],
    });
    expectColumnas(resultado, {
      realizada: "3:30",
      autorizada: "4:00",
      computada: "3:30",
      excedente: "0:00",
      trab: "10:00",
      metodo: "MAX_MIN_ESTIMADO",
      avisos: ["MARCACIONES_INCOMPLETAS"],
    });
  });

  it("caso 28: hábil con tres marcaciones y cruce de medianoche", () => {
    const resultado = calcular({
      marcaciones: [par("18:00", "23:00"), par("00:03", null)],
    });
    expectColumnas(resultado, {
      realizada: "6:03",
      autorizada: "4:00",
      computada: "4:00",
      excedente: "2:03",
      trab: "6:03",
      metodo: "MAX_MIN_ESTIMADO",
      avisos: ["MARCACIONES_INCOMPLETAS", "EXCEDENTE_SOBRE_TOPE"],
    });
  });

  it("caso 29: hábil con una sola marcación", () => {
    const resultado = calcular({ marcaciones: [par("08:00", null)] });
    expectColumnas(resultado, {
      realizada: "0:00",
      autorizada: "4:00",
      computada: "0:00",
      excedente: "0:00",
      trab: "0:00",
      metodo: "MAX_MIN_ESTIMADO",
      avisos: ["MARCACIONES_INCOMPLETAS"],
    });
  });
});

describe("derivadas del texto", () => {
  it("un paro usa su tope y no el del asueto", () => {
    const marcaciones = [par("08:00", "11:00")];
    const cfg = { tope_paro: "01:30", tope_asueto: "04:00" };
    const paro = calcular({
      cfg,
      eventos: evento(FECHA_HABIL, "PARO", null),
      marcaciones,
    });
    const asueto = calcular({
      cfg,
      eventos: evento(FECHA_HABIL, "ASUETO", null),
      marcaciones,
    });
    expectColumnas(paro, {
      realizada: "3:00",
      autorizada: "1:30",
      computada: "1:30",
      excedente: "1:30",
      avisos: ["EXCEDENTE_SOBRE_TOPE"],
    });
    expectColumnas(asueto, {
      realizada: "3:00",
      autorizada: "4:00",
      computada: "3:00",
      excedente: "0:00",
      avisos: [],
    });
  });

  it("el receso invernal en día hábil cuenta todo lo trabajado", () => {
    const resultado = calcular({
      observacion: "RECESO INVERNAL",
      marcaciones: [par("08:00", "13:00")],
    });
    expectColumnas(resultado, {
      realizada: "5:00",
      autorizada: "8:00",
      computada: "5:00",
      excedente: "0:00",
      avisos: [],
    });
    expect(resultado.novedad.codigo).toBe("RECESO_INVERNAL");
  });

  it("una justificación completa no modifica un día que no es hábil", () => {
    const resultado = calcular({
      observacion: "AUSENTE POR ENFERMEDAD",
      feriados: feriado(FECHA_HABIL, "Feriado de prueba"),
      marcaciones: [par("08:00", "11:00")],
    });
    expectColumnas(resultado, {
      realizada: "3:00",
      autorizada: "4:00",
      computada: "3:00",
      excedente: "0:00",
      factor: 2,
      avisos: [],
    });
  });

  it("un permiso parcial no modifica un día que no es hábil", () => {
    const resultado = calcular({
      fecha: FECHA_DOMINGO,
      observacion: "PERMISO MEDIA JORNADA",
      marcaciones: [par("08:00", "13:00")],
    });
    expectColumnas(resultado, {
      realizada: "5:00",
      autorizada: "0:00",
      computada: "0:00",
      excedente: "5:00",
      avisos: ["TRABAJO_DOMINGO_SIN_AUTORIZACION"],
    });
  });

  it("suma los pares completos del mismo día", () => {
    const resultado = calcular({
      marcaciones: [par("08:00", "12:00"), par("14:00", "18:00")],
    });
    expectColumnas(resultado, {
      realizada: "3:30",
      autorizada: "4:00",
      computada: "3:30",
      excedente: "0:00",
      trab: "8:00",
      metodo: "PARES_VALIDOS",
      avisos: [],
    });
  });

  it("un sábado no habilitado de 0:30 usa el aviso específico", () => {
    const resultado = calcular({
      fecha: FECHA_SABADO,
      marcaciones: [par("08:00", "08:30")],
    });
    expectColumnas(resultado, {
      realizada: "0:30",
      autorizada: "0:00",
      computada: "0:00",
      excedente: "0:30",
      avisos: ["TRABAJO_SABADO_NO_HABILITADO"],
    });
  });

  it("un sábado con una sola hora cargada queda no habilitado", () => {
    const marcaciones = [par("08:00", "11:00")];
    const conInicio = calcular({
      fecha: FECHA_SABADO,
      cfg: { sabado_inicio: "08:00", sabado_fin: null },
      marcaciones,
    });
    const conFin = calcular({
      fecha: FECHA_SABADO,
      cfg: { sabado_inicio: null, sabado_fin: "12:00" },
      marcaciones,
    });
    for (const resultado of [conInicio, conFin]) {
      expectColumnas(resultado, {
        realizada: "3:00",
        autorizada: "0:00",
        computada: "0:00",
        excedente: "3:00",
        avisos: ["TRABAJO_SABADO_NO_HABILITADO"],
      });
    }
  });

  it("una hora no interpretable bloquea la fecha y no lanza", () => {
    const calcularInvalida = () => calcular({
      marcaciones: [par("08:00", "25:00")],
    });
    expect(calcularInvalida).not.toThrow();
    const resultado = calcularInvalida();
    expect(resultado.bloqueante).toBe("DATOS_HORARIOS_IMPOSIBLES");
    expect(resultado.Hs_Extra_Realizada).toBe(0);
    expect(resultado.Hs_Computada_Sistema).toBe(0);
    expect(resultado.Hs_Excedente).toBe(0);
    expect(resultado.editable).toBe(false);
    expect(resultado.avisos).toEqual([]);
  });

  it("una salida igual al ingreso dura 0 y no bloquea", () => {
    const resultado = calcular({ marcaciones: [par("08:00", "08:00")] });
    expect(resultado.bloqueante).toBeNull();
    expect(resultado.Hs_Trab).toBe(0);
    expect(resultado.metodo).toBe("PARES_VALIDOS");
  });

  it("un día fuera de la vigencia queda en cero, sin aviso ni bloqueo", () => {
    const resultado = calcular({
      configuraciones: [cfgBase({ vigencia_desde: "2026-09-01" })],
      marcaciones: [par("08:00", "17:10")],
    });
    expect(resultado.bloqueante).toBeNull();
    expect(resultado.Hs_Trab).toBe(0);
    expect(resultado.Hs_Extra_Realizada).toBe(0);
    expect(resultado.Hs_Computada_Sistema).toBe(0);
    expect(resultado.Hs_Excedente).toBe(0);
    expect(resultado.Hs_Final).toBe(0);
    expect(resultado.avisos).toEqual([]);
    expect(resultado.editable).toBe(false);
  });

  it("una observación no reconocida no frena el cálculo", () => {
    const resultado = calcular({
      observacion: "NOTA SUELTA",
      marcaciones: [par("08:00", "17:10")],
    });
    expectColumnas(resultado, {
      realizada: "2:40",
      autorizada: "4:00",
      computada: "2:40",
      excedente: "0:00",
      avisos: ["OBSERVACION_NO_RECONOCIDA"],
    });
    expect(resultado.avisos[0].texto).toBe("NOTA SUELTA");
  });

  it("la vigencia contiene la fecha en sus dos extremos y no elige entre dos", () => {
    const abierta = cfgBase();
    const soloEseDia = cfgBase({ vigencia_desde: FECHA_HABIL, vigencia_hasta: FECHA_HABIL });
    const posterior = cfgBase({ vigencia_desde: "2026-08-20" });
    expect(configuracionVigente([soloEseDia], FECHA_HABIL)).toBe(soloEseDia);
    expect(configuracionVigente([posterior], FECHA_HABIL)).toBeNull();
    expect(() => configuracionVigente([abierta, soloEseDia], FECHA_HABIL)).toThrow(Error);
  });
});
