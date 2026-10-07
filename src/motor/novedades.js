/**
 * Reconocimiento de novedades en una observación (sección 6.2).
 * No aplica el efecto sobre el cálculo ni genera avisos.
 */

import { parsearDuracion } from "./tiempo.js";
import { normalizarTexto } from "./texto.js";

const CLASE_COMPLETA = "COMPLETA";
const CLASE_ESPECIAL = "ESPECIAL_LAO_RECESO";

/**
 * @param {unknown} valor
 * @param {string} nombre
 * @returns {asserts valor is Record<string, unknown>}
 */
function exigirObjeto(valor, nombre) {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) {
    throw new RangeError(`${nombre} debe ser un objeto.`);
  }
}

/**
 * @param {unknown} valor
 * @param {string} nombre
 * @returns {asserts valor is unknown[]}
 */
function exigirArreglo(valor, nombre) {
  if (!Array.isArray(valor)) {
    throw new RangeError(`${nombre} debe ser un arreglo.`);
  }
}

/**
 * La descripción normalizada aparece como palabras completas, en ese orden.
 *
 * @param {string} observacionNormalizada
 * @param {string} descripcionNormalizada
 * @returns {boolean}
 */
function contieneSecuencia(observacionNormalizada, descripcionNormalizada) {
  return ` ${observacionNormalizada} `.includes(` ${descripcionNormalizada} `);
}

/**
 * @param {unknown} entrada
 * @param {number} indice
 * @returns {{ codigo: string, descripcion: string, clase: string, normalizada: string }}
 */
function validarJustificacion(entrada, indice) {
  exigirObjeto(entrada, `justificaciones[${indice}]`);
  const normalizada = normalizarTexto(entrada.descripcion);
  const codigo = typeof entrada.codigo === "string" ? entrada.codigo : String(indice);
  if (normalizada === "") {
    throw new RangeError(
      `La descripción de la justificación ${codigo} queda vacía al normalizarla.`,
    );
  }
  if (entrada.clase !== CLASE_COMPLETA && entrada.clase !== CLASE_ESPECIAL) {
    throw new RangeError(
      `La clase de ${codigo} debe ser COMPLETA o ESPECIAL_LAO_RECESO.`,
    );
  }
  return {
    codigo: entrada.codigo,
    descripcion: entrada.descripcion,
    clase: entrada.clase,
    normalizada,
  };
}

/**
 * @param {unknown} entrada
 * @param {number} indice
 * @returns {{ codigo: string, descripcion: string, jornadaExigible: number, normalizada: string }}
 */
function validarPermiso(entrada, indice) {
  exigirObjeto(entrada, `permisos[${indice}]`);
  const normalizada = normalizarTexto(entrada.descripcion);
  const codigo = typeof entrada.codigo === "string" ? entrada.codigo : String(indice);
  if (normalizada === "") {
    throw new RangeError(
      `La descripción del permiso ${codigo} queda vacía al normalizarla.`,
    );
  }
  const jornadaExigible = parsearDuracion(entrada.jornada_exigible);
  if (jornadaExigible === null) {
    throw new RangeError(
      `La jornada exigible de ${codigo} no es una duración H:MM válida.`,
    );
  }
  return {
    codigo: entrada.codigo,
    descripcion: entrada.descripcion,
    jornadaExigible,
    normalizada,
  };
}

/**
 * Reconoce como máximo una novedad en la observación.
 * No emite OBSERVACION_NO_RECONOCIDA ni NOVEDAD_DUPLICADA_EN_FECHA:
 * eso se lee después a partir de `estado`.
 *
 * @param {unknown} observacion
 * @param {{ justificaciones: object[], permisos: object[] }} catalogo
 * @returns {{
 *   estado: "SIN_NOVEDAD"|"NO_RECONOCIDA"|"RECONOCIDA"|"DUPLICADA",
 *   novedad: object|null,
 *   candidatas: string[],
 * }}
 * @throws {RangeError} Si el catálogo está mal formado.
 */
export function reconocerNovedad(observacion, catalogo) {
  exigirObjeto(catalogo, "catalogo");
  exigirArreglo(catalogo.justificaciones, "justificaciones");
  exigirArreglo(catalogo.permisos, "permisos");

  const justificaciones = catalogo.justificaciones.map((entrada, indice) =>
    validarJustificacion(entrada, indice),
  );
  const permisos = catalogo.permisos.map((entrada, indice) =>
    validarPermiso(entrada, indice),
  );

  const texto = normalizarTexto(observacion);
  if (texto === "") {
    return { estado: "SIN_NOVEDAD", novedad: null, candidatas: [] };
  }

  /** @type {object[]} */
  const coincidencias = [];
  for (const entrada of justificaciones) {
    if (contieneSecuencia(texto, entrada.normalizada)) {
      coincidencias.push({
        tipo: "JUSTIFICACION",
        codigo: entrada.codigo,
        descripcion: entrada.descripcion,
        clase: entrada.clase,
      });
    }
  }
  for (const entrada of permisos) {
    if (contieneSecuencia(texto, entrada.normalizada)) {
      coincidencias.push({
        tipo: "PERMISO",
        codigo: entrada.codigo,
        descripcion: entrada.descripcion,
        jornadaExigible: entrada.jornadaExigible,
      });
    }
  }

  if (coincidencias.length === 0) {
    return { estado: "NO_RECONOCIDA", novedad: null, candidatas: [] };
  }
  const candidatas = coincidencias.map((entrada) => entrada.codigo);
  if (coincidencias.length === 1) {
    return { estado: "RECONOCIDA", novedad: coincidencias[0], candidatas };
  }
  return { estado: "DUPLICADA", novedad: null, candidatas };
}
