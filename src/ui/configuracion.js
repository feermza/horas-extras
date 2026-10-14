/**
 * Lógica pura de la pantalla de configuración (sección 14.5). Sin DOM.
 */

import {
  validarAgentes,
  validarCalendario,
  validarCatalogos,
} from "../datos/esquemas.js";
import { diaDeLaSemana } from "../motor/clasificacion.js";
import { parsearDuracion } from "../motor/tiempo.js";
import { normalizarTexto } from "../motor/texto.js";

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_DURACION = /^\d{2,}:[0-5]\d$/;

const CAMPOS_TOPE = Object.freeze([
  "tope_extra_habil",
  "sabado_tope",
  "tope_feriado",
  "tope_asueto",
  "tope_lao_receso",
]);

/**
 * @param {unknown} valor
 * @returns {boolean}
 */
function estaVacio(valor) {
  return valor === null || valor === undefined || valor === "";
}

/**
 * @param {string} fecha
 * @returns {boolean}
 */
export function esFechaCalendarioValida(fecha) {
  if (typeof fecha !== "string" || !RE_FECHA.test(fecha)) {
    return false;
  }
  try {
    diaDeLaSemana(fecha);
    return true;
  } catch {
    return false;
  }
}

/**
 * Día anterior en calendario (UTC), formato AAAA-MM-DD.
 *
 * @param {string} fecha
 * @returns {string}
 */
