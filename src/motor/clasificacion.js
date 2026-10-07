/**
 * Clasificación del día por fecha (sección 3.3).
 * No aplica el efecto de las novedades ni la excepción de la licencia anual.
 */

/** @typedef {"FERIADO"|"ASUETO"|"PARO"|"SABADO"|"DOMINGO"|"HABIL_NORMAL"} TipoDia */

/**
 * Tipos de día, en el orden de prioridad de la sección 3.3.
 * @type {Readonly<Record<TipoDia, TipoDia>>}
 */
export const TIPOS_DIA = Object.freeze({
  FERIADO: "FERIADO",
  ASUETO: "ASUETO",
  PARO: "PARO",
  SABADO: "SABADO",
  DOMINGO: "DOMINGO",
  HABIL_NORMAL: "HABIL_NORMAL",
});

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Día de la semana de una fecha de calendario.
 * 0 es domingo y 6 es sábado. Usa UTC para no depender de la zona horaria.
 *
 * @param {string} fecha Fecha "AAAA-MM-DD".
 * @returns {number} Entero de 0 a 6.
 * @throws {RangeError} Si el formato no es exacto o el día no existe.
 */
export function diaDeLaSemana(fecha) {
  if (typeof fecha !== "string" || !RE_FECHA.test(fecha)) {
    throw new RangeError(
      "La fecha debe tener el formato AAAA-MM-DD, con cuatro, dos y dos dígitos.",
    );
  }
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  const dia = Number(fecha.slice(8, 10));
  const instante = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    instante.getUTCFullYear() !== anio ||
    instante.getUTCMonth() !== mes - 1 ||
    instante.getUTCDate() !== dia
  ) {
    throw new RangeError(`La fecha ${fecha} no existe en el calendario.`);
  }
  return instante.getUTCDay();
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
 * Determina el tipo de día solo por fecha.
 * Ante dos feriados, o dos eventos del mismo tipo, para la fecha pedida,
 * lanza Error: no elige uno. Un asueto y un paro el mismo día no es error.
 *
 * @param {string} fecha Fecha "AAAA-MM-DD".
 * @param {Array<{ fecha: string, descripcion?: string }>} feriados
 * @param {Array<{ fecha: string, tipo: string, descripcion?: string, tope_especial?: string|null }>} eventos
 * @returns {{ tipo: TipoDia, detalle: object|null }}
 * @throws {RangeError} Si la fecha pedida es inválida, las listas no son arreglos o un evento no es ASUETO ni PARO.
 * @throws {Error} Si hay dos feriados o dos eventos del mismo tipo en la fecha pedida.
 */
export function clasificarDia(fecha, feriados, eventos) {
  const dia = diaDeLaSemana(fecha);
  exigirArreglo(feriados, "feriados");
  exigirArreglo(eventos, "eventos");

  /** @type {Array<{ fecha: string, descripcion?: string }>} */
  const feriadosDelDia = [];
  for (let i = 0; i < feriados.length; i += 1) {
    const feriado = feriados[i];
    exigirObjeto(feriado, `feriados[${i}]`);
    if (feriado.fecha === fecha) {
      feriadosDelDia.push(feriado);
    }
  }
  if (feriadosDelDia.length > 1) {
    throw new Error(`Hay ${feriadosDelDia.length} feriados con la fecha ${fecha}.`);
  }

  /** @type {object[]} */
  const asuetos = [];
  /** @type {object[]} */
  const paros = [];
  for (let i = 0; i < eventos.length; i += 1) {
    const evento = eventos[i];
    exigirObjeto(evento, `eventos[${i}]`);
    if (evento.tipo !== TIPOS_DIA.ASUETO && evento.tipo !== TIPOS_DIA.PARO) {
      throw new RangeError(
        `El tipo de evento debe ser ASUETO o PARO; se recibió ${JSON.stringify(evento.tipo)}.`,
      );
    }
    if (evento.fecha !== fecha) {
      continue;
    }
    if (evento.tipo === TIPOS_DIA.ASUETO) {
      asuetos.push(evento);
    } else {
      paros.push(evento);
    }
  }
  if (asuetos.length > 1) {
    throw new Error(`Hay ${asuetos.length} eventos ASUETO con la fecha ${fecha}.`);
  }
  if (paros.length > 1) {
    throw new Error(`Hay ${paros.length} eventos PARO con la fecha ${fecha}.`);
  }

  if (feriadosDelDia.length === 1) {
    return { tipo: TIPOS_DIA.FERIADO, detalle: feriadosDelDia[0] };
  }
  if (asuetos.length === 1) {
    return { tipo: TIPOS_DIA.ASUETO, detalle: asuetos[0] };
  }
  if (paros.length === 1) {
    return { tipo: TIPOS_DIA.PARO, detalle: paros[0] };
  }
  if (dia === 6) {
    return { tipo: TIPOS_DIA.SABADO, detalle: null };
  }
  if (dia === 0) {
    return { tipo: TIPOS_DIA.DOMINGO, detalle: null };
  }
  return { tipo: TIPOS_DIA.HABIL_NORMAL, detalle: null };
}
