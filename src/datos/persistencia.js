/**
 * Persistencia de la carpeta de trabajo (sección 2 y 5).
 * File System Access API cuando está disponible; alternativa manual por texto JSON.
 * Sin localStorage de negocio, sin red.
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
 * @param {Workspace} workspace
 * @returns {Workspace}
 */
export function exigirWorkspaceValido(workspace) {
  const resultado = validarWorkspace(workspace);
  if (!resultado.ok) {
    throw new Error(resultado.errores.join("\n"));
  }
  return workspace;
}

/**
 * Arma un workspace a partir de los cinco textos JSON.
 *
 * @param {Record<keyof typeof ARCHIVOS, string>} textos
 * @returns {Workspace}
 */
export function workspaceDesdeTextos(textos) {
  const workspace = {
    agentes: parsearJson(textos.agentes, ARCHIVOS.agentes),
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
  exigirWorkspaceValido(workspace);
  return {
    agentes: serializarJson(workspace.agentes),
    grupos: serializarJson(workspace.grupos),
    calendario: serializarJson(workspace.calendario),
    eventos: serializarJson(workspace.eventos),
    catalogos: serializarJson(workspace.catalogos),
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
      "Este navegador no permite elegir carpeta. Usá la importación manual de JSON.",
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
 * Lee y valida los cinco JSON de la sección 5.
 * Asegura que exista la carpeta periodos/ (vacía si hace falta).
 *
 * @param {FileSystemDirectoryHandle} dir
 * @returns {Promise<Workspace>}
 */
export async function leerWorkspace(dir) {
  const textos = {
    agentes: await leerArchivoTexto(dir, ARCHIVOS.agentes),
    grupos: await leerArchivoTexto(dir, ARCHIVOS.grupos),
    calendario: await leerArchivoTexto(dir, ARCHIVOS.calendario),
    eventos: await leerArchivoTexto(dir, ARCHIVOS.eventos),
    catalogos: await leerArchivoTexto(dir, ARCHIVOS.catalogos),
  };
  try {
    await dir.getDirectoryHandle("periodos", { create: true });
  } catch {
    // Si el handle es de solo lectura, la carpeta puede faltar; la lectura igual sigue.
  }
  return workspaceDesdeTextos(textos);
}

/**
 * Valida y escribe los cinco JSON en la carpeta.
 *
 * @param {FileSystemDirectoryHandle} dir
 * @param {Workspace} workspace
 * @returns {Promise<void>}
 */
export async function escribirWorkspace(dir, workspace) {
  const textos = textosDesdeWorkspace(workspace);
  await escribirArchivoTexto(dir, ARCHIVOS.agentes, textos.agentes);
  await escribirArchivoTexto(dir, ARCHIVOS.grupos, textos.grupos);
  await escribirArchivoTexto(dir, ARCHIVOS.calendario, textos.calendario);
  await escribirArchivoTexto(dir, ARCHIVOS.eventos, textos.eventos);
  await escribirArchivoTexto(dir, ARCHIVOS.catalogos, textos.catalogos);
  try {
    await dir.getDirectoryHandle("periodos", { create: true });
  } catch {
    // Igual que al leer: no bloquea el guardado de los JSON de la sección 5.
  }
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
