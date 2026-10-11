/**
 * Persistencia de la carpeta de trabajo (sección 2 y 5).
 * File System Access API (Edge/Chrome). Sin localStorage de negocio, sin red.
 */

import { ARCHIVOS, validarWorkspace } from "./esquemas.js";

/**
 * @typedef {{
 *   agentes: object,
 *   grupos: object,
 *   calendario: object,
 *   eventos: object,
 *   catalogos: object,
 * }} Workspace
 */

/**
 * Serializa un objeto JSON con indentación estable.
 *
 * @param {unknown} valor
 * @returns {string}
 */
export function serializarJson(valor) {
  return `${JSON.stringify(valor, null, 2)}\n`;
}

/**
 * Parsea texto JSON. Lanza Error si el texto no es JSON válido.
 *
 * @param {string} texto
 * @param {string} nombre
 * @returns {unknown}
 */
export function parsearJson(texto, nombre) {
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`${nombre}: JSON inválido.`);
  }
}

/**
 * @param {string[]} errores
 * @param {{ leidos?: string[], faltantes?: string[], escritos?: string[] }} [extra]
 * @returns {Error & { errores: string[], leidos?: string[], faltantes?: string[], escritos?: string[] }}
 */
function errorConDetalle(errores, extra = {}) {
  const error = /** @type {Error & { errores: string[], leidos?: string[], faltantes?: string[], escritos?: string[] }} */ (
    new Error(errores.join("\n"))
  );
  error.errores = errores;
  if (extra.leidos !== undefined) {
    error.leidos = extra.leidos;
  }
  if (extra.faltantes !== undefined) {
    error.faltantes = extra.faltantes;
  }
  if (extra.escritos !== undefined) {
    error.escritos = extra.escritos;
  }
  return error;
}

/**
 * @param {Workspace} workspace
 * @returns {Workspace}
 */
export function exigirWorkspaceValido(workspace) {
  const resultado = validarWorkspace(workspace);
  if (!resultado.ok) {
    throw errorConDetalle(resultado.errores);
  }
  return workspace;
}

/**
 * Quita `alias` de cada agente. La lectura lo ignora; al guardar no se escribe.
 *
 * @param {unknown} agentesDoc
 * @returns {object}
 */
function agentesSinAlias(agentesDoc) {
  if (agentesDoc === null || typeof agentesDoc !== "object" || Array.isArray(agentesDoc)) {
    return /** @type {object} */ (agentesDoc);
  }
  const doc = /** @type {{ agentes?: unknown }} */ (agentesDoc);
  if (!Array.isArray(doc.agentes)) {
    return { ...doc };
  }
  return {
    ...doc,
    agentes: doc.agentes.map((agente) => {
      if (agente === null || typeof agente !== "object" || Array.isArray(agente)) {
        return agente;
      }
      const { alias: _omitido, ...resto } = /** @type {Record<string, unknown>} */ (agente);
      return resto;
    }),
  };
}

/**
 * Arma un workspace a partir de los cinco textos JSON.
 *
 * @param {Record<keyof typeof ARCHIVOS, string>} textos
 * @returns {Workspace}
 */
export function workspaceDesdeTextos(textos) {
  const workspace = {
    agentes: agentesSinAlias(parsearJson(textos.agentes, ARCHIVOS.agentes)),
    grupos: parsearJson(textos.grupos, ARCHIVOS.grupos),
    calendario: parsearJson(textos.calendario, ARCHIVOS.calendario),
    eventos: parsearJson(textos.eventos, ARCHIVOS.eventos),
    catalogos: parsearJson(textos.catalogos, ARCHIVOS.catalogos),
  };
  return exigirWorkspaceValido(/** @type {Workspace} */ (workspace));
}

/**
 * Convierte un workspace validado a los cinco textos JSON.
 *
 * @param {Workspace} workspace
 * @returns {Record<keyof typeof ARCHIVOS, string>}
 */
