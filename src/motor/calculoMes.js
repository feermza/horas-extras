/**
 * Cálculo mensual de un agente (secciones 9, 10 y totales C5 a C10).
 * Módulo puro: sin DOM, archivos, Excel ni red.
 */

import { calcularDia, configuracionVigente } from "./calculoDia.js";
import { liquidar } from "./liquidacion.js";
import { normalizarTexto } from "./texto.js";

const BLOQUEO_AGENTE = "AGENTE_SIN_CONFIGURACION";

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
 * @param {unknown} error
 * @returns {boolean}
 */
function esVigenciaSuperpuesta(error) {
  return error instanceof Error
    && !(error instanceof RangeError)
    && error.message.includes("configuraciones que cubren");
}

/**
 * Días del mes en orden, como AAAA-MM-DD. Usa UTC, igual que la clasificación.
 *
 * @param {number} anio
 * @param {number} mes Mes 1 a 12.
 * @returns {string[]}
 */
function fechasDelMes(anio, mes) {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new RangeError("El período debe tener año entero y mes entre 1 y 12.");
  }
  const cantidad = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const fechas = [];
  const mm = String(mes).padStart(2, "0");
  for (let dia = 1; dia <= cantidad; dia += 1) {
    fechas.push(`${anio}-${mm}-${String(dia).padStart(2, "0")}`);
  }
  return fechas;
}

/**
 * @param {object|null} agente
 * @param {{ anio: number, mes: number }} periodo
 * @param {{ fecha: string|null, codigo: string|null, detalle?: string }} bloqueante
 * @returns {object}
 */
function resultadoSinCalculo(agente, periodo, bloqueante) {
  return {
    agente,
    periodo,
    dias: null,
    totales: null,
    bloqueantes: [bloqueante],
    hayBloqueantes: true,
  };
}

/**
 * Compara el nombre del archivo (normalizado) con nombre_reloj de cada agente.
 * Una sola coincidencia. No mira el campo activo.
 *
 * @param {unknown} nombre
 * @param {object[]} agentes
 * @returns {object|null}
 */
export function identificarAgente(nombre, agentes) {
  exigirArreglo(agentes, "agentes");
  const buscado = normalizarTexto(nombre);
  /** @type {object[]} */
  const coincidencias = [];
  for (let i = 0; i < agentes.length; i += 1) {
    const agente = agentes[i];
    if (agente === null || typeof agente !== "object" || Array.isArray(agente)) {
      throw new RangeError(`agentes[${i}] debe ser un objeto.`);
    }
    if (normalizarTexto(agente.nombre_reloj) === buscado) {
      coincidencias.push(agente);
    }
  }
  if (coincidencias.length === 1) {
    return coincidencias[0];
  }
  return null;
}

/**
 * @param {unknown} finales
 * @param {string} fecha
 * @returns {number|undefined}
 */
function finalDe(finales, fecha) {
  if (finales == null) {
    return undefined;
  }
  if (finales instanceof Map) {
    return finales.has(fecha) ? finales.get(fecha) : undefined;
  }
  if (typeof finales !== "object" || Array.isArray(finales)) {
    throw new RangeError("finales debe ser un objeto o un Map de fecha a minutos.");
  }
  if (Object.prototype.hasOwnProperty.call(finales, fecha)) {
    return finales[fecha];
  }
  return undefined;
}

/**
 * @param {unknown} finales
 * @param {Set<string>} fechas
 */
function validarClavesDeFinales(finales, fechas) {
  if (finales == null) {
    return;
  }
  const claves = finales instanceof Map ? [...finales.keys()] : Object.keys(finales);
  for (const clave of claves) {
    if (!fechas.has(clave)) {
      throw new RangeError(`La fecha ${clave} no pertenece al período.`);
    }
  }
}

/**
 * Indexa las filas del archivo. No elige entre fechas repetidas ni
 * descarta en silencio una fecha fuera del período: lanza Error.
 *
 * @param {object[]} filas
 * @param {Set<string>} fechas
 * @returns {Map<string, object>}
 */
function indexarArchivo(filas, fechas) {
  exigirArreglo(filas, "dias");
  /** @type {Map<string, object>} */
  const porFecha = new Map();
  for (const fila of filas) {
    if (fila === null || typeof fila !== "object" || Array.isArray(fila)) {
      throw new RangeError("Cada día del archivo debe ser un objeto.");
    }
    if (typeof fila.fecha !== "string" || !fechas.has(fila.fecha)) {
      throw new Error(`La fecha ${fila.fecha} está fuera del período.`);
    }
    if (porFecha.has(fila.fecha)) {
      throw new Error(`La fecha ${fila.fecha} está repetida en el archivo.`);
    }
    porFecha.set(fila.fecha, fila);
  }
  return porFecha;
}

