/**
 * Cálculo de un día (secciones 7 y 8).
 * Módulo puro: sin DOM, archivos, Excel ni red.
 * Todo tiempo queda en minutos enteros.
 */

import { TIPOS_DIA, clasificarDia } from "./clasificacion.js";
import { reconocerNovedad } from "./novedades.js";
import { normalizarTexto } from "./texto.js";
import {
  duracionPar,
  intervaloDePar,
  parsearDuracion,
  parsearHora,
  solapamientoTotal,
} from "./tiempo.js";

const METODO_PARES = "PARES_VALIDOS";
const METODO_ESTIMADO = "MAX_MIN_ESTIMADO";

const BLOQUEO_NOVEDAD_DUPLICADA = "NOVEDAD_DUPLICADA_EN_FECHA";
const BLOQUEO_HORARIO = "DATOS_HORARIOS_IMPOSIBLES";

const AVISO_EXCEDENTE = "EXCEDENTE_SOBRE_TOPE";
const AVISO_SIN_AUTORIZACION = "SIN_AUTORIZACION_DIA";
const AVISO_BAJO_UMBRAL = "BAJO_UMBRAL";
const AVISO_DOMINGO = "TRABAJO_DOMINGO_SIN_AUTORIZACION";
const AVISO_SABADO = "TRABAJO_SABADO_NO_HABILITADO";
const AVISO_JUSTIFICADO = "MARCACIONES_EN_DIA_JUSTIFICADO";
const AVISO_INCOMPLETAS = "MARCACIONES_INCOMPLETAS";
const AVISO_NO_RECONOCIDA = "OBSERVACION_NO_RECONOCIDA";

const CLASE_COMPLETA = "COMPLETA";
const CLASE_ESPECIAL = "ESPECIAL_LAO_RECESO";
const FACTOR_SIMPLE = 1;
const FACTOR_DOBLE = 2;

/** Alcance del tramo posterior a horario_fin: cubre la salida pasada la medianoche. */
const EXTENSION_TRAMO = 1440 * 2;

const LAO_NORMALIZADA = normalizarTexto("LIC. ANUAL ORDINARIA");

/**
 * @param {unknown} valor
 * @returns {boolean}
 */
