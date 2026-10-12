import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { leerArchivoMensual } from "../../src/excel/importarMensual.js";
import { formatearHM } from "../../src/motor/tiempo.js";

const DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(DIR, "../fixtures/Base-prueba.xlsx");

/**
 * @param {number} horas
 * @param {number} minutos
 * @param {number} [segundos]
 * @returns {Date}
 */
function horaExcel(horas, minutos, segundos = 0) {
  return new Date(Date.UTC(1899, 11, 30, horas, minutos, segundos));
}

/**
 * @param {number} anio
 * @param {number} mes
 * @param {number} dia
 * @returns {Date}
 */
function fechaExcel(anio, mes, dia) {
  return new Date(Date.UTC(anio, mes - 1, dia));
}

/**
 * @param {{
 *   encabezados?: Partial<Record<string, string>>,
 *   filas: Array<{
 *     nombre?: string,
 *     fecha?: Date|string|number|null,
 *     e?: Date|number|null,
 *     f?: Date|number|null,
 *     g?: Date|number|null,
 *     h?: Date|number|null,
 *     i?: Date|number|null,
 *     j?: Date|number|null,
 *     o?: string|{ richText: Array<{ text: string }> }|null,
 *   }>,
 * }} entrada
 * @returns {Promise<Buffer>}
 */
async function armarLibro(entrada) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Hoja1");
  const encabezados = {
    A: "Nombre",
    B: "Fecha",
    E: "Ingreso",
    F: "Salida",
    G: "Ingreso",
    H: "Salida",
    I: "Ingreso",
    J: "Salida",
    O: "Observaciones",
    ...entrada.encabezados,
  };
  const fila1 = hoja.getRow(1);
  for (const [letra, texto] of Object.entries(encabezados)) {
    fila1.getCell(letra.charCodeAt(0) - 64).value = texto;
  }
  entrada.filas.forEach((fila, indice) => {
    const r = hoja.getRow(indice + 2);
    r.getCell(1).value = fila.nombre ?? "AGENTE, Prueba";
    if (fila.fecha !== undefined) {
      r.getCell(2).value = fila.fecha;
    }
    r.getCell(5).value = fila.e ?? null;
    r.getCell(6).value = fila.f ?? null;
    r.getCell(7).value = fila.g ?? null;
    r.getCell(8).value = fila.h ?? null;
    r.getCell(9).value = fila.i ?? null;
    r.getCell(10).value = fila.j ?? null;
    r.getCell(15).value = fila.o ?? null;
  });
  const buffer = await libro.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe("leerArchivoMensual con Base-prueba.xlsx", () => {
  it("lee nombre, período 2026-07, 31 días y filas conocidas", async () => {
    const buffer = readFileSync(FIXTURE);
    const resultado = await leerArchivoMensual(buffer);
    expect(resultado.nombre).toBe("PÉREZ, JUAN");
    expect(resultado.periodo).toEqual({ anio: 2026, mes: 7 });
    expect(resultado.dias).toHaveLength(31);

    const dia01 = resultado.dias[0];
    expect(dia01.fecha).toBe("2026-07-01");
    expect(dia01.marcaciones).toEqual([
      { ingreso: 14 * 60 + 49, salida: 20 * 60 },
      { ingreso: null, salida: null },
      { ingreso: null, salida: null },
    ]);
    expect(dia01.observacion).toBe("Excede horario");

    const sinMarcas = resultado.dias.find((d) => d.fecha === "2026-07-02");
    expect(sinMarcas.marcaciones).toEqual([
      { ingreso: null, salida: null },
      { ingreso: null, salida: null },
      { ingreso: null, salida: null },
    ]);
    expect(sinMarcas.observacion).toBe("RAZONES PARTICULARES");

    const dosPares = resultado.dias.find((d) => d.fecha === "2026-07-28");
    expect(dosPares.marcaciones).toEqual([
      { ingreso: 14 * 60 + 46, salida: 16 * 60 },
      { ingreso: 18 * 60, salida: 20 * 60 },
      { ingreso: null, salida: null },
    ]);
    expect(dosPares.observacion).toBe("PERMISO MEDIA JORNADA");
  });
});

describe("leerArchivoMensual con libros en memoria", () => {
  it("conserva la posición de un ingreso sin salida", async () => {
    const buffer = await armarLibro({
      filas: [{
        fecha: fechaExcel(2026, 8, 1),
        e: horaExcel(8, 0),
        f: null,
        g: null,
        h: null,
      }],
    });
    const resultado = await leerArchivoMensual(buffer);
    expect(resultado.dias[0].marcaciones).toEqual([
      { ingreso: 8 * 60, salida: null },
      { ingreso: null, salida: null },
      { ingreso: null, salida: null },
    ]);
  });

  it("lee una salida 00:03 en la misma fila", async () => {
    const buffer = await armarLibro({
      filas: [{
        fecha: fechaExcel(2026, 8, 1),
        e: horaExcel(22, 0),
        f: horaExcel(0, 3),
      }],
    });
    const resultado = await leerArchivoMensual(buffer);
    expect(resultado.dias[0].marcaciones[0]).toEqual({
      ingreso: 22 * 60,
      salida: 3,
    });
  });

  it("lee tres pares completos", async () => {
    const buffer = await armarLibro({
      filas: [{
        fecha: fechaExcel(2026, 8, 1),
        e: horaExcel(8, 0),
        f: horaExcel(9, 0),
        g: horaExcel(10, 0),
        h: horaExcel(11, 0),
        i: horaExcel(12, 0),
        j: horaExcel(13, 0),
      }],
    });
    const resultado = await leerArchivoMensual(buffer);
    expect(resultado.dias[0].marcaciones).toEqual([
      { ingreso: 8 * 60, salida: 9 * 60 },
      { ingreso: 10 * 60, salida: 11 * 60 },
      { ingreso: 12 * 60, salida: 13 * 60 },
    ]);
  });

  it("une el texto enriquecido de la observación", async () => {
    const buffer = await armarLibro({
      filas: [{
        fecha: fechaExcel(2026, 8, 1),
        o: { richText: [{ text: "PERMISO " }, { text: "MEDIA JORNADA" }] },
      }],
    });
    const resultado = await leerArchivoMensual(buffer);
    expect(resultado.dias[0].observacion).toBe("PERMISO MEDIA JORNADA");
  });

  it("rechaza encabezados incorrectos", async () => {
    const buffer = await armarLibro({
      encabezados: { A: "Empleado" },
      filas: [{ fecha: fechaExcel(2026, 8, 1) }],
    });
    await expect(leerArchivoMensual(buffer)).rejects.toThrow(/encabezados/i);
  });

  it("rechaza una celda de fecha con tipo inválido", async () => {
    const buffer = await armarLibro({
      filas: [{ fecha: "2026-08-01" }],
    });
    await expect(leerArchivoMensual(buffer)).rejects.toThrow(/B2/);
  });

  it("lee 14:49 aunque la fracción de día tenga error de coma flotante", async () => {
    const fraccion = (14 * 60 + 49) / 1440 - 1e-10;
    const buffer = await armarLibro({
      filas: [{
        fecha: fechaExcel(2026, 8, 1),
        e: fraccion,
      }],
    });
    const resultado = await leerArchivoMensual(buffer);
    expect(resultado.dias[0].marcaciones[0].ingreso).toBe(14 * 60 + 49);
    expect(formatearHM(resultado.dias[0].marcaciones[0].ingreso)).toBe("14:49");
  });
});