export function textosDesdeWorkspace(workspace) {
  const limpio = {
    ...workspace,
    agentes: agentesSinAlias(workspace.agentes),
  };
  exigirWorkspaceValido(/** @type {Workspace} */ (limpio));
  return {
    agentes: serializarJson(limpio.agentes),
    grupos: serializarJson(limpio.grupos),
    calendario: serializarJson(limpio.calendario),
    eventos: serializarJson(limpio.eventos),
    catalogos: serializarJson(limpio.catalogos),
  };
}

/**
 * Resumen numérico para la pantalla mínima.
 *
 * @param {Workspace} workspace
 * @returns {{
 *   agentes: number,
 *   grupos: number,
 *   feriados: number,
 *   eventos: number,
 *   justificaciones: number,
 *   permisos: number,
 * }}
 */
export function resumenWorkspace(workspace) {
  return {
    agentes: Array.isArray(workspace.agentes?.agentes) ? workspace.agentes.agentes.length : 0,
    grupos: Array.isArray(workspace.grupos?.grupos) ? workspace.grupos.grupos.length : 0,
    feriados: Array.isArray(workspace.calendario?.feriados)
      ? workspace.calendario.feriados.length
      : 0,
    eventos: Array.isArray(workspace.eventos?.eventos) ? workspace.eventos.eventos.length : 0,
    justificaciones: Array.isArray(workspace.catalogos?.justificaciones)
      ? workspace.catalogos.justificaciones.length
      : 0,
    permisos: Array.isArray(workspace.catalogos?.permisos)
      ? workspace.catalogos.permisos.length
      : 0,
  };
}

/**
 * @returns {boolean}
 */
export function soportaFileSystemAccess() {
  return typeof globalThis.showDirectoryPicker === "function";
}

/**
 * Pide al usuario una carpeta de trabajo (gesto de usuario en Chromium).
 *
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
export async function abrirCarpetaTrabajo() {
  if (!soportaFileSystemAccess()) {
    throw new Error(
      "Este navegador no permite elegir carpeta. La aplicación requiere Edge o Chrome.",
    );
  }
  return globalThis.showDirectoryPicker({ mode: "readwrite" });
}

/**
 * @param {FileSystemDirectoryHandle} dir
 * @param {string} nombre
 * @returns {Promise<string>}
 */
async function leerArchivoTexto(dir, nombre) {
  const handle = await dir.getFileHandle(nombre);
  const archivo = await handle.getFile();
  return archivo.text();
}

/**
 * @param {FileSystemDirectoryHandle} dir
 * @param {string} nombre
 * @param {string} texto
 * @returns {Promise<void>}
 */
