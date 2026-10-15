import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { generarLibro } from "../../src/excel/generarLibro.js";
import { calcularMes } from "../../src/motor/calculoMes.js";
import { catalogo as catalogoBase } from "../motor/fixtures/catalogo.js";

const CATALOGO = {
  ...catalogoBase,
  umbral_minimo: "00:50",
  nombre_libro: "Becas 540",
  horas_maximas: "560:00",
};

const FILA_ENC = 9;
const FILA_PRIMERA = 10;

/**
 * @param {object} [parcial]
 * @returns {object}
 */
function configuracion(parcial = {}) {
  return {
    vigencia_desde: "2020-01-01",
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
    tope_lao_receso: "08:00",
    valor_hora_base: 4500,
    ...parcial,
  };
}

/**
 * @param {object} [parcial]
 * @returns {object}
 */
function agente(parcial = {}) {
  return {
    id: "A001",
    legajo: 10001,
    dni: "12345678",
    nombre: "PEREZ, Juan Alberto",
    nombre_reloj: "PEREZ, JUAN",
    activo: true,
    configuraciones: [configuracion()],
    ...parcial,
  };
}

/**
 * @param {string} fecha
 * @param {string} ingreso
 * @param {string} salida
 * @param {string} [observacion]
 * @returns {object}
 */
function dia(fecha, ingreso, salida, observacion = "") {
  return {
    fecha,
    marcaciones: [{ ingreso, salida }],
    observacion,
  };
}

/**
 * @param {{
 *   anio: number,
 *   mes: number,
 *   dias?: object[],
 *   agente?: object,
 *   feriados?: object[],
 *   asuetos?: object[],
 *   catalogo?: object,
 *   nombre?: string,
 * }} parcial
 * @returns {{ resultado: object, archivo: object }}
 */
function mesDe(parcial) {
  const agentes = [parcial.agente ?? agente()];
  const archivo = {
    periodo: { anio: parcial.anio, mes: parcial.mes },
    dias: parcial.dias ?? [],
  };
  const resultado = calcularMes({
    nombre: parcial.nombre ?? agentes[0].nombre_reloj,
    agentes,
    archivo,
    feriados: parcial.feriados ?? [],
    asuetos: parcial.asuetos ?? [],
    catalogo: parcial.catalogo ?? CATALOGO,
  });
  return { resultado, archivo };
}

/**
 * @param {ArrayBuffer|Buffer|Uint8Array} buffer
 * @returns {Promise<ExcelJS.Workbook>}
 */
async function leerLibro(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

/**
 * @param {object} resultado
 * @param {string} fecha
 * @returns {number}
 */
function filaDe(resultado, fecha) {
  return FILA_PRIMERA + resultado.dias.findIndex((d) => d.fecha === fecha);
}

/**
 * @param {unknown} valor
 * @returns {unknown}
 */
function resultadoFormula(valor) {
  if (valor !== null && typeof valor === "object" && !(valor instanceof Date)
    && "result" in /** @type {object} */ (valor)) {
    return /** @type {{ result: unknown }} */ (valor).result;
  }
  return valor;
}

/**
 * @param {unknown} valor
 * @returns {number}
 */
function minutosDeValor(valor) {
  const v = resultadoFormula(valor);
  if (v instanceof Date) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return Math.round((v.getTime() - excelEpoch) / 60000);
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.round(v * 1440);
  }
  throw new Error(`No se pudo interpretar minutos desde ${String(v)}`);
}