function esVacio(valor) {
  return valor === null || valor === undefined || valor === "";
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
 * Un tope vacío o ausente vale 0 (3.2 y 5.1).
 *
 * @param {unknown} valor
 * @param {string} nombre
 * @returns {number}
 */
function minutosDeTope(valor, nombre) {
  if (esVacio(valor)) {
    return 0;
  }
  const minutos = parsearDuracion(valor);
  if (minutos === null) {
    throw new RangeError(`${nombre} debe ser una duración H:MM o vacío.`);
  }
  return minutos;
}

/**
 * @param {unknown} valor
 * @param {string} nombre
 * @returns {number}
 */
function minutoDeHorario(valor, nombre) {
  const minuto = parsearHora(valor);
  if (minuto === null) {
    throw new RangeError(`${nombre} debe ser una hora entre 00:00 y 23:59.`);
  }
  return minuto;
}

/**
 * @param {object|null} novedad
 * @returns {boolean}
 */
function esLicenciaAnual(novedad) {
  return novedad !== null && normalizarTexto(novedad.descripcion) === LAO_NORMALIZADA;
}

/**
 * @param {object} cfg
 * @returns {boolean}
 */
function sabadoHabilitado(cfg) {
  return !esVacio(cfg.sabado_inicio) && !esVacio(cfg.sabado_fin);
}

/**
 * @param {object|null} detalle
 * @returns {number|null} Minutos del tope especial, o null si no existe.
 */
function topeEspecial(detalle) {
  if (detalle === null || detalle === undefined || esVacio(detalle.tope_especial)) {
    return null;
  }
  return minutosDeTope(detalle.tope_especial, "tope_especial");
}

/**
 * @param {string} codigo
 * @param {{ realizada: number, tope: number, excedente: number }} base
 * @param {{ novedad?: string|null, texto?: string|null }} [extra]
 * @returns {{ codigo: string, realizada: number, tope: number, excedente: number, novedad: string|null, texto: string|null }}
 */
function crearAviso(codigo, base, extra = {}) {
  return {
    codigo,
    realizada: base.realizada,
    tope: base.tope,
    excedente: base.excedente,
    novedad: extra.novedad ?? null,
    texto: extra.texto ?? null,
  };
}

/**
 * Tiempo trabajado de una fecha (sección 7).
 * Las horas se validan antes de usar duracionPar e intervaloDePar.
 * Un par con los dos extremos vacíos no cuenta: no es una marcación.
 *
 * @param {Array<{ ingreso?: unknown, salida?: unknown }>} marcaciones
 * @returns {{
 *   minutos: number,
 *   metodo: "PARES_VALIDOS"|"MAX_MIN_ESTIMADO"|null,
 *   intervalos: Array<{ inicio: number, fin: number }>,
 *   incompletas: boolean,
 *   bloqueante: "DATOS_HORARIOS_IMPOSIBLES"|null,
 * }}
 */
export function tiempoTrabajado(marcaciones) {
  exigirArreglo(marcaciones, "marcaciones");

  /** @type {Array<{ ingreso: unknown, salida: unknown, ingresoVacio: boolean, salidaVacia: boolean }>} */
  const pares = [];
  for (let i = 0; i < marcaciones.length; i += 1) {
    const par = marcaciones[i];
    exigirObjeto(par, `marcaciones[${i}]`);
    const ingresoVacio = esVacio(par.ingreso);
    const salidaVacia = esVacio(par.salida);
    if (ingresoVacio && salidaVacia) {
      continue;
    }
    pares.push({
      ingreso: par.ingreso,
      salida: par.salida,
      ingresoVacio,
      salidaVacia,
    });
  }

  /** @type {number[]} */
  const marcas = [];
  for (const par of pares) {
    if (!par.ingresoVacio) {
      const minuto = parsearHora(par.ingreso);
      if (minuto === null) {
        return sinTiempo(BLOQUEO_HORARIO);
      }
      marcas.push(minuto);
    }
    if (!par.salidaVacia) {
      const minuto = parsearHora(par.salida);
      if (minuto === null) {
        return sinTiempo(BLOQUEO_HORARIO);
      }
      marcas.push(minuto);
    }
  }

  const incompleto = pares.some((par) => par.ingresoVacio || par.salidaVacia);
  if (incompleto) {
    if (marcas.length <= 1) {
      const minuto = marcas.length === 1 ? marcas[0] : 0;
      return {
        minutos: 0,
        metodo: METODO_ESTIMADO,
        intervalos: [{ inicio: minuto, fin: minuto }],
        incompletas: true,
        bloqueante: null,
      };
    }
    const primero = marcas[0];
    const ultimo = marcas[marcas.length - 1];
    return {
      minutos: duracionPar(primero, ultimo),
      metodo: METODO_ESTIMADO,
      intervalos: [intervaloDePar(primero, ultimo)],
      incompletas: true,
      bloqueante: null,
    };
  }

  let minutos = 0;
  /** @type {Array<{ inicio: number, fin: number }>} */
  const intervalos = [];
  for (const par of pares) {
    const ingreso = parsearHora(par.ingreso);
    const salida = parsearHora(par.salida);
    minutos += duracionPar(ingreso, salida);
    intervalos.push(intervaloDePar(ingreso, salida));
  }
  return {
    minutos,
    metodo: METODO_PARES,
    intervalos,
    incompletas: false,
    bloqueante: null,
  };
}

/**
 * @param {"DATOS_HORARIOS_IMPOSIBLES"|null} bloqueante
 * @returns {{
 *   minutos: number,
 *   metodo: null,
 *   intervalos: [],
 *   incompletas: false,
 *   bloqueante: "DATOS_HORARIOS_IMPOSIBLES"|null,
 * }}
 */
function sinTiempo(bloqueante) {
  return {
    minutos: 0,
    metodo: null,
    intervalos: [],
    incompletas: false,
    bloqueante,
  };
}

/**
 * Configuración cuya vigencia contiene la fecha (5.1 y 8.1).
 * Los dos extremos cuentan. vigencia_hasta null no cierra el intervalo.
 * Si hay más de una, no elige: lanza Error.
 *
 * @param {object[]} configuraciones
 * @param {string} fecha Fecha "AAAA-MM-DD".
 * @returns {object|null}
 */
export function configuracionVigente(configuraciones, fecha) {
  exigirArreglo(configuraciones, "configuraciones");
  /** @type {object[]} */
  const cubren = [];
  for (let i = 0; i < configuraciones.length; i += 1) {
    const cfg = configuraciones[i];
    exigirObjeto(cfg, `configuraciones[${i}]`);
    if (typeof cfg.vigencia_desde !== "string") {
      throw new RangeError("vigencia_desde debe ser una fecha AAAA-MM-DD.");
    }
    const hasta = cfg.vigencia_hasta;
    const hastaAbierta = hasta === null || hasta === undefined;
    if (!hastaAbierta && typeof hasta !== "string") {
      throw new RangeError("vigencia_hasta debe ser una fecha AAAA-MM-DD o null.");
    }
    const desdeOk = cfg.vigencia_desde <= fecha;
    const hastaOk = hastaAbierta || fecha <= hasta;
    if (desdeOk && hastaOk) {
      cubren.push(cfg);
    }
  }
  if (cubren.length === 0) {
    return null;
  }
  if (cubren.length > 1) {
    throw new Error(`Hay ${cubren.length} configuraciones que cubren la fecha ${fecha}.`);
  }
  return cubren[0];
}

/**
 * @param {number} realizada
 * @param {number} noComputable
 * @param {number} tope
 * @param {number} factor
 * @returns {{ realizada: number, noComputable: number, tope: number, factor: number }}
 */
function regla(realizada, noComputable, tope, factor) {
  return { realizada, noComputable, tope, factor };
}

/**
 * @param {object} cfg
 * @param {Array<{ inicio: number, fin: number }>} intervalos
 * @returns {{ realizada: number, noComputable: number, tope: number, factor: number }}
 */
function reglaHabilSinNovedad(cfg, intervalos) {
  const inicio = minutoDeHorario(cfg.horario_inicio, "horario_inicio");
  const fin = minutoDeHorario(cfg.horario_fin, "horario_fin");
  const realizada = solapamientoTotal(intervalos, { inicio: fin, fin: fin + EXTENSION_TRAMO });
  const noComputable = solapamientoTotal(intervalos, { inicio: 0, fin: inicio });
  return regla(realizada, noComputable, minutosDeTope(cfg.tope_extra_habil, "tope_extra_habil"), FACTOR_SIMPLE);
}

/**
 * @param {object|null} novedad
 * @param {object} cfg
 * @param {number} trab
 * @param {Array<{ inicio: number, fin: number }>} intervalos
 * @returns {{ realizada: number, noComputable: number, tope: number, factor: number }}
 */
function reglaHabil(novedad, cfg, trab, intervalos) {
  if (novedad !== null && novedad.tipo === "JUSTIFICACION" && novedad.clase === CLASE_COMPLETA) {
    return regla(0, 0, 0, FACTOR_SIMPLE);
  }
  if (novedad !== null && novedad.tipo === "JUSTIFICACION" && novedad.clase === CLASE_ESPECIAL) {
    return regla(trab, 0, minutosDeTope(cfg.tope_lao_receso, "tope_lao_receso"), FACTOR_SIMPLE);
  }
  if (novedad !== null && novedad.tipo === "PERMISO") {
    const realizada = Math.max(0, trab - novedad.jornadaExigible);
    return regla(realizada, 0, minutosDeTope(cfg.tope_extra_habil, "tope_extra_habil"), FACTOR_SIMPLE);
  }
  return reglaHabilSinNovedad(cfg, intervalos);
}

/**
 * @param {object} cfg
 * @param {number} trab
 * @param {Array<{ inicio: number, fin: number }>} intervalos
 * @returns {{ realizada: number, noComputable: number, tope: number, factor: number }}
 */
function reglaSabado(cfg, trab, intervalos) {
  if (!sabadoHabilitado(cfg)) {
    return regla(trab, 0, 0, FACTOR_SIMPLE);
  }
  const inicio = minutoDeHorario(cfg.sabado_inicio, "sabado_inicio");
  const fin = minutoDeHorario(cfg.sabado_fin, "sabado_fin");
  const realizada = solapamientoTotal(intervalos, { inicio, fin });
  return regla(realizada, trab - realizada, minutosDeTope(cfg.sabado_tope, "sabado_tope"), FACTOR_SIMPLE);
}

/**
 * Reglas por tipo de día (8.2), con la excepción de la licencia anual primero.
 *
 * @param {{
 *   tipo: string,
 *   novedad: object|null,
 *   cfg: object,
 *   trab: number,
 *   intervalos: Array<{ inicio: number, fin: number }>,
 *   detalle: object|null,
 * }} entrada
 * @returns {{ realizada: number, noComputable: number, tope: number, factor: number }}
 */
export function reglasPorTipo(entrada) {
  const { tipo, novedad, cfg, trab, intervalos, detalle } = entrada;
  if (esLicenciaAnual(novedad) && tipo !== TIPOS_DIA.HABIL_NORMAL) {
    return regla(trab, 0, minutosDeTope(cfg.tope_lao_receso, "tope_lao_receso"), FACTOR_SIMPLE);
  }

  switch (tipo) {
    case TIPOS_DIA.HABIL_NORMAL:
      return reglaHabil(novedad, cfg, trab, intervalos);
    case TIPOS_DIA.SABADO:
      return reglaSabado(cfg, trab, intervalos);
    case TIPOS_DIA.DOMINGO:
      return regla(trab, 0, 0, FACTOR_SIMPLE);
    case TIPOS_DIA.FERIADO:
      return regla(trab, 0, minutosDeTope(cfg.tope_feriado, "tope_feriado"), FACTOR_DOBLE);
    case TIPOS_DIA.ASUETO: {
      const especial = topeEspecial(detalle);
      const tope = especial === null ? minutosDeTope(cfg.tope_asueto, "tope_asueto") : especial;
      return regla(trab, 0, tope, FACTOR_SIMPLE);
    }
    case TIPOS_DIA.PARO: {
      const especial = topeEspecial(detalle);
      const tope = especial === null ? minutosDeTope(cfg.tope_paro, "tope_paro") : especial;
      return regla(trab, 0, tope, FACTOR_SIMPLE);
    }
    default:
      throw new RangeError(`Tipo de día no previsto: ${tipo}.`);
  }
}

/**
 * Día fuera del período de horas extras: se muestra en cero, sin aviso ni bloqueo.
 *
 * @param {string} tipo
 * @returns {object}
 */
function diaFueraDeVigencia(tipo) {
  return {
    Hs_Trab: 0,
    Hs_Extra_Realizada: 0,
    Hs_No_Computable: 0,
    Tope_Aplicable: 0,
    Hs_Computada_Sistema: 0,
    Hs_Excedente: 0,
    Hs_Final: 0,
    factor: FACTOR_SIMPLE,
    tipo,
    novedad: null,
    metodo: null,
    avisos: [],
    bloqueante: null,
    editable: false,
  };
}

/**
 * @param {string} tipo
 * @param {object|null} novedad
 * @param {string} bloqueante
 * @returns {object}
 */
function diaBloqueado(tipo, novedad, bloqueante) {
  return {
    Hs_Trab: 0,
    Hs_Extra_Realizada: 0,
    Hs_No_Computable: 0,
    Tope_Aplicable: 0,
    Hs_Computada_Sistema: 0,
    Hs_Excedente: 0,
    Hs_Final: 0,
    factor: FACTOR_SIMPLE,
    tipo,
    novedad,
    metodo: null,
    avisos: [],
    bloqueante,
    editable: false,
  };
}

/**
 * Aviso de 10.2 cuando hay tiempo realizado que no se computó.
 * En domingo y en sábado no habilitado manda el aviso específico.
 *
 * @param {{
 *   tipo: string,
 *   realizada: number,
 *   computada: number,
 *   tope: number,
 *   umbral: number,
 *   sabadoHabilitado: boolean,
 *   laoNoHabil: boolean,
 * }} entrada
 * @returns {string|null}
 */
function codigoExceso(entrada) {
  const { tipo, realizada, computada, tope, umbral, laoNoHabil } = entrada;
  if (!(realizada > 0 && computada < realizada)) {
    return null;
  }
  const diaSinHabilitar = tipo === TIPOS_DIA.DOMINGO
    || (tipo === TIPOS_DIA.SABADO && !entrada.sabadoHabilitado);
  if (diaSinHabilitar && !laoNoHabil) {
    return tipo === TIPOS_DIA.DOMINGO ? AVISO_DOMINGO : AVISO_SABADO;
  }
  const bajoUmbral = realizada < umbral;
  if (laoNoHabil && tope === 0 && !bajoUmbral) {
    return AVISO_SIN_AUTORIZACION;
  }
  if (bajoUmbral) {
    return AVISO_BAJO_UMBRAL;
  }
  if (tope === 0) {
    return AVISO_SIN_AUTORIZACION;
  }
  return AVISO_EXCEDENTE;
}

/**
 * Calcula las magnitudes de un día (8.1).
 *
 * @param {{
 *   fecha: string,
 *   marcaciones: Array<{ ingreso?: unknown, salida?: unknown }>,
 *   observacion?: unknown,
 *   configuraciones: object[],
 *   feriados: object[],
 *   eventos: object[],
 *   catalogo: { justificaciones: object[], permisos: object[], umbral_minimo: unknown },
 * }} entrada
 * @returns {object}
 */
export function calcularDia(entrada) {
  const clasificacion = clasificarDia(entrada.fecha, entrada.feriados, entrada.eventos);
  const cfg = configuracionVigente(entrada.configuraciones, entrada.fecha);
  if (cfg === null) {
    return diaFueraDeVigencia(clasificacion.tipo);
  }

  const reconocimiento = reconocerNovedad(entrada.observacion, entrada.catalogo);
  if (reconocimiento.estado === "DUPLICADA") {
    return diaBloqueado(clasificacion.tipo, null, BLOQUEO_NOVEDAD_DUPLICADA);
  }

  const tiempo = tiempoTrabajado(entrada.marcaciones);
  if (tiempo.bloqueante !== null) {
    return diaBloqueado(clasificacion.tipo, reconocimiento.novedad, BLOQUEO_HORARIO);
  }

  const umbral = parsearDuracion(entrada.catalogo.umbral_minimo);
  if (umbral === null) {
    throw new RangeError("umbral_minimo debe ser una duración H:MM.");
  }

  const novedad = reconocimiento.novedad;
  const magnitudes = reglasPorTipo({
    tipo: clasificacion.tipo,
    novedad,
    cfg,
    trab: tiempo.minutos,
    intervalos: tiempo.intervalos,
    detalle: clasificacion.detalle,
  });
  const { realizada, noComputable, tope, factor } = magnitudes;
  const computada = realizada >= umbral ? Math.min(realizada, tope) : 0;
  const excedente = realizada - computada;
  const baseAviso = { realizada, tope, excedente };
  /** @type {Array<{ codigo: string, realizada: number, tope: number, excedente: number, novedad: string|null, texto: string|null }>} */
  const avisos = [];

  if (tiempo.incompletas) {
    avisos.push(crearAviso(AVISO_INCOMPLETAS, baseAviso));
  }
  if (reconocimiento.estado === "NO_RECONOCIDA") {
    avisos.push(crearAviso(AVISO_NO_RECONOCIDA, baseAviso, {
      texto: entrada.observacion == null ? "" : String(entrada.observacion),
    }));
  }
  if (
    clasificacion.tipo === TIPOS_DIA.HABIL_NORMAL
    && novedad !== null
    && novedad.tipo === "JUSTIFICACION"
    && novedad.clase === CLASE_COMPLETA
    && tiempo.minutos > 0
  ) {
    avisos.push(crearAviso(AVISO_JUSTIFICADO, baseAviso, { novedad: novedad.descripcion }));
  }

  const laoNoHabil = esLicenciaAnual(novedad) && clasificacion.tipo !== TIPOS_DIA.HABIL_NORMAL;
  const exceso = codigoExceso({
    tipo: clasificacion.tipo,
    realizada,
    computada,
    tope,
    umbral,
    sabadoHabilitado: sabadoHabilitado(cfg),
    laoNoHabil,
  });
  if (exceso !== null) {
    avisos.push(crearAviso(exceso, baseAviso));
  }

  return {
    Hs_Trab: tiempo.minutos,
    Hs_Extra_Realizada: realizada,
    Hs_No_Computable: noComputable,
    Tope_Aplicable: tope,
    Hs_Computada_Sistema: computada,
    Hs_Excedente: excedente,
    Hs_Final: computada,
    factor,
    tipo: clasificacion.tipo,
    novedad,
    metodo: tiempo.metodo,
    avisos,
    bloqueante: null,
    editable: realizada > 0,
  };
}
