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
 *   eventos?: object[],
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
    eventos: parcial.eventos ?? [],
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
  it("B1: totales en C5:C9 para meses de 28, 30 y 31 días", async () => {
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
      expect(minutosDeValor(hoja.getCell("C5").value)).toBe(item.resultado.totales.realizadas);
      expect(minutosDeValor(hoja.getCell("C6").value)).toBe(item.resultado.totales.finalesSimples);
      expect(minutosDeValor(hoja.getCell("C7").value)).toBe(item.resultado.totales.finalesDobles);
      expect(minutosDeValor(hoja.getCell("C8").value)).toBe(item.resultado.totales.finalesEquivalentes);
      expect(resultadoFormula(hoja.getCell("C9").value)).toBe(item.resultado.totales.importe);
      expect(hoja.getCell("A6").value).toBe("Hs. finales simples");
      expect(hoja.getCell("A10").value).toBeNull();
      expect(hoja.getCell("C5").value).toMatchObject({
        formula: expect.stringMatching(/^SUM\(M13:M\d+\)$/),
      });
      expect(hoja.getCell("C8").value).toMatchObject({ formula: "C6+2*C7" });
    }
  });

  it("B3 y B4: validación en N y bloqueo según editable", async () => {
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
    const filaEditable = 13 + item.resultado.dias.findIndex((d) => d.fecha === "2026-08-18");
    const filaVacia = 13 + item.resultado.dias.findIndex((d) => d.fecha === "2026-08-19");

    expect(hoja.getCell(filaEditable, 14).protection?.locked).toBe(false);
    expect(hoja.getCell(filaVacia, 14).protection?.locked).not.toBe(false);
    expect(hoja.getCell("A1").protection?.locked).not.toBe(false);

    const validacion = hoja.getCell(filaEditable, 14).dataValidation;
    expect(validacion?.type).toBe("decimal");
    expect(validacion?.operator).toBe("between");
    expect(validacion?.error).toMatch(/horas finales/i);
    expect(hoja.getCell(filaVacia, 14).dataValidation).toBeUndefined();

    const zip = await JSZip.loadAsync(buffer);
    const xmlHoja = await zip.file("xl/worksheets/sheet2.xml").async("string");
    expect(xmlHoja).toContain(`sqref="N${filaEditable}"`);
    expect(xmlHoja).toContain(`<formula2>M${filaEditable}</formula2>`);
  });

  it("B5 y B6: Resumen apunta a C8 y control de horas máximas", async () => {
    const aPerez = agente({ legajo: 100, nombre: "PEREZ, Juan Alberto", nombre_reloj: "PEREZ, JUAN" });
    const aGomez = agente({ legajo: 200, nombre: "GOMEZ, Ana", nombre_reloj: "GOMEZ, ANA" });
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
    expect(resumen.getCell("C1").value).toBe("AGOSTO/2026");
    expect(resumen.getCell("A3").value).toBe(100);

    const e3 = resumen.getCell("E3").value;
    expect(String(/** @type {{ formula: string }} */ (e3).formula)).toContain("$C$8");
    expect(minutosDeValor(e3)).toBe(mPerez.resultado.totales.finalesEquivalentes);
    expect(resultadoFormula(resumen.getCell("F3").value)).toBe(mPerez.resultado.totales.importe);

    let filaDif = null;
    resumen.eachRow((row, n) => {
      if (row.getCell(1).value === "Diferencia (A - B)") {
        filaDif = n;
      }
    });
    expect(filaDif).not.toBeNull();
    expect(String(resultadoFormula(resumen.getCell(filaDif, 3).value))).toMatch(/SE SUPERA EL MÁXIMO/);
    expect(resumen.getCell(filaDif, 1).value).toBe("Diferencia (A - B)");
  });

  it("no tiene columnas S ni T; R está oculta; anchos definidos", async () => {
    const item = mesDe({
      anio: 2026,
      mes: 8,
      dias: [dia("2026-08-18", "08:00", "17:10")],
    });
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");

    expect(hoja.getCell(12, 19).value).toBeNull();
    expect(hoja.getCell(12, 20).value).toBeNull();
    expect(hoja.getCell(30, 19).value).toBeNull();
    expect(hoja.getCell(30, 20).value).toBeNull();
    expect(hoja.getColumn(18).hidden).toBe(true);
    expect(hoja.getCell(30, 18).value).toBe(1);

    expect(hoja.getColumn(2).width).toBeGreaterThan(20);
    expect(hoja.getColumn(3).width).toBeGreaterThanOrEqual(12);
    expect(hoja.getColumn(15).width).toBeGreaterThan(20);
    expect(hoja.pageSetup.printArea).toMatch(/^A1:Q\d+$/);

    const resumen = wb.getWorksheet("Resumen");
    expect(resumen.getColumn(2).width).toBeGreaterThan(20);
  });

  it("una regla de formato condicional por fila editable con fórmula y bgColor", async () => {
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
      const fila = 13 + item.resultado.dias.findIndex((d) => d.fecha === diaCalc.fecha);
      const cf = reglas.find((r) => r.ref === `N${fila}`);
      expect(cf).toBeDefined();
      const rule = cf.rules[0];
      expect(rule.type).toBe("expression");
      expect(rule.formulae[0]).toBe(`ROUND($N${fila}*1440,0)<>${diaCalc.Hs_Computada_Sistema}`);
      expect(rule.style.fill.bgColor.argb).toBe("FFA9D08E");
    }
  });

  it("colores de aviso y alternancia; N siempre azul", async () => {
    const item = mesDe({
      anio: 2026,
      mes: 8,
      feriados: [{ fecha: "2026-08-17", descripcion: "Feriado" }],
      dias: [
        dia("2026-08-17", "08:00", "16:00"),
        dia("2026-08-18", "08:00", "17:10"),
        dia("2026-08-23", "08:00", "11:00"),
      ],
    });
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const idx = (fecha) => 13 + item.resultado.dias.findIndex((d) => d.fecha === fecha);

    expect(hoja.getCell(idx("2026-08-17"), 1).fill?.fgColor?.argb).toBe("FFFFF2CC");
    expect(hoja.getCell(idx("2026-08-23"), 1).fill?.fgColor?.argb).toBe("FFF8CBAD");

    const fila21 = idx("2026-08-21");
    expect(hoja.getCell(fila21, 1).fill?.fgColor?.argb).toBe(
      fila21 % 2 === 0 ? "FFF2F2F2" : undefined,
    );
    // Sin el gris #EDEDED de día sin trabajo.
    expect(hoja.getCell(fila21, 1).fill?.fgColor?.argb).not.toBe("FFEDEDED");

    expect(hoja.getCell(idx("2026-08-18"), 14).fill?.fgColor?.argb).toBe("FFDDEBF7");
    expect(hoja.getCell(idx("2026-08-17"), 14).fill?.fgColor?.argb).toBe("FFDDEBF7");

    const c8 = hoja.getCell("C8").value;
    expect(c8).toMatchObject({ formula: "C6+2*C7" });
    expect(minutosDeValor(c8)).toBe(item.resultado.totales.finalesEquivalentes);
  });

  it("K usa jornadaExigible del permiso", async () => {
    const item = mesDe({
      anio: 2026,
      mes: 8,
      dias: [dia("2026-08-18", "08:00", "17:10", "PERMISO MEDIA JORNADA")],
    });
    const buffer = await generarLibro({ meses: [item], catalogo: CATALOGO });
    const wb = await leerLibro(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const fila = 13 + item.resultado.dias.findIndex((d) => d.fecha === "2026-08-18");
    expect(minutosDeValor(hoja.getCell(fila, 11).value)).toBe(210);
  });

  it("sumas semanales P y Q en sábado con result", async () => {
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
    const p = hoja.getCell(13, 16).value;
    const q = hoja.getCell(13, 17).value;
    expect(p).toMatchObject({ formula: "SUM(L13:L13)" });
    expect(q).toMatchObject({ formula: "SUM(N13:N13)" });
    expect(minutosDeValor(p)).toBe(item.resultado.dias[0].Tope_Aplicable);
    expect(minutosDeValor(q)).toBe(item.resultado.dias[0].Hs_Computada_Sistema);
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
