/**
 * Validación de los JSON de la sección 5 al leer y al guardar.
 * El motor asume datos válidos; esta capa es el filtro.
 */

import { parsearDuracion, parsearHora } from "../motor/tiempo.js";
import { normalizarTexto } from "../motor/texto.js";

/** Nombres fijos de la carpeta de trabajo (sección 2). */
export const ARCHIVOS = Object.freeze({
  agentes: "agentes.json",
  calendario: "calendario.json",
  catalogos: "catalogos.json",
});

/** Nombres legados que se ignoran si aparecen en la carpeta. */
export const ARCHIVO_GRUPOS_LEGADO = "grupos.json";
export const ARCHIVO_EVENTOS_LEGADO = "eventos.json";

const CAMPOS_HORA_CONFIG = ["horario_inicio", "horario_fin"];
const CAMPOS_DURACION_CONFIG = [
  "duracion_jornada",
  "tope_extra_habil",
  "sabado_tope",
  "tope_feriado",
  "tope_asueto",
  "tope_lao_receso",
];

/**
 * @param {unknown} valor
 * @returns {boolean}
 */
function estaVacio(valor) {
  return valor === null || valor === undefined || valor === "";
}

/** Hora del día en formato estricto HH:MM (dos dígitos de hora, 00–23). */
const RE_HORA_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Duración en formato HH:MM con al menos dos dígitos de hora (p. ej. 04:00, 560:00). */
const RE_DURACION_HHMM = /^\d{2,}:[0-5]\d$/;

/**
 * @param {unknown} texto
 * @returns {boolean}
 */
function esHoraValida(texto) {
  return typeof texto === "string" && RE_HORA_HHMM.test(texto) && parsearHora(texto) !== null;
}

/**
 * @param {unknown} texto
 * @returns {boolean}
 */
function esDuracionValida(texto) {
  return typeof texto === "string" && RE_DURACION_HHMM.test(texto) && parsearDuracion(texto) !== null;
}

/**
 * @param {string|null|undefined} desde
 * @param {string|null|undefined} hasta
 * @param {string} fecha
 * @returns {boolean}
 */
function vigenciaContiene(desde, hasta, fecha) {
  if (typeof desde !== "string" || desde > fecha) {
    return false;
  }
  if (hasta === null || hasta === undefined) {
    return true;
  }
  return typeof hasta === "string" && fecha <= hasta;
}

/**
 * Dos vigencias se superponen si existe algún día cubierto por ambas.
 *
 * @param {{ vigencia_desde: unknown, vigencia_hasta: unknown }} a
 * @param {{ vigencia_desde: unknown, vigencia_hasta: unknown }} b
 * @returns {boolean}
 */
function vigenciasSuperpuestas(a, b) {
  const desdeA = a.vigencia_desde;
  const desdeB = b.vigencia_desde;
  if (typeof desdeA !== "string" || typeof desdeB !== "string") {
    return false;
  }
  const inicio = desdeA < desdeB ? desdeB : desdeA;
  return vigenciaContiene(desdeA, a.vigencia_hasta, inicio)
    && vigenciaContiene(desdeB, b.vigencia_hasta, inicio);
}

/**
 * @param {object} cfg
 * @param {string} contexto
 * @param {string[]} errores
 */
