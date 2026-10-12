/**
 * Importación del Excel mensual exportado por el control de acceso (sección 4).
 * Una hoja, un agente, una fila por día. Sin DOM.
 */

import ExcelJS from "exceljs";

/** Encabezados fijos de las columnas que se leen. */
const ENCABEZADOS = Object.freeze({
  A: "Nombre",
  B: "Fecha",
  E: "Ingreso",
  F: "Salida",
  G: "Ingreso",
  H: "Salida",
  I: "Ingreso",
  J: "Salida",
  O: "Observaciones",
});

const COL_NOMBRE = 1;
const COL_FECHA = 2;
const PARES = [
  [5, 6],
  [7, 8],
  [9, 10],
];
const COL_OBSERVACION = 15;

/**
 * @param {unknown} valor
 * @returns {boolean}
 */
function estaVacio(valor) {
  return valor === null || valor === undefined || valor === "";
}

/**
 * Une las partes de un texto enriquecido de ExcelJS, o el string puro.
 *
 * @param {unknown} valor
 * @returns {string}
 */
function textoDeCelda(valor) {
  if (estaVacio(valor)) {
    return "";
  }
  if (typeof valor === "string") {
    return valor;
  }
  if (typeof valor === "object" && valor !== null && Array.isArray(/** @type {{ richText?: unknown }} */ (valor).richText)) {
    return /** @type {{ richText: Array<{ text?: string }> }} */ (valor).richText
      .map((parte) => (typeof parte.text === "string" ? parte.text : ""))
      .join("");
  }
  if (typeof valor === "object" && valor !== null && typeof /** @type {{ text?: unknown }} */ (valor).text === "string") {
    return /** @type {{ text: string }} */ (valor).text;
  }
  return String(valor);
}

/**
 * Minutos enteros 0–1439 desde un Date en UTC: redondea al segundo y trunca al minuto.
 *
 * @param {Date} fecha
 * @returns {number}
 */
function minutosDesdeDateUtc(fecha) {
  const segundos = Math.round(
    fecha.getUTCHours() * 3600
    + fecha.getUTCMinutes() * 60
    + fecha.getUTCSeconds()
    + fecha.getUTCMilliseconds() / 1000,
  );
  const minutos = Math.floor(segundos / 60);
  if (minutos < 0 || minutos > 1439) {
    return ((minutos % 1440) + 1440) % 1440;
  }
  return minutos;
}

/**
 * Minutos enteros desde una fracción de día de Excel: redondea al segundo y trunca al minuto.
 *
 * @param {number} fraccion
 * @returns {number}
 */
function minutosDesdeFraccion(fraccion) {
  const dia = fraccion - Math.floor(fraccion);
  const segundos = Math.round(dia * 86400);
  const minutos = Math.floor(segundos / 60);
  if (minutos >= 1440) {
    return 0;
  }
  if (minutos < 0) {
    return ((minutos % 1440) + 1440) % 1440;
  }
  return minutos;
}

/**
 * @param {import("exceljs").Cell} celda
 * @returns {string}
 */
function direccion(celda) {
  return celda.address;
}

/**
 * @param {import("exceljs").Worksheet} hoja
 */
function exigirEncabezados(hoja) {
  const fila = hoja.getRow(1);
  /** @type {string[]} */
  const errores = [];
  for (const [letra, esperado] of Object.entries(ENCABEZADOS)) {
    const col = letra.charCodeAt(0) - 64;
    const valor = fila.getCell(col).value;
    const texto = typeof valor === "string" ? valor : textoDeCelda(valor);
    if (texto !== esperado) {
      errores.push(`${letra}1: se esperaba "${esperado}" y se leyó ${JSON.stringify(texto)}`);
    }
  }
  if (errores.length > 0) {
    throw new Error(`Los encabezados de la fila 1 no son los esperados.\n${errores.join("\n")}`);
  }
}

/**
 * @param {import("exceljs").Cell} celda
 * @returns {string} AAAA-MM-DD
 */
function leerFecha(celda) {
  const valor = celda.value;
  if (estaVacio(valor)) {
    throw new Error(`La celda ${direccion(celda)} de fecha está vacía.`);
  }
  if (valor instanceof Date) {
    const anio = valor.getUTCFullYear();
    const mes = valor.getUTCMonth() + 1;
    const dia = valor.getUTCDate();
    return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
  throw new Error(
    `La celda ${direccion(celda)} de fecha no tiene el tipo esperado (se esperaba una fecha de Excel).`,
  );
}

/**
 * @param {import("exceljs").Cell} celda
 * @returns {number|null}
 */
function leerHora(celda) {
  const valor = celda.value;
  if (estaVacio(valor)) {
    return null;
  }
  if (valor instanceof Date) {
    return minutosDesdeDateUtc(valor);
  }
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return minutosDesdeFraccion(valor);
  }
  throw new Error(
    `La celda ${direccion(celda)} de hora no tiene el tipo esperado (se esperaba una hora de Excel).`,
  );
}

/**
 * Lee un buffer .xlsx del export mensual y produce la estructura de la sección 4.
 *
 * @param {ArrayBuffer|Uint8Array|Buffer} buffer
 * @returns {Promise<{
 *   nombre: string,
 *   periodo: { anio: number, mes: number },
 *   dias: Array<{
 *     fecha: string,
 *     marcaciones: Array<{ ingreso: number|null, salida: number|null }>,
 *     observacion: string,
 *   }>,
 * }>}
 */
export async function leerArchivoMensual(buffer) {
  const libro = new ExcelJS.Workbook();
  // ExcelJS acepta Buffer, Uint8Array o ArrayBuffer vía NodeBuffer/array.
  await libro.xlsx.load(/** @type {any} */ (buffer));
  const hoja = libro.worksheets[0];
  if (hoja === undefined) {
    throw new Error("El archivo no tiene hojas.");
  }
  exigirEncabezados(hoja);

  /** @type {Array<{ fecha: string, marcaciones: Array<{ ingreso: number|null, salida: number|null }>, observacion: string }>} */
  const dias = [];
  let nombre = "";

  for (let r = 2; r <= hoja.rowCount; r += 1) {
    const fila = hoja.getRow(r);
    const celdaFecha = fila.getCell(COL_FECHA);
    if (estaVacio(celdaFecha.value)) {
      break;
    }
    const fecha = leerFecha(celdaFecha);
    if (dias.length === 0) {
      nombre = textoDeCelda(fila.getCell(COL_NOMBRE).value);
    }
    /** @type {Array<{ ingreso: number|null, salida: number|null }>} */
    const marcaciones = [];
    for (const [colIngreso, colSalida] of PARES) {
      marcaciones.push({
        ingreso: leerHora(fila.getCell(colIngreso)),
        salida: leerHora(fila.getCell(colSalida)),
      });
    }
    dias.push({
      fecha,
      marcaciones,
      observacion: textoDeCelda(fila.getCell(COL_OBSERVACION).value),
    });
  }

  if (dias.length === 0) {
    throw new Error("El archivo no tiene filas de datos con fecha.");
  }

  const [anioTexto, mesTexto] = dias[0].fecha.split("-");
  return {
    nombre,
    periodo: { anio: Number(anioTexto), mes: Number(mesTexto) },
    dias,
  };
}