describe("generarLibro", () => {
  it("totales en L3:L7 e importe en M5 para meses de 28, 30 y 31 días", async () => {
    const casos = [
      { anio: 2026, mes: 2, diasMes: 28, fecha: "2026-02-18" },
      { anio: 2026, mes: 4, diasMes: 30, fecha: "2026-04-20" },
      { anio: 2026, mes: 8, diasMes: 31, fecha: "2026-08-18" },
    ];
    for (const caso of casos) {
      const item = mesDe({
        anio: caso.anio,
        mes: caso.mes,
        dias: [dia(caso.fecha, "08:00", "17:10")],
      });
      expect(item.resultado.dias).toHaveLength(caso.diasMes);

      const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
      const wb = await leerLibro(buffer);
      const hoja = wb.getWorksheet("PEREZ, J");
      expect(hoja).toBeDefined();
      expect(hoja.getCell("A1").value).toMatch(/^INFORME DE HORAS EXTRAS -/);
      expect(hoja.getCell("H3").value).toBe("Hs. extra autorizadas");
      expect(hoja.getCell("H4").value).toBe("Hs. extra realizadas");
      expect(hoja.getCell("H5").value).toBe("Hs. finales (días comunes)");
      expect(hoja.getCell("H6").value).toBe("Hs. finales (feriados, cuentan x2)");
      expect(hoja.getCell("H7").value).toBe("Total hs. a liquidar");
      expect(hoja.getCell("M4").value).toBe("IMPORTE A LIQUIDAR");
      expect(minutosDeValor(hoja.getCell("L4").value)).toBe(item.resultado.totales.realizadas);
      expect(minutosDeValor(hoja.getCell("L5").value)).toBe(item.resultado.totales.finalesSimples);
      expect(minutosDeValor(hoja.getCell("L6").value)).toBe(item.resultado.totales.finalesDobles);
      expect(minutosDeValor(hoja.getCell("L7").value)).toBe(item.resultado.totales.finalesEquivalentes);
      expect(resultadoFormula(hoja.getCell("M5").value)).toBe(item.resultado.totales.importe);
      expect(hoja.getCell("L3").value).toMatchObject({
        formula: `SUM(J${FILA_PRIMERA}:J${FILA_ENC + caso.diasMes})`,
      });
      expect(hoja.getCell("L4").value).toMatchObject({
        formula: expect.stringMatching(/^SUM\(K10:K\d+\)$/),
      });
      expect(hoja.getCell("L7").value).toMatchObject({ formula: "L5+2*L6" });
      expect(hoja.getCell("M5").value).toMatchObject({
        formula: "ROUNDUP(ROUND(L7*1440,0)*B7/60,0)",
      });
      expect(hoja.getCell("L3").alignment?.horizontal).toBe("right");
      expect(hoja.getCell("M5").numFmt).toBe('"$"#,##0');
    }
  });

  it("validación en L, protección, sumas semanales e impresión", async () => {
    const item = mesDe({
      anio: 2026,
      mes: 8,
      dias: [
        dia("2026-08-18", "08:00", "17:10"),
        { fecha: "2026-08-19", marcaciones: [], observacion: "" },
      ],
    });
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const filaEditable = filaDe(item.resultado, "2026-08-18");
    const filaVacia = filaDe(item.resultado, "2026-08-19");

    expect(hoja.getCell(filaEditable, 12).protection?.locked).toBe(false);
    expect(hoja.getCell(filaVacia, 12).protection?.locked).not.toBe(false);
    expect(hoja.getCell("A1").protection?.locked).not.toBe(false);

    const validacion = hoja.getCell(filaEditable, 12).dataValidation;
    expect(validacion?.type).toBe("decimal");
    expect(validacion?.operator).toBe("between");
    expect(validacion?.error).toMatch(/horas finales/i);
    expect(hoja.getCell(filaVacia, 12).dataValidation).toBeUndefined();

    const zip = await JSZip.loadAsync(buffer);
    const xmlHoja = await zip.file("xl/worksheets/sheet2.xml").async("string");
    expect(xmlHoja).toContain(`sqref="L${filaEditable}"`);
    expect(xmlHoja).toContain(`<formula2>K${filaEditable}</formula2>`);

    expect(hoja.pageSetup.printArea).toMatch(/^A1:O\d+$/);
    expect(hoja.pageSetup.printTitlesRow).toBe("9:9");
    expect(hoja.pageSetup.orientation).toBe("landscape");
    expect(hoja.headerFooter.oddHeader).toContain("PEREZ, Juan Alberto");
    expect(hoja.headerFooter.oddHeader).toContain("10001");
    expect(hoja.headerFooter.oddFooter).toContain("&P");
  });

  it("Resumen apunta a L7 y control con montos en D", async () => {
    const aPerez = agente({
      legajo: 100,
      dni: "23456789",
      nombre: "PEREZ, Juan Alberto",
      nombre_reloj: "PEREZ, JUAN",
    });
    const aGomez = agente({
      legajo: 200,
      dni: "34567890",
      nombre: "GOMEZ, Ana",
      nombre_reloj: "GOMEZ, ANA",
    });
    const mPerez = mesDe({
      anio: 2026,
      mes: 8,
      agente: aPerez,
      dias: [dia("2026-08-18", "08:00", "20:00")],
    });
    const mGomez = mesDe({
      anio: 2026,
      mes: 8,
      agente: aGomez,
      dias: [dia("2026-08-18", "08:00", "17:10")],
    });

    const catalogoBajo = { ...CATALOGO, horas_maximas: "1:00" };
    const buffer = await generarLibro({
      meses: [mGomez, mPerez],
      catalogo: catalogoBajo,
    });
    const wb = await leerLibro(buffer);

    expect(wb.worksheets.map((h) => h.name)).toEqual(["Resumen", "PEREZ, J", "GOMEZ, A"]);
    const resumen = wb.getWorksheet("Resumen");
    expect(resumen.getCell("A1").value).toBe(
      "INFORME MENSUAL DE TOTAL DE HORAS EXTRAS - AGOSTO/2026",
    );
    expect(resumen.getCell("C1").value).toBeNull();
    expect(resumen.getCell("A3").value).toBe(100);
    expect(resumen.getCell("A3").numFmt).toBe("0");
    expect(resumen.getCell("C3").value).toBe("23.456.789");

    const e3 = resumen.getCell("E3").value;
    expect(String(/** @type {{ formula: string }} */ (e3).formula)).toContain("$L$7");
    expect(minutosDeValor(e3)).toBe(mPerez.resultado.totales.finalesEquivalentes);
    expect(resultadoFormula(resumen.getCell("F3").value)).toBe(mPerez.resultado.totales.importe);

    let filaDif = null;
    let filaB = null;
    resumen.eachRow((row, n) => {
      if (row.getCell(2).value === "Diferencia (A - B)") {
        filaDif = n;
      }
      if (row.getCell(2).value === "Total de horas (B)") {
        filaB = n;
      }
    });
    expect(filaDif).not.toBeNull();
    expect(filaB).not.toBeNull();
    expect(String(resultadoFormula(resumen.getCell(filaDif, 3).value))).toMatch(/SE SUPERA EL MÁXIMO/);
    expect(resumen.getCell(filaDif, 4).value).toMatchObject({
      formula: `D${filaDif - 2}-D${filaB}`,
    });
    expect(resumen.getCell(filaB, 4).value).toMatchObject({
      formula: "F5",
    });
    expect(resumen.getCell(filaDif - 2, 2).value).toBe("Cant. máxima de hs. a abonar (A)");
    expect(resumen.getCell("B5").value).toBe("Totales");
    expect(resumen.getCell(2, 1).font?.bold).toBe(true);
    expect(resumen.getCell(2, 1).fill?.fgColor?.argb).toBe("FFEEF2F6");
    expect(resumen.getCell("D3").numFmt).toBe('"$"#,##0');
    expect(resumen.getCell("F3").numFmt).toBe('"$"#,##0');
    expect(resumen.getCell("B3").alignment?.horizontal).toBe("left");
    expect(resumen.getCell("A3").alignment?.horizontal).toBe("center");
  });

  it("cuadrícula oculta; Observaciones última visible; P oculta; legajo y DNI", async () => {
    const item = mesDe({
      anio: 2026,
      mes: 8,
      agente: agente({ dni: "23456789" }),
      dias: [dia("2026-08-18", "08:00", "17:10")],
    });
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const resumen = wb.getWorksheet("Resumen");

    for (const h of wb.worksheets) {
      expect(h.views?.[0]?.showGridLines).toBe(false);
    }

    expect(hoja.getCell(FILA_ENC, 15).value).toBe("Observaciones");
    expect(hoja.getCell(FILA_ENC, 16).value).toBeNull();
    expect(hoja.getColumn(16).hidden).toBe(true);
    expect(hoja.getCell(filaDe(item.resultado, "2026-08-18"), 16).value).toBe(1);

    expect(hoja.getCell("B5").value).toBe(10001);
    expect(hoja.getCell("B5").numFmt).toBe("0");
    expect(hoja.getCell("B6").value).toBe("23.456.789");
    expect(typeof hoja.getCell("B6").value).toBe("string");

    expect(hoja.getColumn(1).width).toBe(12);
    expect(hoja.getColumn(15).width).toBe(30);
    expect(hoja.pageSetup.printArea).toMatch(/^A1:O\d+$/);
    expect(resumen.getColumn(2).width).toBe(36);
  });

  it("una regla de formato condicional verde por fila editable con prioridad", async () => {
    const item = mesDe({
      anio: 2026,
      mes: 8,
      dias: [
        dia("2026-08-18", "08:00", "17:10"),
        { fecha: "2026-08-19", marcaciones: [], observacion: "" },
      ],
    });
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const editables = item.resultado.dias.filter((d) => d.editable);
    const reglas = hoja.conditionalFormattings ?? [];
    expect(reglas).toHaveLength(editables.length);

    for (const diaCalc of editables) {
      const fila = filaDe(item.resultado, diaCalc.fecha);
      const cf = reglas.find((r) => r.ref === `L${fila}`);
      expect(cf).toBeDefined();
      const rule = cf.rules[0];
      expect(rule.type).toBe("expression");
      expect(rule.priority).toBe(1);
      expect(rule.formulae[0]).toBe(`ROUND($L${fila}*1440,0)<>${diaCalc.Hs_Computada_Sistema}`);
      expect(rule.style.fill.bgColor.argb).toBe("FFA9D08E");
    }
  });

  it("sin relleno en filas comunes; rojo solo bloqueante; ámbar solo en L con excedente", async () => {
    const item = mesDe({
      anio: 2026,
      mes: 8,
      feriados: [{ fecha: "2026-08-17", descripcion: "Feriado" }],
      dias: [
        dia("2026-08-17", "08:00", "16:00"),
        dia("2026-08-18", "08:00", "17:10"),
        dia("2026-08-23", "08:00", "11:00"),
        { fecha: "2026-08-24", marcaciones: [{ ingreso: "08:00", salida: null }], observacion: "" },
      ],
    });
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const idx = (fecha) => filaDe(item.resultado, fecha);

    // Feriado con excedente: ámbar en L, sin amarillo de fila.
    expect(hoja.getCell(idx("2026-08-17"), 1).fill?.fgColor?.argb).toBeUndefined();
    expect(hoja.getCell(idx("2026-08-17"), 12).fill?.fgColor?.argb).toBe("FFFFEFB8");

    // Hábil normal editable: L blanco, sin azul fijo.
    expect(hoja.getCell(idx("2026-08-18"), 12).fill?.fgColor?.argb).toBe("FFFFFFFF");
    expect(hoja.getCell(idx("2026-08-18"), 1).fill?.fgColor?.argb).toBeUndefined();

    // Domingo con trabajo: ámbar en L, sin naranja de fila.
    expect(hoja.getCell(idx("2026-08-23"), 1).fill?.fgColor?.argb).toBeUndefined();
    expect(hoja.getCell(idx("2026-08-23"), 12).fill?.fgColor?.argb).toBe("FFFFEFB8");

    // Marcaciones incompletas: no pintan.
    const filaInc = idx("2026-08-24");
    const diaInc = item.resultado.dias.find((d) => d.fecha === "2026-08-24");
    expect(diaInc.avisos.some((a) => a.codigo === "MARCACIONES_INCOMPLETAS")).toBe(true);
    expect(hoja.getCell(filaInc, 1).fill?.fgColor?.argb).toBeUndefined();
    expect(hoja.getCell(filaInc, 12).fill?.fgColor?.argb).toBeUndefined();

    // Día vacío sin bloqueante: sin relleno zebra.
    const fila21 = idx("2026-08-21");
    expect(hoja.getCell(fila21, 1).fill?.fgColor?.argb).toBeUndefined();
  });

  it("rojo en fila bloqueante; L sin borde de campo", async () => {
    const item = mesDe({
      anio: 2026,
      mes: 8,
      dias: [
        {
          fecha: "2026-08-18",
          marcaciones: [{ ingreso: "25:00", salida: "17:00" }],
          observacion: "",
        },
      ],
    });
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const fila = filaDe(item.resultado, "2026-08-18");
    expect(item.resultado.dias.find((d) => d.fecha === "2026-08-18").bloqueante).not.toBeNull();
    expect(hoja.getCell(fila, 1).fill?.fgColor?.argb).toBe("FFF8D7D7");
    expect(hoja.getCell(fila, 15).fill?.fgColor?.argb).toBe("FFF8D7D7");
    expect(hoja.getCell(fila, 12).protection?.locked).not.toBe(false);
    expect(hoja.getCell(fila, 12).border?.left?.color?.argb).not.toBe("FF9FB0C3");
  });

  it("fila bloqueada con texto en marcación: rojo, texto en celda, L bloqueada y totales ok", async () => {
    const agentes = [agente()];
    const archivo = {
      periodo: { anio: 2026, mes: 8 },
      dias: [
        {
          fecha: "2026-08-18",
          marcaciones: [{ ingreso: "xxx", salida: 1030 }],
          observacion: "",
        },
        {
          fecha: "2026-08-19",
          marcaciones: [{ ingreso: 480, salida: 1030 }],
          observacion: "",
        },
      ],
    };
    const resultado = calcularMes({
      nombre: agentes[0].nombre_reloj,
      agentes,
      archivo: {
        periodo: archivo.periodo,
        dias: archivo.dias.map((d) => ({
          fecha: d.fecha,
          observacion: d.observacion,
          marcaciones: d.marcaciones.map((par) => ({
            ingreso: typeof par.ingreso === "number"
              ? `${String(Math.floor(par.ingreso / 60)).padStart(2, "0")}:${String(par.ingreso % 60).padStart(2, "0")}`
              : par.ingreso,
            salida: typeof par.salida === "number"
              ? `${String(Math.floor(par.salida / 60)).padStart(2, "0")}:${String(par.salida % 60).padStart(2, "0")}`
              : par.salida,
          })),
        })),
      },
      feriados: [],
      asuetos: [],
      catalogo: CATALOGO,
    });
    const item = { resultado, archivo };
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const filaBloq = filaDe(resultado, "2026-08-18");
    const filaOk = filaDe(resultado, "2026-08-19");

    expect(resultado.dias.find((d) => d.fecha === "2026-08-18").bloqueante)
      .toBe("DATOS_HORARIOS_IMPOSIBLES");
    expect(hoja.getCell(filaBloq, 1).fill?.fgColor?.argb).toBe("FFF8D7D7");
    expect(hoja.getCell(filaBloq, 3).value).toBe("xxx");
    expect(minutosDeValor(hoja.getCell(filaBloq, 4).value)).toBe(1030);
    expect(minutosDeValor(hoja.getCell(filaBloq, 11).value)).toBe(0);
    expect(hoja.getCell(filaBloq, 12).protection?.locked).not.toBe(false);
    expect(minutosDeValor(hoja.getCell(filaOk, 11).value)).toBe(160);
    expect(minutosDeValor(hoja.getCell("L4").value)).toBe(resultado.totales.realizadas);
    expect(resultado.totales.realizadas).toBe(160);
  });

  it("I usa jornadaExigible del permiso; I en 0:00 según reglas de presentación", async () => {
    const ag = agente({
      configuraciones: [configuracion({
        sabado_inicio: "08:00",
        sabado_fin: "12:00",
        sabado_tope: "04:00",
      })],
    });
    const agSabadoOff = agente({
      id: "A002",
      legajo: 10002,
      nombre: "LOPEZ, Maria",
      nombre_reloj: "LOPEZ, MARIA",
      configuraciones: [configuracion()],
    });
    const item = mesDe({
      anio: 2026,
      mes: 8,
      agente: ag,
      feriados: [{ fecha: "2026-08-17", descripcion: "Feriado" }],
      asuetos: [
        { fecha: "2026-08-19", descripcion: "Asueto" },
        { fecha: "2026-08-20", descripcion: "Paro" },
      ],
      dias: [
        dia("2026-08-17", "08:00", "12:00"),
        dia("2026-08-18", "08:00", "17:10"),
        dia("2026-08-19", "08:00", "12:00"),
        dia("2026-08-20", "08:00", "12:00"),
        dia("2026-08-21", "08:00", "12:00", "AUSENTE POR ENFERMEDAD"),
        dia("2026-08-22", "08:00", "12:00"),
        dia("2026-08-23", "08:00", "12:00"),
        dia("2026-08-24", "08:00", "12:00", "LIC. ANUAL ORDINARIA"),
        dia("2026-08-25", "08:00", "17:10", "PERMISO MEDIA JORNADA"),
      ],
    });
    const itemOff = mesDe({
      anio: 2026,
      mes: 8,
      agente: agSabadoOff,
      dias: [dia("2026-08-22", "08:00", "11:00")],
    });
    const buffer = await generarLibro({ meses: [item, itemOff], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const hojaOff = wb.getWorksheet("LOPEZ, M");
    const iCol = (fecha) => minutosDeValor(hoja.getCell(filaDe(item.resultado, fecha), 9).value);
    const jCol = (fecha) => minutosDeValor(hoja.getCell(filaDe(item.resultado, fecha), 10).value);

    expect(iCol("2026-08-17")).toBe(0);
    expect(iCol("2026-08-18")).toBe(390);
    expect(iCol("2026-08-19")).toBe(0);
    expect(iCol("2026-08-20")).toBe(0);
    expect(iCol("2026-08-21")).toBe(0);
    expect(jCol("2026-08-21")).toBe(0);
    expect(iCol("2026-08-22")).toBe(390);
    expect(iCol("2026-08-23")).toBe(0);
    expect(iCol("2026-08-24")).toBe(390);
    expect(iCol("2026-08-25")).toBe(210);
    expect(minutosDeValor(hojaOff.getCell(filaDe(itemOff.resultado, "2026-08-22"), 9).value)).toBe(0);
  });

  it("J en feriado/asueto: tope solo con marcación; L3 y M usan J mostrada", async () => {
    const item = mesDe({
      anio: 2026,
      mes: 8,
      feriados: [{ fecha: "2026-08-17", descripcion: "Feriado" }],
      asuetos: [
        { fecha: "2026-08-19", descripcion: "Asueto" },
        { fecha: "2026-08-20", descripcion: "Paro" },
      ],
      dias: [
        dia("2026-08-17", "08:00", "12:00"),
        { fecha: "2026-08-19", marcaciones: [], observacion: "" },
        dia("2026-08-20", "09:00", "13:00"),
        dia("2026-08-24", "08:00", "12:00", "LIC. ANUAL ORDINARIA"),
      ],
    });
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const idx = (fecha) => filaDe(item.resultado, fecha);
    const diaCalc = (fecha) => item.resultado.dias.find((d) => d.fecha === fecha);

    expect(minutosDeValor(hoja.getCell(idx("2026-08-17"), 10).value)).toBe(diaCalc("2026-08-17").Tope_Aplicable);
    expect(minutosDeValor(hoja.getCell(idx("2026-08-19"), 10).value)).toBe(0);
    expect(diaCalc("2026-08-19").Tope_Aplicable).toBeGreaterThan(0);
    expect(minutosDeValor(hoja.getCell(idx("2026-08-20"), 10).value)).toBe(diaCalc("2026-08-20").Tope_Aplicable);
    expect(minutosDeValor(hoja.getCell(idx("2026-08-24"), 10).value)).toBe(diaCalc("2026-08-24").Tope_Aplicable);

    let sumaJ = 0;
    for (let i = 0; i < item.resultado.dias.length; i += 1) {
      const v = hoja.getCell(FILA_PRIMERA + i, 10).value;
      if (v !== null && v !== undefined) {
        sumaJ += minutosDeValor(v);
      }
    }
    expect(minutosDeValor(hoja.getCell("L3").value)).toBe(sumaJ);
    expect(hoja.getCell("L3").value).toMatchObject({ formula: "SUM(J10:J40)" });

    const mSab = hoja.getCell(idx("2026-08-22"), 13).value;
    expect(mSab).toMatchObject({ formula: `SUM(J${idx("2026-08-17")}:J${idx("2026-08-22")})` });
    const esperadaM = minutosDeValor(hoja.getCell(idx("2026-08-17"), 10).value)
      + minutosDeValor(hoja.getCell(idx("2026-08-18"), 10).value)
      + minutosDeValor(hoja.getCell(idx("2026-08-19"), 10).value)
      + minutosDeValor(hoja.getCell(idx("2026-08-20"), 10).value)
      + minutosDeValor(hoja.getCell(idx("2026-08-21"), 10).value)
      + minutosDeValor(hoja.getCell(idx("2026-08-22"), 10).value);
    expect(minutosDeValor(mSab)).toBe(esperadaM);
  });

  it("alineación centrada salvo O; L3:L7 a la derecha; B del Resumen a la izquierda", async () => {
    const item = mesDe({
      anio: 2026,
      mes: 8,
      dias: [dia("2026-08-18", "08:00", "17:10")],
    });
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const resumen = wb.getWorksheet("Resumen");
    const fila = filaDe(item.resultado, "2026-08-18");

    expect(hoja.getCell(FILA_ENC, 1).alignment?.horizontal).toBe("center");
    expect(hoja.getCell(FILA_ENC, 2).alignment?.horizontal).toBe("center");
    expect(hoja.getCell(FILA_ENC, 15).alignment?.horizontal).toBe("left");
    expect(hoja.getCell(fila, 1).alignment?.horizontal).toBe("center");
    expect(hoja.getCell(fila, 2).alignment?.horizontal).toBe("center");
    expect(hoja.getCell(fila, 11).alignment?.horizontal).toBe("center");
    expect(hoja.getCell(fila, 15).alignment?.horizontal).toBe("left");
    for (let filaTot = 3; filaTot <= 7; filaTot += 1) {
      expect(hoja.getCell(filaTot, 12).alignment?.horizontal).toBe("right");
    }
    expect(resumen.getCell("B3").alignment?.horizontal).toBe("left");
    expect(resumen.getCell("A3").alignment?.horizontal).toBe("center");
  });

  it("sumas semanales M y N en sábado con result", async () => {
    const ag = agente({
      configuraciones: [configuracion({
        sabado_inicio: "08:00",
        sabado_fin: "12:00",
        sabado_tope: "04:00",
      })],
    });
    const item = mesDe({
      anio: 2026,
      mes: 8,
      agente: ag,
      dias: [dia("2026-08-01", "08:00", "12:00")],
    });
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const m = hoja.getCell(FILA_PRIMERA, 13).value;
    const n = hoja.getCell(FILA_PRIMERA, 14).value;
    expect(m).toMatchObject({ formula: "SUM(J10:J10)" });
    expect(n).toMatchObject({ formula: "SUM(L10:L10)" });
    expect(minutosDeValor(m)).toBe(item.resultado.dias[0].Tope_Aplicable);
    expect(minutosDeValor(n)).toBe(item.resultado.dias[0].Hs_Computada_Sistema);
  });

  it("filas de sábado con borde medium; texto gris solo sin marcaciones y realizadas 0", async () => {
    const ag = agente({
      configuraciones: [configuracion({
        sabado_inicio: "08:00",
        sabado_fin: "12:00",
        sabado_tope: "04:00",
      })],
    });
    const item = mesDe({
      anio: 2026,
      mes: 8,
      agente: ag,
      dias: [
        dia("2026-08-01", "08:00", "12:00"),
        dia("2026-08-18", "08:00", "14:30"),
      ],
    });
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const sab = filaDe(item.resultado, "2026-08-01");
    const habilSinExtra = filaDe(item.resultado, "2026-08-18");
    const domingoVacio = filaDe(item.resultado, "2026-08-02");

    expect(hoja.getCell(sab, 1).border?.bottom?.style).toBe("medium");
    expect(hoja.getCell(sab, 1).border?.bottom?.color?.argb).toBe("FFAEB9C6");
    expect(hoja.getCell(habilSinExtra, 1).border?.bottom?.style).toBe("thin");

    // Domingo vacío: apagado.
    expect(hoja.getCell(domingoVacio, 1).font?.color?.argb).toBe("FFA3AAB4");
    // Hábil con marcaciones y realizadas 0:00: no apagado.
    expect(minutosDeValor(hoja.getCell(habilSinExtra, 11).value)).toBe(0);
    expect(hoja.getCell(habilSinExtra, 1).font?.color?.argb).toBe("FF262626");
  });

  it("títulos con centerContinuous sin combinar; alturas del Resumen", async () => {
    const item = mesDe({
      anio: 2026,
      mes: 8,
      dias: [dia("2026-08-18", "08:00", "17:10")],
    });
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const resumen = wb.getWorksheet("Resumen");

    for (let col = 1; col <= 15; col += 1) {
      expect(hoja.getCell(1, col).alignment?.horizontal).toBe("centerContinuous");
      expect(hoja.getCell(1, col).alignment?.vertical).toBe("middle");
    }
    expect(hoja.getCell("A1").value).toMatch(/^INFORME DE HORAS EXTRAS -/);
    for (let col = 2; col <= 15; col += 1) {
      expect(hoja.getCell(1, col).value).toBeNull();
    }
    expect(hoja.hasMerges).toBe(false);

    for (let col = 1; col <= 6; col += 1) {
      expect(resumen.getCell(1, col).alignment?.horizontal).toBe("centerContinuous");
      expect(resumen.getCell(1, col).alignment?.vertical).toBe("middle");
    }
    expect(resumen.getCell("A1").value).toMatch(/^INFORME MENSUAL DE TOTAL/);
    for (let col = 2; col <= 6; col += 1) {
      expect(resumen.getCell(1, col).value).toBeNull();
    }
    expect(resumen.hasMerges).toBe(false);

    expect(resumen.getRow(1).height).toBe(28);
    expect(resumen.getRow(2).height).toBe(30);
    expect(resumen.getCell(2, 1).alignment?.vertical).toBe("middle");
    expect(resumen.getCell(2, 1).alignment?.wrapText).toBe(true);
    expect(hoja.getRow(FILA_ENC).height).toBe(32);
  });

  it("nombres de hoja repetidos agregan sufijo 2, 3", async () => {
    const a1 = agente({ legajo: 1, nombre: "PEREZ, Juan Alberto", nombre_reloj: "PEREZ, JUAN" });
    const a2 = agente({ legajo: 2, nombre: "PEREZ, Julia", nombre_reloj: "PEREZ, JULIA" });
    const buffer = await generarLibro({
      meses: [
        mesDe({ anio: 2026, mes: 8, agente: a1, dias: [] }),
        mesDe({ anio: 2026, mes: 8, agente: a2, dias: [] }),
      ],
      catalogo: CATALOGO,
    });
    const wb = await leerLibro(buffer);
    expect(wb.worksheets.map((h) => h.name)).toEqual(["Resumen", "PEREZ, J", "PEREZ, J 2"]);
  });
});