function validarConfiguracion(cfg, contexto, errores) {
  if (cfg === null || typeof cfg !== "object" || Array.isArray(cfg)) {
    errores.push(`${contexto}: la configuración debe ser un objeto.`);
    return;
  }
  if (typeof cfg.vigencia_desde !== "string" || cfg.vigencia_desde === "") {
    errores.push(`${contexto}: vigencia_desde es obligatoria.`);
  }
  if (!(cfg.vigencia_hasta === null || cfg.vigencia_hasta === undefined
    || typeof cfg.vigencia_hasta === "string")) {
    errores.push(`${contexto}: vigencia_hasta debe ser texto o null.`);
  }
  for (const campo of CAMPOS_HORA_CONFIG) {
    if (!esHoraValida(cfg[campo])) {
      errores.push(`${contexto}, campo ${campo}: debe ser HH:MM.`);
    }
  }
  for (const campo of CAMPOS_DURACION_CONFIG) {
    if (!esDuracionValida(cfg[campo])) {
      errores.push(`${contexto}, campo ${campo}: debe ser HH:MM.`);
    }
  }
  const sabInicioVacio = estaVacio(cfg.sabado_inicio);
  const sabFinVacio = estaVacio(cfg.sabado_fin);
  if (sabInicioVacio !== sabFinVacio) {
    errores.push(
      `${contexto}, campos sabado_inicio/sabado_fin: hay que cargar ambos o ninguno.`,
    );
  } else if (!sabInicioVacio) {
    if (!esHoraValida(cfg.sabado_inicio)) {
      errores.push(`${contexto}, campo sabado_inicio: debe ser HH:MM.`);
    }
    if (!esHoraValida(cfg.sabado_fin)) {
      errores.push(`${contexto}, campo sabado_fin: debe ser HH:MM.`);
    }
  }
}

/**
 * @param {unknown} datos
 * @returns {{ ok: true } | { ok: false, errores: string[] }}
 */
export function validarAgentes(datos) {
  /** @type {string[]} */
  const errores = [];
  if (datos === null || typeof datos !== "object" || Array.isArray(datos)) {
    return { ok: false, errores: ["agentes.json: se esperaba un objeto con la clave agentes."] };
  }
  if (!Array.isArray(datos.agentes)) {
    return { ok: false, errores: ["agentes.json: falta el arreglo agentes."] };
  }
  /** @type {Map<string, { indice: number, etiqueta: string }>} */
  const relojesVistos = new Map();
  for (let i = 0; i < datos.agentes.length; i += 1) {
    const agente = datos.agentes[i];
    const ctx = `agentes[${i}]`;
    if (agente === null || typeof agente !== "object" || Array.isArray(agente)) {
      errores.push(`${ctx}: debe ser un objeto.`);
      continue;
    }
    const etiqueta = typeof agente.nombre === "string" && agente.nombre !== ""
      ? `${ctx} (agente "${agente.nombre}")`
      : ctx;
    if (typeof agente.nombre_reloj !== "string" || agente.nombre_reloj.trim() === "") {
      errores.push(`${etiqueta}, campo nombre_reloj: es obligatorio y no puede estar vacío.`);
    } else {
      const claveReloj = normalizarTexto(agente.nombre_reloj);
      const previo = relojesVistos.get(claveReloj);
      if (previo !== undefined) {
        errores.push(
          `${previo.etiqueta} y ${etiqueta}: el mismo nombre_reloj normalizado (${agente.nombre_reloj}).`,
        );
      } else {
        relojesVistos.set(claveReloj, { indice: i, etiqueta });
      }
    }
    if (!Array.isArray(agente.configuraciones)) {
      errores.push(`${etiqueta}: falta el arreglo configuraciones.`);
      continue;
    }
    for (let j = 0; j < agente.configuraciones.length; j += 1) {
      validarConfiguracion(
        agente.configuraciones[j],
        `${etiqueta}, configuración ${j}`,
        errores,
      );
    }
    for (let j = 0; j < agente.configuraciones.length; j += 1) {
      for (let k = j + 1; k < agente.configuraciones.length; k += 1) {
        if (vigenciasSuperpuestas(agente.configuraciones[j], agente.configuraciones[k])) {
          errores.push(
            `${etiqueta}: las configuraciones ${j} y ${k} tienen vigencias superpuestas.`,
          );
        }
      }
    }
  }
  return errores.length === 0 ? { ok: true } : { ok: false, errores };
}

/**
 * @param {unknown} datos
 * @returns {{ ok: true } | { ok: false, errores: string[] }}
 */
