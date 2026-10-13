/**
 * Lógica pura del flujo de la interfaz (sección 14). Sin DOM.
 */

import { ARCHIVOS } from "../datos/esquemas.js";
import { textoAviso } from "../motor/avisos.js";

const MENSAJE_CARPETA_SIN_DATOS =
  "La carpeta no tiene datos todavía. Cargá el ejemplo en Diagnóstico y guardalo.";

/**
 * Mensaje informativo cuando la carpeta no tiene ninguno de los cuatro JSON.
 * @type {string}
 */
export { MENSAJE_CARPETA_SIN_DATOS };

/**
 * True si el error de leerWorkspace indica que faltan los cuatro JSON (carpeta vacía de datos).
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function esCarpetaSinDatos(err) {
  if (err === null || typeof err !== "object") {
    return false;
  }
  const detalle = /** @type {{ leidos?: unknown, faltantes?: unknown }} */ (err);
  if (!Array.isArray(detalle.leidos) || !Array.isArray(detalle.faltantes)) {
    return false;
  }
  if (detalle.leidos.length !== 0) {
    return false;
  }
  const esperados = Object.values(ARCHIVOS);
  return (
    detalle.faltantes.length === esperados.length
    && esperados.every((nombre) => detalle.faltantes.includes(nombre))
  );
}

/**
 * Asocia el nombre del reloj (del Excel) a un agente: reemplaza su nombre_reloj.
 * Devuelve un workspace nuevo; no muta el original.
 *
 * @param {import("../datos/persistencia.js").Workspace} workspace
 * @param {string} idAgente
 * @param {string} nombreReloj
 * @returns {import("../datos/persistencia.js").Workspace}
 */
export function asociarNombreReloj(workspace, idAgente, nombreReloj) {
  if (workspace === null || typeof workspace !== "object") {
    throw new RangeError("workspace debe ser un objeto.");
  }
  if (typeof idAgente !== "string" || idAgente === "") {
    throw new RangeError("idAgente debe ser un texto no vacío.");
  }
  if (typeof nombreReloj !== "string" || nombreReloj.trim() === "") {
    throw new RangeError("nombreReloj debe ser un texto no vacío.");
  }

  const agentes = workspace.agentes?.agentes;
  if (!Array.isArray(agentes)) {
    throw new RangeError("workspace.agentes.agentes debe ser un arreglo.");
  }

  const indice = agentes.findIndex((a) => a && a.id === idAgente);
  if (indice === -1) {
    throw new RangeError(`No hay un agente con id ${idAgente}.`);
  }

  const copiaAgentes = agentes.map((agente, i) => {
    if (i !== indice) {
      return { ...agente, configuraciones: [...(agente.configuraciones ?? [])] };
    }
    return {
      ...agente,
      nombre_reloj: nombreReloj,
      configuraciones: [...(agente.configuraciones ?? [])],
    };
  });

  return {
    ...workspace,
    agentes: { ...workspace.agentes, agentes: copiaAgentes },
    calendario: {
      ...workspace.calendario,
      feriados: [...(workspace.calendario?.feriados ?? [])],
    },
    eventos: {
      ...workspace.eventos,
      eventos: [...(workspace.eventos?.eventos ?? [])],
    },
    catalogos: {
      ...workspace.catalogos,
      justificaciones: [...(workspace.catalogos?.justificaciones ?? [])],
      permisos: [...(workspace.catalogos?.permisos ?? [])],
    },
  };
}

/**
 * Lista informativa de días con bloqueante o con aviso MARCACIONES_INCOMPLETAS.
 *
 * @param {Array<{ resultado: object }>} calculos Resultados de calcularMes (uno por archivo reconocido).
 * @param {number} umbralMinutos Umbral del catálogo, en minutos (para textoAviso).
 * @returns {Array<{ agente: string, fecha: string, texto: string }>}
 */
export function diasARevisar(calculos, umbralMinutos) {
  if (!Array.isArray(calculos)) {
    throw new RangeError("calculos debe ser un arreglo.");
  }
  if (!Number.isSafeInteger(umbralMinutos) || umbralMinutos < 0) {
    throw new RangeError("umbralMinutos debe ser un entero de minutos mayor o igual que 0.");
  }

  /** @type {Array<{ agente: string, fecha: string, texto: string }>} */
  const lista = [];
  for (const item of calculos) {
    const resultado = item?.resultado;
    if (resultado === null || resultado === undefined) {
      continue;
    }
    const nombreAgente = resultado.agente?.nombre ?? "(sin agente)";
    const dias = Array.isArray(resultado.dias) ? resultado.dias : [];
    for (const dia of dias) {
      if (dia.bloqueante !== null && dia.bloqueante !== undefined) {
        lista.push({
          agente: nombreAgente,
          fecha: dia.fecha,
          texto: String(dia.bloqueante),
        });
      }
      for (const aviso of dia.avisos ?? []) {
        if (aviso.codigo === "MARCACIONES_INCOMPLETAS") {
          lista.push({
            agente: nombreAgente,
            fecha: dia.fecha,
            texto: textoAviso(aviso, umbralMinutos),
          });
        }
      }
    }
  }
  return lista;
}

/**
 * Arma el arreglo meses para generarLibro a partir de las entradas reconocidas.
 * Omite las que no tienen agente ni resultado.
 *
 * @param {Array<{ resultado: object|null, archivo: object, agente?: object|null }>} entradas
 * @returns {Array<{ resultado: object, archivo: object }>}
 */
export function armarMesesParaLibro(entradas) {
  if (!Array.isArray(entradas)) {
    throw new RangeError("entradas debe ser un arreglo.");
  }
  /** @type {Array<{ resultado: object, archivo: object }>} */
  const meses = [];
  for (const entrada of entradas) {
    if (entrada === null || typeof entrada !== "object") {
      continue;
    }
    if (entrada.resultado === null || entrada.resultado === undefined) {
      continue;
    }
    if (entrada.archivo === null || entrada.archivo === undefined) {
      continue;
    }
    if (entrada.agente === null || entrada.agente === undefined) {
      continue;
    }
    meses.push({ resultado: entrada.resultado, archivo: entrada.archivo });
  }
  return meses;
}
