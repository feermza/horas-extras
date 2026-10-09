/**
 * Validación de los JSON de la sección 5 al leer y al guardar.
 * El motor asume datos válidos; esta capa es el filtro.
 */

import { parsearDuracion, parsearHora } from "../motor/tiempo.js";

/** Nombres fijos de la carpeta de trabajo (sección 2). */
export const ARCHIVOS = Object.freeze({
  agentes: "agentes.json",
  grupos: "grupos.json",
  calendario: "calendario.json",
  eventos: "eventos.json",
  catalogos: "catalogos.json",
});

const TIPOS_EVENTO = new Set(["ASUETO", "PARO"]);

const CAMPOS_HORA_CONFIG = ["horario_inicio", "horario_fin"];
const CAMPOS_DURACION_CONFIG = [
  "duracion_jornada",
  "tope_extra_habil",
  "sabado_tope",
  "tope_feriado",
  "tope_asueto",
  "tope_paro",
  "tope_lao_receso",
];

/**
 * @param {unknown} valor
 * @returns {boolean}
 */
function estaVacio(valor) {
  return valor === null || valor === undefined || valor === "";
}

/**
 * @param {unknown} texto
 * @returns {boolean}
 */
function esHoraValida(texto) {
  return parsearHora(texto) !== null;
}

/**
 * @param {unknown} texto
 * @returns {boolean}
 */
function esDuracionValida(texto) {
  return parsearDuracion(texto) !== null;
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
      errores.push(`${contexto}: ${campo} debe ser HH:MM.`);
    }
  }
  for (const campo of CAMPOS_DURACION_CONFIG) {
    if (!esDuracionValida(cfg[campo])) {
      errores.push(`${contexto}: ${campo} debe ser HH:MM.`);
    }
  }
  const sabInicioVacio = estaVacio(cfg.sabado_inicio);
  const sabFinVacio = estaVacio(cfg.sabado_fin);
  if (sabInicioVacio !== sabFinVacio) {
    errores.push(
      `${contexto}: sábado inválido: hay que cargar sabado_inicio y sabado_fin, o ninguno.`,
    );
  } else if (!sabInicioVacio) {
    if (!esHoraValida(cfg.sabado_inicio)) {
      errores.push(`${contexto}: sabado_inicio debe ser HH:MM.`);
    }
    if (!esHoraValida(cfg.sabado_fin)) {
      errores.push(`${contexto}: sabado_fin debe ser HH:MM.`);
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
  for (let i = 0; i < datos.agentes.length; i += 1) {
    const agente = datos.agentes[i];
    const ctx = `agentes[${i}]`;
    if (agente === null || typeof agente !== "object" || Array.isArray(agente)) {
      errores.push(`${ctx}: debe ser un objeto.`);
      continue;
    }
    if (!Array.isArray(agente.configuraciones)) {
      errores.push(`${ctx}: falta el arreglo configuraciones.`);
      continue;
    }
    for (let j = 0; j < agente.configuraciones.length; j += 1) {
      validarConfiguracion(agente.configuraciones[j], `${ctx}.configuraciones[${j}]`, errores);
    }
    for (let j = 0; j < agente.configuraciones.length; j += 1) {
      for (let k = j + 1; k < agente.configuraciones.length; k += 1) {
        if (vigenciasSuperpuestas(agente.configuraciones[j], agente.configuraciones[k])) {
          errores.push(
            `${ctx}: las configuraciones ${j} y ${k} tienen vigencias superpuestas.`,
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
export function validarGrupos(datos) {
  /** @type {string[]} */
  const errores = [];
  if (datos === null || typeof datos !== "object" || Array.isArray(datos)) {
    return { ok: false, errores: ["grupos.json: se esperaba un objeto con la clave grupos."] };
  }
  if (!Array.isArray(datos.grupos)) {
    return { ok: false, errores: ["grupos.json: falta el arreglo grupos."] };
  }
  for (let i = 0; i < datos.grupos.length; i += 1) {
    const grupo = datos.grupos[i];
    if (grupo === null || typeof grupo !== "object" || Array.isArray(grupo)) {
      errores.push(`grupos[${i}]: debe ser un objeto.`);
      continue;
    }
    if (!estaVacio(grupo.horas_maximas) && !esDuracionValida(grupo.horas_maximas)) {
      errores.push(`grupos[${i}]: horas_maximas debe ser HH:MM.`);
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
  return errores.length === 0 ? { ok: true } : { ok: false, errores };
}

/**
 * @param {unknown} datos
 * @returns {{ ok: true } | { ok: false, errores: string[] }}
 */
export function validarEventos(datos) {
  /** @type {string[]} */
  const errores = [];
  if (datos === null || typeof datos !== "object" || Array.isArray(datos)) {
    return { ok: false, errores: ["eventos.json: se esperaba un objeto con la clave eventos."] };
  }
  if (!Array.isArray(datos.eventos)) {
    return { ok: false, errores: ["eventos.json: falta el arreglo eventos."] };
  }
  for (let i = 0; i < datos.eventos.length; i += 1) {
    const evento = datos.eventos[i];
    if (evento === null || typeof evento !== "object" || Array.isArray(evento)) {
      errores.push(`eventos[${i}]: debe ser un objeto.`);
      continue;
    }
    if (typeof evento.fecha !== "string" || evento.fecha === "") {
      errores.push(`eventos[${i}]: fecha es obligatoria.`);
    }
    if (!TIPOS_EVENTO.has(evento.tipo)) {
      errores.push(`eventos[${i}]: tipo debe ser ASUETO o PARO.`);
    }
    if (!estaVacio(evento.tope_especial) && !esDuracionValida(evento.tope_especial)) {
      errores.push(`eventos[${i}]: tope_especial debe ser HH:MM o vacío.`);
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
 * Valida los cinco archivos de la sección 5.
 *
 * @param {{
 *   agentes: unknown,
 *   grupos: unknown,
 *   calendario: unknown,
 *   eventos: unknown,
 *   catalogos: unknown,
 * }} workspace
 * @returns {{ ok: true } | { ok: false, errores: string[] }}
 */
export function validarWorkspace(workspace) {
  const partes = [
    validarAgentes(workspace.agentes),
    validarGrupos(workspace.grupos),
    validarCalendario(workspace.calendario),
    validarEventos(workspace.eventos),
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