export function validarCalendario(datos) {
  /** @type {string[]} */
  const errores = [];
  if (datos === null || typeof datos !== "object" || Array.isArray(datos)) {
    return { ok: false, errores: ["calendario.json: se esperaba un objeto con la clave feriados."] };
  }
  if (!Array.isArray(datos.feriados)) {
    return { ok: false, errores: ["calendario.json: falta el arreglo feriados."] };
  }
  for (let i = 0; i < datos.feriados.length; i += 1) {
    const feriado = datos.feriados[i];
    if (feriado === null || typeof feriado !== "object" || Array.isArray(feriado)) {
      errores.push(`feriados[${i}]: debe ser un objeto.`);
      continue;
    }
    if (typeof feriado.fecha !== "string" || feriado.fecha === "") {
      errores.push(`feriados[${i}]: fecha es obligatoria.`);
    }
  }
  if (datos.asuetos !== undefined && datos.asuetos !== null && !Array.isArray(datos.asuetos)) {
    errores.push("calendario.json: asuetos debe ser un arreglo si está presente.");
  }
  if (Array.isArray(datos.asuetos)) {
    for (let i = 0; i < datos.asuetos.length; i += 1) {
      const asueto = datos.asuetos[i];
      if (asueto === null || typeof asueto !== "object" || Array.isArray(asueto)) {
        errores.push(`asuetos[${i}]: debe ser un objeto.`);
        continue;
      }
      if (typeof asueto.fecha !== "string" || asueto.fecha === "") {
        errores.push(`asuetos[${i}]: fecha es obligatoria.`);
      }
    }
  }
  return errores.length === 0 ? { ok: true } : { ok: false, errores };
}

/**
 * @param {unknown} datos
 * @returns {{ ok: true } | { ok: false, errores: string[] }}
 */
export function validarCatalogos(datos) {
  /** @type {string[]} */
  const errores = [];
  if (datos === null || typeof datos !== "object" || Array.isArray(datos)) {
    return {
      ok: false,
      errores: ["catalogos.json: se esperaba un objeto con justificaciones, permisos y umbral_minimo."],
    };
  }
  if (!Array.isArray(datos.justificaciones)) {
    errores.push("catalogos.json: falta el arreglo justificaciones.");
  }
  if (!Array.isArray(datos.permisos)) {
    errores.push("catalogos.json: falta el arreglo permisos.");
  }
  if (!esDuracionValida(datos.umbral_minimo)) {
    errores.push("catalogos.json: umbral_minimo debe ser HH:MM.");
  }
  if (typeof datos.nombre_libro !== "string" || datos.nombre_libro.trim() === "") {
    errores.push("catalogos.json, campo nombre_libro: es obligatorio y no puede estar vacío.");
  }
  if (!(
    datos.horas_maximas === null
    || datos.horas_maximas === undefined
    || esDuracionValida(datos.horas_maximas)
  )) {
    errores.push("catalogos.json, campo horas_maximas: debe ser HH:MM, null o ausente.");
  }
  if (Array.isArray(datos.permisos)) {
    for (let i = 0; i < datos.permisos.length; i += 1) {
      const permiso = datos.permisos[i];
      if (permiso === null || typeof permiso !== "object" || Array.isArray(permiso)) {
        errores.push(`permisos[${i}]: debe ser un objeto.`);
        continue;
      }
      if (!esDuracionValida(permiso.jornada_exigible)) {
        errores.push(`permisos[${i}]: jornada_exigible debe ser HH:MM.`);
      }
    }
  }
  return errores.length === 0 ? { ok: true } : { ok: false, errores };
}

/**
 * Valida los tres archivos de la sección 5.
 *
 * @param {{
 *   agentes: unknown,
 *   calendario: unknown,
 *   catalogos: unknown,
 * }} workspace
 * @returns {{ ok: true } | { ok: false, errores: string[] }}
 */
export function validarWorkspace(workspace) {
  const partes = [
    validarAgentes(workspace.agentes),
    validarCalendario(workspace.calendario),
    validarCatalogos(workspace.catalogos),
  ];
  /** @type {string[]} */
  const errores = [];
  for (const parte of partes) {
    if (!parte.ok) {
      errores.push(...parte.errores);
    }
  }
  return errores.length === 0 ? { ok: true } : { ok: false, errores };
}