async function escribirArchivoTexto(dir, nombre, texto) {
  const handle = await dir.getFileHandle(nombre, { create: true });
  const writable = await handle.createWritable();
  await writable.write(texto);
  await writable.close();
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function esArchivoAusente(err) {
  return err instanceof DOMException && err.name === "NotFoundError";
}

/**
 * Lee y valida los cinco JSON de la sección 5.
 * Asegura que exista la carpeta periodos/ (vacía si hace falta).
 * No aplica un workspace a medias: si falta un archivo o la validación falla, lanza.
 *
 * @param {FileSystemDirectoryHandle} dir
 * @returns {Promise<{ workspace: Workspace, leidos: string[], faltantes: string[] }>}
 */
export async function leerWorkspace(dir) {
  /** @type {string[]} */
  const leidos = [];
  /** @type {string[]} */
  const faltantes = [];
  /** @type {Partial<Record<keyof typeof ARCHIVOS, string>>} */
  const textos = {};

  for (const [clave, nombre] of Object.entries(ARCHIVOS)) {
    try {
      textos[/** @type {keyof typeof ARCHIVOS} */ (clave)] = await leerArchivoTexto(dir, nombre);
      leidos.push(nombre);
    } catch (err) {
      if (esArchivoAusente(err)) {
        faltantes.push(nombre);
        continue;
      }
      throw errorConDetalle(
        [`${nombre}: no se pudo leer (${err instanceof Error ? err.message : String(err)}).`],
        { leidos, faltantes },
      );
    }
  }

  try {
    await dir.getDirectoryHandle("periodos", { create: true });
  } catch {
    // Si el handle es de solo lectura, la carpeta puede faltar; la lectura igual sigue.
  }

  if (faltantes.length > 0) {
    throw errorConDetalle(
      faltantes.map((nombre) => `${nombre}: archivo no encontrado.`),
      { leidos, faltantes },
    );
  }

  try {
    const workspace = workspaceDesdeTextos(
      /** @type {Record<keyof typeof ARCHIVOS, string>} */ (textos),
    );
    return { workspace, leidos, faltantes };
  } catch (err) {
    const errores = err && typeof err === "object" && Array.isArray(/** @type {{ errores?: string[] }} */ (err).errores)
      ? /** @type {{ errores: string[] }} */ (err).errores
      : [err instanceof Error ? err.message : String(err)];
    throw errorConDetalle(errores, { leidos, faltantes });
  }
}

/**
 * Valida y escribe los cinco JSON en la carpeta.
 *
 * @param {FileSystemDirectoryHandle} dir
 * @param {Workspace} workspace
 * @returns {Promise<{ escritos: string[] }>}
 */
export async function escribirWorkspace(dir, workspace) {
  const textos = textosDesdeWorkspace(workspace);
  /** @type {string[]} */
  const escritos = [];
  for (const [clave, nombre] of Object.entries(ARCHIVOS)) {
    await escribirArchivoTexto(
      dir,
      nombre,
      textos[/** @type {keyof typeof ARCHIVOS} */ (clave)],
    );
    escritos.push(nombre);
  }
  try {
    await dir.getDirectoryHandle("periodos", { create: true });
  } catch {
    // Igual que al leer: no bloquea el guardado de los JSON de la sección 5.
  }
  return { escritos };
}

/**
 * Mock en memoria de una carpeta para pruebas (misma forma que FSA).
 *
 * @param {Record<string, string>} [inicial]
 * @returns {FileSystemDirectoryHandle}
 */
export function crearDirectorioMemoria(inicial = {}) {
  /** @type {Map<string, string>} */
  const archivos = new Map(Object.entries(inicial));
  /** @type {Set<string>} */
  const carpetas = new Set();

  return {
    kind: "directory",
    name: "memoria",
    async getFileHandle(nombre, opciones = {}) {
      if (!archivos.has(nombre)) {
        if (!opciones.create) {
          throw new DOMException(`No existe ${nombre}`, "NotFoundError");
        }
        archivos.set(nombre, "");
      }
      return {
        kind: "file",
        name: nombre,
        async getFile() {
          const texto = archivos.get(nombre) ?? "";
          return new File([texto], nombre, { type: "application/json" });
        },
        async createWritable() {
          let pendiente = "";
          return {
            async write(dato) {
              pendiente = typeof dato === "string" ? dato : String(dato);
            },
            async close() {
              archivos.set(nombre, pendiente);
            },
          };
        },
      };
    },
    async getDirectoryHandle(nombre, opciones = {}) {
      if (!carpetas.has(nombre)) {
        if (!opciones.create) {
          throw new DOMException(`No existe ${nombre}`, "NotFoundError");
        }
        carpetas.add(nombre);
      }
      return {
        kind: "directory",
        name: nombre,
        async getFileHandle() {
          throw new Error("No implementado en el mock de subcarpeta.");
        },
        async getDirectoryHandle() {
          throw new Error("No implementado en el mock de subcarpeta.");
        },
      };
    },
    /** @internal solo para aserciones de prueba */
    _archivos: archivos,
    _carpetas: carpetas,
  };
}
