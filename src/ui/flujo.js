/**
 * Lógica pura del flujo de la interfaz (sección 14). Sin DOM.
 */

import { ARCHIVOS } from "../datos/esquemas.js";
import { textoAviso } from "../motor/avisos.js";
import { parsearHora } from "../motor/tiempo.js";

/** Hora del día estricta HH:MM (00:00–23:59). */
const RE_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const CAMPOS_MARCA = Object.freeze([
  "ingreso1",
  "salida1",
  "ingreso2",
  "salida2",
  "ingreso3",
  "salida3",
]);

const ETIQUETAS_MARCA = Object.freeze({
  ingreso1: "Ingreso 1",
  salida1: "Salida 1",
  ingreso2: "Ingreso 2",
  salida2: "Salida 2",
  ingreso3: "Ingreso 3",
  salida3: "Salida 3",
});

const MENSAJE_CARPETA_SIN_DATOS =
  "La carpeta no tiene datos todavía. Cargá el ejemplo en Diagnóstico y guardalo.";

/**
 * Mensaje informativo cuando la carpeta no tiene ninguno de los tres JSON.
 * @type {string}
 */
export { MENSAJE_CARPETA_SIN_DATOS };

/**
 * True si el error de leerWorkspace indica que faltan los tres JSON (carpeta vacía de datos).
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
      asuetos: [...(workspace.calendario?.asuetos ?? [])],
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
 * @param {Array<{ resultado: object, clave?: string }>} calculos Resultados de calcularMes (uno por archivo reconocido).
 * @param {number} umbralMinutos Umbral del catálogo, en minutos (para textoAviso).
 * @returns {Array<{ agente: string, fecha: string, texto: string, clave?: string }>}
 */
export function diasARevisar(calculos, umbralMinutos) {
  if (!Array.isArray(calculos)) {
    throw new RangeError("calculos debe ser un arreglo.");
  }
  if (!Number.isSafeInteger(umbralMinutos) || umbralMinutos < 0) {
    throw new RangeError("umbralMinutos debe ser un entero de minutos mayor o igual que 0.");
  }

  /** @type {Array<{ agente: string, fecha: string, texto: string, clave?: string }>} */
  const lista = [];
  for (const item of calculos) {
    const resultado = item?.resultado;
    if (resultado === null || resultado === undefined) {
      continue;
    }
    const nombreAgente = resultado.agente?.nombre ?? "(sin agente)";
    const clave = typeof item.clave === "string" ? item.clave : undefined;
    const dias = Array.isArray(resultado.dias) ? resultado.dias : [];
    for (const dia of dias) {
      if (dia.bloqueante !== null && dia.bloqueante !== undefined) {
        /** @type {{ agente: string, fecha: string, texto: string, clave?: string }} */
        const fila = {
          agente: nombreAgente,
          fecha: dia.fecha,
          texto: String(dia.bloqueante),
        };
        if (clave !== undefined) {
          fila.clave = clave;
        }
        lista.push(fila);
      }
      for (const aviso of dia.avisos ?? []) {
        if (aviso.codigo === "MARCACIONES_INCOMPLETAS") {
          /** @type {{ agente: string, fecha: string, texto: string, clave?: string }} */
          const fila = {
            agente: nombreAgente,
            fecha: dia.fecha,
            texto: textoAviso(aviso, umbralMinutos),
          };
          if (clave !== undefined) {
            fila.clave = clave;
          }
          lista.push(fila);
        }
      }
    }
  }
  return lista;
}

/**
 * @param {unknown} texto
 * @returns {boolean}
 */
function esHhmmOVacio(texto) {
  if (texto === "" || texto === null || texto === undefined) {
    return true;
  }
  return typeof texto === "string" && RE_HHMM.test(texto) && parsearHora(texto) !== null;
}

/**
 * @param {unknown} texto
 * @returns {number|null}
 */
function minutosDeHhmmOVacio(texto) {
  if (texto === "" || texto === null || texto === undefined) {
    return null;
  }
  return parsearHora(texto);
}

/**
 * Corrige las seis marcaciones de una fecha en el archivo mensual (en memoria).
 * Valida HH:MM estricto (00:00–23:59) o vacío. No muta el original.
 *
 * @param {{
 *   nombre?: string,
 *   periodo: { anio: number, mes: number },
 *   dias: Array<{
 *     fecha: string,
 *     marcaciones: Array<{ ingreso: number|null, salida: number|null }>,
 *     observacion: string,
 *   }>,
 * }} archivoMensual
 * @param {string} fecha Fecha AAAA-MM-DD.
 * @param {{
 *   ingreso1?: unknown,
 *   salida1?: unknown,
 *   ingreso2?: unknown,
 *   salida2?: unknown,
 *   ingreso3?: unknown,
 *   salida3?: unknown,
 * }} textos Seis textos HH:MM o "".
 * @returns {{ ok: true, archivo: object } | { ok: false, errores: Array<{ campo: string, mensaje: string }> }}
 */
export function corregirMarcaciones(archivoMensual, fecha, textos) {
  if (archivoMensual === null || typeof archivoMensual !== "object") {
    throw new RangeError("archivoMensual debe ser un objeto.");
  }
  if (typeof fecha !== "string" || fecha === "") {
    throw new RangeError("fecha debe ser un texto no vacío.");
  }
  if (textos === null || typeof textos !== "object") {
    throw new RangeError("textos debe ser un objeto.");
  }

  /** @type {Array<{ campo: string, mensaje: string }>} */
  const errores = [];
  for (const campo of CAMPOS_MARCA) {
    const valor = textos[campo];
    if (!esHhmmOVacio(valor)) {
      errores.push({
        campo,
        mensaje: `${ETIQUETAS_MARCA[campo]}: use HH:MM (00:00 a 23:59) o déjelo vacío.`,
      });
    }
  }
  if (errores.length > 0) {
    return { ok: false, errores };
  }

  const marcaciones = [
    {
      ingreso: minutosDeHhmmOVacio(textos.ingreso1),
      salida: minutosDeHhmmOVacio(textos.salida1),
    },
    {
      ingreso: minutosDeHhmmOVacio(textos.ingreso2),
      salida: minutosDeHhmmOVacio(textos.salida2),
    },
    {
      ingreso: minutosDeHhmmOVacio(textos.ingreso3),
      salida: minutosDeHhmmOVacio(textos.salida3),
    },
  ];

  const diasOrig = Array.isArray(archivoMensual.dias) ? archivoMensual.dias : [];
  /** @type {typeof diasOrig} */
  const dias = diasOrig.map((d) => ({
    ...d,
    marcaciones: (d.marcaciones ?? []).map((par) => ({ ...par })),
  }));
  const indice = dias.findIndex((d) => d.fecha === fecha);
  if (indice === -1) {
    dias.push({ fecha, marcaciones, observacion: "" });
  } else {
    dias[indice] = {
      ...dias[indice],
      marcaciones,
    };
  }

  return {
    ok: true,
    archivo: {
      ...archivoMensual,
      dias,
    },
  };
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