export function diaAnterior(fecha) {
  if (!esFechaCalendarioValida(fecha)) {
    throw new RangeError(`Fecha inválida: ${fecha}`);
  }
  const anio = Number(fecha.slice(0, 4));
  const mes = Number(fecha.slice(5, 7));
  const dia = Number(fecha.slice(8, 10));
  const instante = new Date(Date.UTC(anio, mes - 1, dia));
  instante.setUTCDate(instante.getUTCDate() - 1);
  const y = instante.getUTCFullYear();
  const m = String(instante.getUTCMonth() + 1).padStart(2, "0");
  const d = String(instante.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * @param {Array<{ id?: unknown }>} agentes
 * @returns {string}
 */
export function siguienteIdAgente(agentes) {
  let max = 0;
  for (const agente of agentes ?? []) {
    if (agente === null || typeof agente !== "object") {
      continue;
    }
    const match = /^A(\d+)$/i.exec(String(agente.id ?? ""));
    if (match !== null) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `A${String(max + 1).padStart(3, "0")}`;
}

/**
 * Primera configuración al dar de alta un agente: tope_lao_receso 08:00; demás topes vacíos.
 *
 * @returns {object}
 */
export function configuracionInicialAlta() {
  return {
    vigencia_desde: "",
    vigencia_hasta: null,
    horario_inicio: "",
    horario_fin: "",
    duracion_jornada: "",
    tope_extra_habil: "",
    sabado_inicio: null,
    sabado_fin: null,
    sabado_tope: "",
    tope_feriado: "",
    tope_asueto: "",
    tope_lao_receso: "08:00",
    valor_hora_base: "",
  };
}

/**
 * @param {Array<object>} agentes
 * @returns {object}
 */
export function crearAgenteNuevo(agentes) {
  return {
    id: siguienteIdAgente(agentes),
    legajo: "",
    dni: "",
    nombre: "",
    nombre_reloj: "",
    activo: true,
    configuraciones: [configuracionInicialAlta()],
  };
}

/**
 * @param {object[]} configuraciones
 * @returns {object[]}
 */
function ordenarConfigsPorVigencia(configuraciones) {
  return [...(configuraciones ?? [])].sort((a, b) => {
    const da = typeof a?.vigencia_desde === "string" ? a.vigencia_desde : "";
    const db = typeof b?.vigencia_desde === "string" ? b.vigencia_desde : "";
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

/**
 * Copia la última configuración, fija vigencia_desde y, si la anterior
 * tiene vigencia_hasta nula, la cierra el día anterior.
 *
 * @param {object[]} configuraciones
 * @param {string} vigenciaDesde
 * @returns {{ ok: true, configuraciones: object[] } | { ok: false, errores: string[] }}
 */
export function agregarNuevaConfiguracion(configuraciones, vigenciaDesde) {
  if (!esFechaCalendarioValida(vigenciaDesde)) {
    return { ok: false, errores: ["vigencia_desde debe ser una fecha AAAA-MM-DD válida."] };
  }
  const ordenadas = ordenarConfigsPorVigencia(configuraciones);
  if (ordenadas.length === 0) {
    return {
      ok: true,
      configuraciones: [{ ...configuracionInicialAlta(), vigencia_desde: vigenciaDesde }],
    };
  }
  const ultima = ordenadas[ordenadas.length - 1];
  const previas = ordenadas.slice(0, -1).map((c) => ({ ...c }));
  const hastaAnterior = ultima.vigencia_hasta;
  const ultimaCerrada = {
    ...ultima,
    vigencia_hasta: estaVacio(hastaAnterior) ? diaAnterior(vigenciaDesde) : hastaAnterior,
  };
  const copia = {
    ...ultima,
    vigencia_desde: vigenciaDesde,
    vigencia_hasta: null,
  };
  return { ok: true, configuraciones: [...previas, ultimaCerrada, copia] };
}

/**
 * @param {Array<{ fecha?: unknown }>} lista
 * @returns {object[]}
 */
export function ordenarPorFecha(lista) {
  return [...(lista ?? [])].sort((a, b) => {
    const fa = typeof a?.fecha === "string" ? a.fecha : "";
    const fb = typeof b?.fecha === "string" ? b.fecha : "";
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });
}

/**
 * @param {unknown} valor
 * @returns {number|null}
 */
function numeroPositivo(valor) {
  if (typeof valor === "number" && Number.isFinite(valor) && valor > 0) {
    return valor;
  }
  if (typeof valor === "string" && valor.trim() !== "") {
    const n = Number(valor.replace(",", "."));
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return null;
}

/**
 * @param {unknown} valor
 * @returns {boolean}
 */
function legajoPresente(valor) {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return true;
  }
  if (typeof valor === "string" && valor.trim() !== "") {
    return true;
  }
  return false;
}

/**
 * Validación de edición de agentes (5.1 + reglas de pantalla).
 *
 * @param {{ agentes?: unknown }} agentesDoc
 * @returns {{ ok: true } | { ok: false, errores: string[] }}
 */
export function validarEdicionAgentes(agentesDoc) {
  /** @type {string[]} */
  const errores = [];
  if (agentesDoc === null || typeof agentesDoc !== "object" || Array.isArray(agentesDoc)) {
    return { ok: false, errores: ["Se esperaba un documento de agentes."] };
  }
  if (!Array.isArray(agentesDoc.agentes)) {
    return { ok: false, errores: ["Falta la lista de agentes."] };
  }

  /** @type {Map<string, string>} */
  const relojes = new Map();
  for (let i = 0; i < agentesDoc.agentes.length; i += 1) {
    const agente = agentesDoc.agentes[i];
    const ctx = typeof agente?.nombre === "string" && agente.nombre.trim() !== ""
      ? `Agente "${agente.nombre}"`
      : `Agente ${i + 1}`;
    if (agente === null || typeof agente !== "object" || Array.isArray(agente)) {
      errores.push(`${ctx}: datos inválidos.`);
      continue;
    }
    if (!legajoPresente(agente.legajo)) {
      errores.push(`${ctx}: el legajo es obligatorio.`);
    }
    if (typeof agente.dni !== "string" || agente.dni.trim() === "") {
      errores.push(`${ctx}: el DNI es obligatorio.`);
    }
    if (typeof agente.nombre !== "string" || agente.nombre.trim() === "") {
      errores.push(`${ctx}: el nombre es obligatorio.`);
    }
    if (typeof agente.nombre_reloj !== "string" || agente.nombre_reloj.trim() === "") {
      errores.push(`${ctx}: el nombre del reloj es obligatorio.`);
    } else {
      const clave = normalizarTexto(agente.nombre_reloj);
      const previo = relojes.get(clave);
      if (previo !== undefined) {
        errores.push(
          `${previo} y ${ctx}: el mismo nombre_reloj normalizado (${agente.nombre_reloj}).`,
        );
      } else {
        relojes.set(clave, ctx);
      }
    }
    if (!Array.isArray(agente.configuraciones) || agente.configuraciones.length === 0) {
      errores.push(`${ctx}: hace falta al menos una configuración.`);
      continue;
    }
    for (let j = 0; j < agente.configuraciones.length; j += 1) {
      const cfg = agente.configuraciones[j];
      const cctx = `${ctx}, configuración ${j + 1}`;
      if (cfg === null || typeof cfg !== "object" || Array.isArray(cfg)) {
        errores.push(`${cctx}: datos inválidos.`);
        continue;
      }
      if (!esFechaCalendarioValida(cfg.vigencia_desde)) {
        errores.push(`${cctx}: vigencia_desde debe ser AAAA-MM-DD válida.`);
      }
      if (!(
        cfg.vigencia_hasta === null
        || cfg.vigencia_hasta === undefined
        || cfg.vigencia_hasta === ""
        || esFechaCalendarioValida(cfg.vigencia_hasta)
      )) {
        errores.push(`${cctx}: vigencia_hasta debe ser AAAA-MM-DD o vacía.`);
      } else if (
        !estaVacio(cfg.vigencia_hasta)
        && esFechaCalendarioValida(cfg.vigencia_desde)
        && cfg.vigencia_hasta < cfg.vigencia_desde
      ) {
        errores.push(`${cctx}: vigencia_hasta no puede ser anterior a vigencia_desde.`);
      }
      for (const campo of ["horario_inicio", "horario_fin"]) {
        if (typeof cfg[campo] !== "string" || !RE_HORA.test(cfg[campo])) {
          errores.push(`${cctx}, ${campo}: debe ser HH:MM.`);
        }
      }
      if (typeof cfg.duracion_jornada !== "string" || !RE_DURACION.test(cfg.duracion_jornada)
        || parsearDuracion(cfg.duracion_jornada) === null) {
        errores.push(`${cctx}, duracion_jornada: debe ser HH:MM.`);
      }
      for (const campo of CAMPOS_TOPE) {
        if (estaVacio(cfg[campo])) {
          errores.push(`${cctx}, ${campo}: el tope es obligatorio (0:00 es válido).`);
        } else if (typeof cfg[campo] !== "string" || !RE_DURACION.test(cfg[campo])
          || parsearDuracion(cfg[campo]) === null) {
          errores.push(`${cctx}, ${campo}: debe ser HH:MM.`);
        }
      }
      const sabIniVacio = estaVacio(cfg.sabado_inicio);
      const sabFinVacio = estaVacio(cfg.sabado_fin);
      if (sabIniVacio !== sabFinVacio) {
        errores.push(`${cctx}: sabado_inicio y sabado_fin deben cargarse ambos o ninguno.`);
      } else if (!sabIniVacio) {
        if (typeof cfg.sabado_inicio !== "string" || !RE_HORA.test(cfg.sabado_inicio)) {
          errores.push(`${cctx}, sabado_inicio: debe ser HH:MM.`);
        }
        if (typeof cfg.sabado_fin !== "string" || !RE_HORA.test(cfg.sabado_fin)) {
          errores.push(`${cctx}, sabado_fin: debe ser HH:MM.`);
        }
      }
      if (numeroPositivo(cfg.valor_hora_base) === null) {
        errores.push(`${cctx}: valor_hora_base debe ser mayor que cero.`);
      }
    }
  }

  if (errores.length > 0) {
    return { ok: false, errores };
  }

  const normalizado = normalizarAgentesParaGuardar(agentesDoc);
  const esquema = validarAgentes(normalizado);
  if (!esquema.ok) {
    return esquema;
  }
  return { ok: true };
}

/**
 * Prepara el documento de agentes para persistir (tipos y nulls de sábado).
 *
 * @param {{ agentes?: object[] }} agentesDoc
 * @returns {{ agentes: object[] }}
 */
export function normalizarAgentesParaGuardar(agentesDoc) {
  const agentes = (agentesDoc.agentes ?? []).map((agente) => {
    const configs = ordenarConfigsPorVigencia(agente.configuraciones ?? []).map((cfg) => {
      const sabIni = estaVacio(cfg.sabado_inicio) ? null : cfg.sabado_inicio;
      const sabFin = estaVacio(cfg.sabado_fin) ? null : cfg.sabado_fin;
      const hasta = estaVacio(cfg.vigencia_hasta) ? null : cfg.vigencia_hasta;
      const valor = numeroPositivo(cfg.valor_hora_base);
      return {
        ...cfg,
        vigencia_hasta: hasta,
        sabado_inicio: sabIni,
        sabado_fin: sabFin,
        valor_hora_base: valor === null ? cfg.valor_hora_base : valor,
      };
    });
    let legajo = agente.legajo;
    if (typeof legajo === "string" && /^\d+$/.test(legajo.trim())) {
      legajo = Number(legajo.trim());
    }
    return {
      ...agente,
      legajo,
      dni: String(agente.dni ?? "").trim(),
      nombre: String(agente.nombre ?? "").trim(),
      nombre_reloj: String(agente.nombre_reloj ?? "").trim(),
      activo: Boolean(agente.activo),
      configuraciones: configs,
    };
  });
  return { agentes };
}

/**
 * @param {string} nombreLista
 * @param {unknown[]} lista
 * @param {string[]} errores
 */
function validarListaCalendario(nombreLista, lista, errores) {
  /** @type {Set<string>} */
  const vistas = new Set();
  for (let i = 0; i < lista.length; i += 1) {
    const fila = lista[i];
    const ctx = `${nombreLista}[${i + 1}]`;
    if (fila === null || typeof fila !== "object" || Array.isArray(fila)) {
      errores.push(`${ctx}: debe ser un objeto.`);
      continue;
    }
    if (!esFechaCalendarioValida(fila.fecha)) {
      errores.push(`${ctx}: la fecha debe ser AAAA-MM-DD y existir en el calendario.`);
    } else if (vistas.has(fila.fecha)) {
      errores.push(`${ctx}: la fecha ${fila.fecha} está repetida en ${nombreLista}.`);
    } else {
      vistas.add(fila.fecha);
    }
    if (typeof fila.descripcion !== "string" || fila.descripcion.trim() === "") {
      errores.push(`${ctx}: la descripción no puede estar vacía.`);
    }
  }
}

/**
 * @param {{ feriados?: unknown, asuetos?: unknown }} calendarioDoc
 * @returns {{ ok: true } | { ok: false, errores: string[] }}
 */
export function validarEdicionCalendario(calendarioDoc) {
  /** @type {string[]} */
  const errores = [];
  if (calendarioDoc === null || typeof calendarioDoc !== "object" || Array.isArray(calendarioDoc)) {
    return { ok: false, errores: ["Se esperaba un documento de calendario."] };
  }
  if (!Array.isArray(calendarioDoc.feriados)) {
    return { ok: false, errores: ["Falta la lista de feriados."] };
  }
  const asuetos = Array.isArray(calendarioDoc.asuetos) ? calendarioDoc.asuetos : [];
  validarListaCalendario("Feriados", calendarioDoc.feriados, errores);
  validarListaCalendario("Asuetos", asuetos, errores);
  if (errores.length > 0) {
    return { ok: false, errores };
  }
  const normalizado = normalizarCalendarioParaGuardar(calendarioDoc);
  const esquema = validarCalendario(normalizado);
  if (!esquema.ok) {
    return esquema;
  }
  return { ok: true };
}

/**
 * @param {{ feriados?: object[], asuetos?: object[] }} calendarioDoc
 * @returns {{ feriados: object[], asuetos: object[] }}
 */
export function normalizarCalendarioParaGuardar(calendarioDoc) {
  const mapear = (lista) => ordenarPorFecha(lista ?? []).map((fila) => ({
    fecha: fila.fecha,
    descripcion: String(fila.descripcion ?? "").trim(),
  }));
  return {
    feriados: mapear(calendarioDoc.feriados),
    asuetos: mapear(calendarioDoc.asuetos ?? []),
  };
}

/**
 * @param {object} catalogosDoc
 * @returns {{ ok: true } | { ok: false, errores: string[] }}
 */
export function validarEdicionCatalogo(catalogosDoc) {
  /** @type {string[]} */
  const errores = [];
  if (catalogosDoc === null || typeof catalogosDoc !== "object" || Array.isArray(catalogosDoc)) {
    return { ok: false, errores: ["Se esperaba un documento de catálogo."] };
  }
  if (typeof catalogosDoc.nombre_libro !== "string" || catalogosDoc.nombre_libro.trim() === "") {
    errores.push("El nombre del libro es obligatorio.");
  }
  if (typeof catalogosDoc.umbral_minimo !== "string" || !RE_HORA.test(catalogosDoc.umbral_minimo)
    || parsearDuracion(catalogosDoc.umbral_minimo) === null) {
    errores.push("umbral_minimo debe ser HH:MM.");
  }
  const horasMax = catalogosDoc.horas_maximas;
  if (!(
    estaVacio(horasMax)
    || (typeof horasMax === "string" && RE_DURACION.test(horasMax) && parsearDuracion(horasMax) !== null)
  )) {
    errores.push("horas_maximas debe estar vacío o ser HH:MM (puede superar 24 h).");
  }
  if (errores.length > 0) {
    return { ok: false, errores };
  }
  const normalizado = normalizarCatalogoParaGuardar(catalogosDoc);
  const esquema = validarCatalogos(normalizado);
  if (!esquema.ok) {
    return esquema;
  }
  return { ok: true };
}

/**
 * Conserva justificaciones y permisos; normaliza los tres campos editables.
 *
 * @param {object} catalogosDoc
 * @returns {object}
 */
export function normalizarCatalogoParaGuardar(catalogosDoc) {
  const horasMax = estaVacio(catalogosDoc.horas_maximas)
    ? null
    : catalogosDoc.horas_maximas;
  return {
    ...catalogosDoc,
    justificaciones: Array.isArray(catalogosDoc.justificaciones)
      ? catalogosDoc.justificaciones
      : [],
    permisos: Array.isArray(catalogosDoc.permisos) ? catalogosDoc.permisos : [],
    umbral_minimo: catalogosDoc.umbral_minimo,
    nombre_libro: String(catalogosDoc.nombre_libro ?? "").trim(),
    horas_maximas: horasMax,
  };
}

/**
 * @template T
 * @param {T} valor
 * @returns {T}
 */
export function clonarDatos(valor) {
  return JSON.parse(JSON.stringify(valor));
}

/**
 * Copia agentes para edición en pantalla (null → cadena vacía en campos de formulario).
 *
 * @param {{ agentes?: object[] }} agentesDoc
 * @returns {{ agentes: object[] }}
 */
export function prepararAgentesParaEdicion(agentesDoc) {
  const doc = clonarDatos(agentesDoc);
  doc.agentes = (doc.agentes ?? []).map((agente) => ({
    ...agente,
    legajo: agente.legajo === null || agente.legajo === undefined ? "" : String(agente.legajo),
    configuraciones: ordenarConfigsPorVigencia(agente.configuraciones ?? []).map((cfg) => ({
      ...cfg,
      vigencia_hasta: estaVacio(cfg.vigencia_hasta) ? "" : cfg.vigencia_hasta,
      sabado_inicio: estaVacio(cfg.sabado_inicio) ? "" : cfg.sabado_inicio,
      sabado_fin: estaVacio(cfg.sabado_fin) ? "" : cfg.sabado_fin,
      valor_hora_base: cfg.valor_hora_base === null || cfg.valor_hora_base === undefined
        ? ""
        : String(cfg.valor_hora_base),
    })),
  }));
  return doc;
}

/**
 * @param {{ feriados?: object[], asuetos?: object[] }} calendarioDoc
 * @returns {{ feriados: object[], asuetos: object[] }}
 */
export function prepararCalendarioParaEdicion(calendarioDoc) {
  return {
    feriados: ordenarPorFecha(clonarDatos(calendarioDoc?.feriados ?? [])),
    asuetos: ordenarPorFecha(clonarDatos(calendarioDoc?.asuetos ?? [])),
  };
}

/**
 * @param {object} catalogosDoc
 * @returns {object}
 */
export function prepararCatalogoParaEdicion(catalogosDoc) {
  const doc = clonarDatos(catalogosDoc);
  if (doc.horas_maximas === null || doc.horas_maximas === undefined) {
    doc.horas_maximas = "";
  }
  return doc;
}