/**
 * @param {object} dia
 * @param {number|undefined} final
 * @returns {object}
 */
function aplicarFinal(dia, final) {
  if (final === undefined) {
    return { ...dia, modificado: dia.Hs_Final !== dia.Hs_Computada_Sistema };
  }
  if (!Number.isSafeInteger(final) || final < 0 || final > dia.Hs_Extra_Realizada) {
    throw new RangeError(
      "Hs_Final debe ser un entero entre 0 y Hs_Extra_Realizada.",
    );
  }
  return {
    ...dia,
    Hs_Final: final,
    modificado: final !== dia.Hs_Computada_Sistema,
  };
}

/**
 * Valor hora de la última configuración que cubre algún día del mes.
 *
 * @param {object[]} configuraciones
 * @param {string[]} fechas
 * @returns {unknown}
 */
function valorHoraQueCubreElMes(configuraciones, fechas) {
  for (let i = fechas.length - 1; i >= 0; i -= 1) {
    const cfg = configuracionVigente(configuraciones, fechas[i]);
    if (cfg !== null) {
      return cfg.valor_hora_base;
    }
  }
  return null;
}

/**
 * Calcula el mes de un agente ya identificado, o informa que no se identificó.
 *
 * @param {{
 *   nombre: unknown,
 *   agentes: object[],
 *   archivo: { periodo: { anio: number, mes: number }, dias: object[] },
 *   feriados: object[],
 *   asuetos: object[],
 *   catalogo: object,
 *   finales?: object|Map<string, number>|null,
 * }} entrada
 * @returns {object}
 */
export function calcularMes(entrada) {
  const periodo = entrada.archivo.periodo;
  const fechas = fechasDelMes(periodo.anio, periodo.mes);
  const agente = identificarAgente(entrada.nombre, entrada.agentes);
  if (agente === null) {
    return resultadoSinCalculo(null, periodo, { fecha: null, codigo: BLOQUEO_AGENTE });
  }

  const fechasSet = new Set(fechas);
  const porFecha = indexarArchivo(entrada.archivo.dias, fechasSet);
  validarClavesDeFinales(entrada.finales, fechasSet);

  /** @type {object[]} */
  const dias = [];
  /** @type {Array<{ fecha: string|null, codigo: string|null, detalle?: string }>} */
  const bloqueantes = [];
  for (const fecha of fechas) {
    const fila = porFecha.get(fecha);
    let calculado;
    try {
      calculado = calcularDia({
        fecha,
        marcaciones: fila?.marcaciones ?? [],
        observacion: fila?.observacion ?? "",
        configuraciones: agente.configuraciones,
        feriados: entrada.feriados,
        asuetos: entrada.asuetos,
        catalogo: entrada.catalogo,
      });
    } catch (error) {
      if (!esVigenciaSuperpuesta(error)) {
        throw error;
      }
      return resultadoSinCalculo(agente, periodo, {
        fecha,
        codigo: null,
        detalle: error.message,
      });
    }
    const dia = aplicarFinal({ fecha, ...calculado }, finalDe(entrada.finales, fecha));
    if (dia.bloqueante !== null) {
      bloqueantes.push({ fecha, codigo: dia.bloqueante });
    }
    dias.push(dia);
  }

  const valorHoraBase = valorHoraQueCubreElMes(agente.configuraciones, fechas);

  let realizadas = 0;
  let computadasSistema = 0;
  let finalesSimples = 0;
  let finalesDobles = 0;
  for (const dia of dias) {
    realizadas += dia.Hs_Extra_Realizada;
    computadasSistema += dia.Hs_Computada_Sistema;
    if (dia.factor === 2) {
      finalesDobles += dia.Hs_Final;
    } else {
      finalesSimples += dia.Hs_Final;
    }
  }

  const liquidacion = valorHoraBase === null
    ? null
    : liquidar({
      minutosSimples: finalesSimples,
      minutosDobles: finalesDobles,
      valorHoraBase,
    });

  return {
    agente,
    periodo,
    dias,
    totales: {
      realizadas,
      computadasSistema,
      finalesSimples,
      finalesDobles,
      finalesEquivalentes: liquidacion === null
        ? finalesSimples + 2 * finalesDobles
        : liquidacion.minutosEquivalentes,
      importe: liquidacion === null ? null : liquidacion.importe,
      valorHoraBase,
    },
    bloqueantes,
    hayBloqueantes: bloqueantes.length > 0,
  };
}
