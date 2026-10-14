<script setup>
import { computed, ref } from "vue";
import { workspaceSintetico } from "../datos/ejemploSintetico.js";
import {
  abrirCarpetaTrabajo,
  escribirParteWorkspace,
  escribirWorkspace,
  leerWorkspace,
  resumenWorkspace,
  soportaFileSystemAccess,
} from "../datos/persistencia.js";
import { generarLibro } from "../excel/generarLibro.js";
import { leerArchivoMensual } from "../excel/importarMensual.js";
import { calcularMes, identificarAgente } from "../motor/calculoMes.js";
import { parsearDuracion, formatearHM } from "../motor/tiempo.js";
import {
  agregarNuevaConfiguracion,
  crearAgenteNuevo,
  normalizarAgentesParaGuardar,
  normalizarCalendarioParaGuardar,
  normalizarCatalogoParaGuardar,
  prepararAgentesParaEdicion,
  prepararCalendarioParaEdicion,
  prepararCatalogoParaEdicion,
  validarEdicionAgentes,
  validarEdicionCalendario,
  validarEdicionCatalogo,
} from "./configuracion.js";
import {
  armarMesesParaLibro,
  asociarNombreReloj,
  corregirMarcaciones,
  diasARevisar,
  esCarpetaSinDatos,
  MENSAJE_CARPETA_SIN_DATOS,
} from "./flujo.js";

/** @typedef {"ok"|"error"|"neutro"|""} EstadoTipo */

/**
 * @typedef {{
 *   clave: string,
 *   nombreArchivo: string,
 *   mensual: Awaited<ReturnType<typeof leerArchivoMensual>>,
 *   agente: object|null,
 *   resultado: object|null,
 * }} EntradaExcel
 */

/** @type {import("vue").Ref<import("../datos/persistencia.js").Workspace|null>} */
const workspace = ref(null);
/** @type {import("vue").Ref<FileSystemDirectoryHandle|null>} */
const carpeta = ref(null);
const nombreCarpeta = ref("");
const origen = ref("");
/** @type {import("vue").Ref<EstadoTipo>} */
const estadoTipo = ref("");
const estadoMensaje = ref("");
/** @type {import("vue").Ref<string[]>} */
const errores = ref([]);
/** @type {import("vue").Ref<string[]>} */
const archivosLeidos = ref([]);
/** @type {import("vue").Ref<string[]>} */
const archivosFaltantes = ref([]);
/** @type {import("vue").Ref<string[]>} */
const archivosEscritos = ref([]);
/** @type {import("vue").Ref<EntradaExcel[]>} */
const entradas = ref([]);
const inputExcel = ref(/** @type {HTMLInputElement|null} */ (null));

const resumen = computed(() => (
  workspace.value === null ? null : resumenWorkspace(workspace.value)
));
const agentes = computed(() => workspace.value?.agentes?.agentes ?? []);
const feriados = computed(() => workspace.value?.calendario?.feriados ?? []);
const asuetos = computed(() => workspace.value?.calendario?.asuetos ?? []);
const tieneFsa = soportaFileSystemAccess();

const paso1Hecho = computed(() => workspace.value !== null && carpeta.value !== null);
const paso2Hecho = computed(() => entradas.value.length > 0);
const reconocidos = computed(() => entradas.value.filter((e) => e.agente !== null));
const hayReconocidos = computed(() => reconocidos.value.length > 0);

const listaRevisar = computed(() => {
  if (workspace.value === null) {
    return [];
  }
  const umbral = parsearDuracion(workspace.value.catalogos.umbral_minimo);
  if (umbral === null) {
    return [];
  }
  const calculos = reconocidos.value
    .filter((e) => e.resultado !== null)
    .map((e) => ({ resultado: e.resultado, clave: e.clave }));
  return diasARevisar(calculos, umbral);
});

/** @type {import("vue").Ref<{ clave: string, fecha: string }|null>} */
const edicion = ref(null);
/** @type {import("vue").Ref<{
 *   ingreso1: string,
 *   salida1: string,
 *   ingreso2: string,
 *   salida2: string,
 *   ingreso3: string,
 *   salida3: string,
 * }>} */
const edicionCampos = ref({
  ingreso1: "",
  salida1: "",
  ingreso2: "",
  salida2: "",
  ingreso3: "",
  salida3: "",
});
/** @type {import("vue").Ref<Record<string, string>>} */
const edicionErrores = ref({});

/** @type {import("vue").Ref<"flujo"|"config">} */
const vista = ref("flujo");
/** @type {import("vue").Ref<"agentes"|"calendario"|"catalogo">} */
const pestanaConfig = ref("agentes");
/** @type {import("vue").Ref<object|null>} */
const borradorAgentes = ref(null);
/** @type {import("vue").Ref<object|null>} */
const borradorCalendario = ref(null);
/** @type {import("vue").Ref<object|null>} */
const borradorCatalogos = ref(null);
/** @type {import("vue").Ref<string[]>} */
const erroresConfig = ref([]);
/** @type {import("vue").Ref<string|null>} */
const idAgenteSeleccionado = ref(null);
const vigenciaNuevaConfig = ref("");

const configHabilitada = computed(() => carpeta.value !== null && workspace.value !== null);

const listaAgentesBorrador = computed(() => borradorAgentes.value?.agentes ?? []);
const agenteSeleccionado = computed(() => {
  const id = idAgenteSeleccionado.value;
  if (id === null || borradorAgentes.value === null) {
    return null;
  }
  return listaAgentesBorrador.value.find((a) => a.id === id) ?? null;
});

/**
 * @returns {string}
 */
function horaActual() {
  return new Date().toLocaleTimeString("es-AR", { hour12: false });
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function esCancelacion(err) {
  return err instanceof DOMException && err.name === "AbortError";
}

function limpiarListasArchivos() {
  archivosLeidos.value = [];
  archivosFaltantes.value = [];
  archivosEscritos.value = [];
}

/**
 * @param {string} texto
 * @param {{ escritos?: string[], leidos?: string[], faltantes?: string[] }} [listas]
 */
function marcarOk(texto, { escritos = [], leidos = [], faltantes = [] } = {}) {
  estadoTipo.value = "ok";
  estadoMensaje.value = texto;
  errores.value = [];
  archivosEscritos.value = escritos;
  archivosLeidos.value = leidos;
  archivosFaltantes.value = faltantes;
}

/**
 * @param {string} texto
 */
function marcarNeutro(texto) {
  estadoTipo.value = "neutro";
  estadoMensaje.value = texto;
  errores.value = [];
  limpiarListasArchivos();
}

/**
 * @param {unknown} err
 */
function marcarError(err) {
  estadoTipo.value = "error";
  const detalle = err !== null && typeof err === "object"
    ? /** @type {{
      message?: string,
      errores?: string[],
      leidos?: string[],
      faltantes?: string[],
      escritos?: string[],
    }} */ (err)
    : null;
  const lista = Array.isArray(detalle?.errores) && detalle.errores.length > 0
    ? detalle.errores
    : [detalle?.message
      ?? (err instanceof Error ? err.message : String(err))];
  estadoMensaje.value = `La última acción falló (${horaActual()}).`;
  errores.value = lista;
  archivosLeidos.value = Array.isArray(detalle?.leidos) ? detalle.leidos : [];
  archivosFaltantes.value = Array.isArray(detalle?.faltantes) ? detalle.faltantes : [];
  archivosEscritos.value = Array.isArray(detalle?.escritos) ? detalle.escritos : [];
}

/**
 * @param {unknown} valor
 * @returns {string}
 */
function textoOGuion(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return "—";
  }
  return String(valor);
}

/**
 * @param {number|null} minutos
 * @returns {string|null}
 */
function marcaParaMotor(minutos) {
  if (minutos === null || minutos === undefined) {
    return null;
  }
  return formatearHM(minutos);
}

/**
 * Minutos a HH:MM estricto para los campos de corrección.
 *
 * @param {number|null|undefined} minutos
 * @returns {string}
 */
function minutosAHhmm(minutos) {
  if (minutos === null || minutos === undefined) {
    return "";
  }
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * @param {Awaited<ReturnType<typeof leerArchivoMensual>>} mensual
 * @returns {{ periodo: object, dias: object[] }}
 */
function archivoParaCalculo(mensual) {
  return {
    periodo: mensual.periodo,
    dias: mensual.dias.map((d) => ({
      fecha: d.fecha,
      observacion: d.observacion,
      marcaciones: d.marcaciones.map((par) => ({
        ingreso: marcaParaMotor(par.ingreso),
        salida: marcaParaMotor(par.salida),
      })),
    })),
  };
}

/**
 * @param {EntradaExcel} entrada
 * @param {import("../datos/persistencia.js").Workspace} ws
 * @returns {EntradaExcel}
 */
function recalcularEntrada(entrada, ws) {
  const agente = identificarAgente(entrada.mensual.nombre, ws.agentes.agentes);
  if (agente === null) {
    return { ...entrada, agente: null, resultado: null };
  }
  const resultado = calcularMes({
    nombre: entrada.mensual.nombre,
    agentes: ws.agentes.agentes,
    archivo: archivoParaCalculo(entrada.mensual),
    feriados: ws.calendario.feriados,
    asuetos: ws.calendario.asuetos ?? [],
    catalogo: ws.catalogos,
  });
  return { ...entrada, agente, resultado };
}

/**
 * @param {import("../datos/persistencia.js").Workspace} ws
 */
function recalcularTodas(ws) {
  entradas.value = entradas.value.map((e) => recalcularEntrada(e, ws));
}

async function alElegirCarpeta() {
  let handle;
  try {
    handle = await abrirCarpetaTrabajo();
  } catch (err) {
    if (esCancelacion(err)) {
      marcarNeutro("Operación cancelada");
      return;
    }
    marcarError(err);
    return;
  }

  // La carpeta elegida se conserva aunque la lectura falle.
  carpeta.value = handle;
  nombreCarpeta.value = handle.name;
  entradas.value = [];
  edicion.value = null;
  edicionErrores.value = {};

  try {
    const leido = await leerWorkspace(handle);
    workspace.value = leido.workspace;
    origen.value = `leído de la carpeta ${handle.name}`;
    marcarOk(`Carpeta elegida y leída: ${handle.name} (${horaActual()}).`, {
      leidos: leido.leidos,
      faltantes: leido.faltantes,
    });
  } catch (err) {
    workspace.value = null;
    origen.value = "";
    if (esCarpetaSinDatos(err)) {
      marcarNeutro(MENSAJE_CARPETA_SIN_DATOS);
      return;
    }
    marcarError(err);
  }
}

function alPedirExcel() {
  inputExcel.value?.click();
}

/**
 * @param {Event} evento
 */
async function alLeerExcels(evento) {
  const input = /** @type {HTMLInputElement} */ (evento.target);
  const files = input.files ? [...input.files] : [];
  input.value = "";
  if (files.length === 0) {
    marcarNeutro("Operación cancelada");
    return;
  }
  if (workspace.value === null) {
    marcarError(new Error("Primero hay que elegir la carpeta de datos."));
    return;
  }
  try {
    /** @type {EntradaExcel[]} */
    const nuevas = [];
    for (const archivo of files) {
      const buffer = await archivo.arrayBuffer();
      const mensual = await leerArchivoMensual(buffer);
      const base = {
        clave: `${archivo.name}-${archivo.size}-${archivo.lastModified}`,
        nombreArchivo: archivo.name,
        mensual,
        agente: null,
        resultado: null,
      };
      nuevas.push(recalcularEntrada(base, workspace.value));
    }
    entradas.value = nuevas;
    edicion.value = null;
    edicionErrores.value = {};
    marcarOk(
      `Se leyeron ${nuevas.length} archivo(s) Excel (${horaActual()}). `
      + `${nuevas.filter((e) => e.agente).length} reconocido(s).`,
    );
  } catch (err) {
    marcarError(err);
  }
}

/**
 * @param {EntradaExcel} entrada
 * @param {Event} evento
 */
async function alAsociarAgente(entrada, evento) {
  const select = /** @type {HTMLSelectElement} */ (evento.target);
  const idAgente = select.value;
  if (idAgente === "" || workspace.value === null || carpeta.value === null) {
    return;
  }
  try {
    const actualizado = asociarNombreReloj(
      workspace.value,
      idAgente,
      entrada.mensual.nombre,
    );
    const guardado = await escribirWorkspace(carpeta.value, actualizado);
    workspace.value = actualizado;
    recalcularTodas(actualizado);
    marcarOk(
      `nombre_reloj actualizado y guardado (${horaActual()}).`,
      { escritos: guardado.escritos },
    );
  } catch (err) {
    select.value = "";
    marcarError(err);
  }
}

/**
 * @param {{ clave?: string, fecha: string }} item
 */
function alAbrirCorreccion(item) {
  if (typeof item.clave !== "string") {
    return;
  }
  const entrada = entradas.value.find((e) => e.clave === item.clave);
  if (entrada === undefined) {
    return;
  }
  const dia = entrada.mensual.dias.find((d) => d.fecha === item.fecha);
  const pares = dia?.marcaciones ?? [{}, {}, {}];
  edicion.value = { clave: item.clave, fecha: item.fecha };
  edicionCampos.value = {
    ingreso1: minutosAHhmm(pares[0]?.ingreso),
    salida1: minutosAHhmm(pares[0]?.salida),
    ingreso2: minutosAHhmm(pares[1]?.ingreso),
    salida2: minutosAHhmm(pares[1]?.salida),
    ingreso3: minutosAHhmm(pares[2]?.ingreso),
    salida3: minutosAHhmm(pares[2]?.salida),
  };
  edicionErrores.value = {};
}

function alCancelarCorreccion() {
  edicion.value = null;
  edicionErrores.value = {};
}

function alAplicarCorreccion() {
  if (edicion.value === null || workspace.value === null) {
    return;
  }
  const indice = entradas.value.findIndex((e) => e.clave === edicion.value?.clave);
  if (indice === -1) {
    return;
  }
  const entrada = entradas.value[indice];
  const resultado = corregirMarcaciones(
    entrada.mensual,
    edicion.value.fecha,
    edicionCampos.value,
  );
  if (!resultado.ok) {
    /** @type {Record<string, string>} */
    const mapa = {};
    for (const err of resultado.errores) {
      mapa[err.campo] = err.mensaje;
    }
    edicionErrores.value = mapa;
    return;
  }
  const fechaCorregida = edicion.value.fecha;
  const actualizada = recalcularEntrada(
    { ...entrada, mensual: resultado.archivo },
    workspace.value,
  );
  const copia = [...entradas.value];
  copia[indice] = actualizada;
  entradas.value = copia;
  edicion.value = null;
  edicionErrores.value = {};
  marcarOk(`Marcaciones de ${fechaCorregida} actualizadas (${horaActual()}).`);
}

async function alDescargarLibro() {
  if (workspace.value === null) {
    marcarError(new Error("No hay datos cargados."));
    return;
  }
  const meses = armarMesesParaLibro(
    entradas.value.map((e) => ({
      agente: e.agente,
      resultado: e.resultado,
      archivo: e.mensual,
    })),
  );
  if (meses.length === 0) {
    marcarError(new Error("No hay archivos con agente reconocido."));
    return;
  }
  try {
    const buffer = await generarLibro({
      meses,
      catalogo: workspace.value.catalogos,
    });
    const periodo = meses[0].resultado.periodo;
    const mm = String(periodo.mes).padStart(2, "0");
    const nombreArchivo = `${workspace.value.catalogos.nombre_libro} - ${mm}-${periodo.anio}.xlsx`;
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.click();
    URL.revokeObjectURL(url);
    marcarOk(`Libro descargado: ${nombreArchivo} (${horaActual()}).`);
  } catch (err) {
    marcarError(err);
  }
}

function alCargarEjemplo() {
  try {
    workspace.value = JSON.parse(JSON.stringify(workspaceSintetico));
    origen.value = "ejemplo en memoria";
    entradas.value = [];
    marcarOk(`Ejemplo sintético cargado en memoria (${horaActual()}).`);
  } catch (err) {
    marcarError(err);
  }
}

async function alGuardarEnCarpeta() {
  if (carpeta.value === null) {
    marcarError(new Error("No hay carpeta elegida. Use el paso 1 para elegir una."));
    return;
  }
  if (workspace.value === null) {
    marcarError(new Error("No hay datos cargados para guardar."));
    return;
  }
  try {
    const resultado = await escribirWorkspace(carpeta.value, workspace.value);
    marcarOk(`Datos guardados en la carpeta (${horaActual()}).`, {
      escritos: resultado.escritos,
    });
  } catch (err) {
    marcarError(err);
  }
}

/**
 * @param {number|null} minutos
 * @returns {string}
 */
function horaTexto(minutos) {
  if (minutos === null || minutos === undefined) {
    return "";
  }
  return formatearHM(minutos);
}

function cargarBorradoresDesdeWorkspace() {
  if (workspace.value === null) {
    return;
  }
  borradorAgentes.value = prepararAgentesParaEdicion(workspace.value.agentes);
  borradorCalendario.value = prepararCalendarioParaEdicion(workspace.value.calendario ?? {});
  borradorCatalogos.value = prepararCatalogoParaEdicion(workspace.value.catalogos);
  erroresConfig.value = [];
  vigenciaNuevaConfig.value = "";
  const primero = borradorAgentes.value.agentes[0];
  idAgenteSeleccionado.value = primero ? primero.id : null;
}

function alAbrirConfiguracion() {
  if (!configHabilitada.value) {
    return;
  }
  cargarBorradoresDesdeWorkspace();
  pestanaConfig.value = "agentes";
  vista.value = "config";
  limpiarListasArchivos();
  estadoTipo.value = "";
  estadoMensaje.value = "";
  errores.value = [];
}

function alVolverAlFlujo() {
  vista.value = "flujo";
  erroresConfig.value = [];
}

function alDescartarPestaña() {
  if (workspace.value === null) {
    return;
  }
  erroresConfig.value = [];
  if (pestanaConfig.value === "agentes") {
    borradorAgentes.value = prepararAgentesParaEdicion(workspace.value.agentes);
    const sel = idAgenteSeleccionado.value;
    if (sel !== null && !borradorAgentes.value.agentes.some((a) => a.id === sel)) {
      idAgenteSeleccionado.value = borradorAgentes.value.agentes[0]?.id ?? null;
    }
  } else if (pestanaConfig.value === "calendario") {
    borradorCalendario.value = prepararCalendarioParaEdicion(workspace.value.calendario ?? {});
  } else {
    borradorCatalogos.value = prepararCatalogoParaEdicion(workspace.value.catalogos);
  }
  marcarOk("Cambios de la pestaña descartados.");
}

async function alGuardarPestaña() {
  if (carpeta.value === null || workspace.value === null) {
    return;
  }
  erroresConfig.value = [];
  try {
    if (pestanaConfig.value === "agentes") {
      const validacion = validarEdicionAgentes(borradorAgentes.value);
      if (!validacion.ok) {
        erroresConfig.value = validacion.errores;
        return;
      }
      const datos = normalizarAgentesParaGuardar(borradorAgentes.value);
      const escrito = await escribirParteWorkspace(carpeta.value, "agentes", datos);
      workspace.value = { ...workspace.value, agentes: escrito.datos };
      borradorAgentes.value = prepararAgentesParaEdicion(escrito.datos);
      recalcularTodas(workspace.value);
      marcarOk("agentes.json guardado.", { escritos: escrito.escritos });
    } else if (pestanaConfig.value === "calendario") {
      const validacion = validarEdicionCalendario(borradorCalendario.value);
      if (!validacion.ok) {
        erroresConfig.value = validacion.errores;
        return;
      }
      const datos = normalizarCalendarioParaGuardar(borradorCalendario.value);
      const escrito = await escribirParteWorkspace(carpeta.value, "calendario", datos);
      workspace.value = { ...workspace.value, calendario: escrito.datos };
      borradorCalendario.value = prepararCalendarioParaEdicion(escrito.datos);
      recalcularTodas(workspace.value);
      marcarOk("calendario.json guardado.", { escritos: escrito.escritos });
    } else {
      const validacion = validarEdicionCatalogo(borradorCatalogos.value);
      if (!validacion.ok) {
        erroresConfig.value = validacion.errores;
        return;
      }
      const datos = normalizarCatalogoParaGuardar(borradorCatalogos.value);
      const escrito = await escribirParteWorkspace(carpeta.value, "catalogos", datos);
      workspace.value = { ...workspace.value, catalogos: escrito.datos };
      borradorCatalogos.value = prepararCatalogoParaEdicion(escrito.datos);
      recalcularTodas(workspace.value);
      marcarOk("catalogos.json guardado.", { escritos: escrito.escritos });
    }
  } catch (err) {
    marcarError(err);
    const detalle = /** @type {{ errores?: string[] }} */ (err);
    if (Array.isArray(detalle?.errores)) {
      erroresConfig.value = detalle.errores;
    }
  }
}

function alNuevoAgente() {
  if (borradorAgentes.value === null) {
    return;
  }
  const nuevo = crearAgenteNuevo(borradorAgentes.value.agentes);
  borradorAgentes.value = {
    ...borradorAgentes.value,
    agentes: [...borradorAgentes.value.agentes, nuevo],
  };
  idAgenteSeleccionado.value = nuevo.id;
  erroresConfig.value = [];
}

function alAgregarConfiguracion() {
  const agente = agenteSeleccionado.value;
  if (agente === null || borradorAgentes.value === null) {
    return;
  }
  const resultado = agregarNuevaConfiguracion(agente.configuraciones, vigenciaNuevaConfig.value);
  if (!resultado.ok) {
    erroresConfig.value = resultado.errores;
    return;
  }
  agente.configuraciones = resultado.configuraciones;
  vigenciaNuevaConfig.value = "";
  erroresConfig.value = [];
}

/**
 * @param {number} indice
 */
function alQuitarConfiguracion(indice) {
  const agente = agenteSeleccionado.value;
  if (agente === null || !Array.isArray(agente.configuraciones)) {
    return;
  }
  if (agente.configuraciones.length <= 1) {
    erroresConfig.value = ["Hace falta al menos una configuración."];
    return;
  }
  agente.configuraciones = agente.configuraciones.filter((_, i) => i !== indice);
  erroresConfig.value = [];
}

/**
 * @param {"feriados"|"asuetos"} lista
 */
function alAgregarFilaCalendario(lista) {
  if (borradorCalendario.value === null) {
    return;
  }
  const fila = { fecha: "", descripcion: "" };
  const actual = [...(borradorCalendario.value[lista] ?? []), fila];
  borradorCalendario.value = { ...borradorCalendario.value, [lista]: actual };
}

/**
 * @param {"feriados"|"asuetos"} lista
 * @param {number} indice
 */
function alQuitarFilaCalendario(lista, indice) {
  if (borradorCalendario.value === null) {
    return;
  }
  const actual = (borradorCalendario.value[lista] ?? []).filter((_, i) => i !== indice);
  borradorCalendario.value = { ...borradorCalendario.value, [lista]: actual };
}

</script>

<template>
  <main class="pantalla">
    <header class="cabecera">
      <div>
        <h1>Horas extras</h1>
        <p class="fase">{{ vista === 'config' ? 'Configuración' : 'Flujo mensual (fase 8)' }}</p>
      </div>
      <div class="cabecera-acciones">
        <button
          v-if="vista === 'flujo'"
          type="button"
          :disabled="!configHabilitada"
          @click="alAbrirConfiguracion"
        >
          Configuración
        </button>
        <button
          v-else
          type="button"
          @click="alVolverAlFlujo"
        >
          Volver al flujo
        </button>
      </div>
    </header>

    <p v-if="!tieneFsa" class="aviso">
      Este navegador no tiene showDirectoryPicker. Se requiere Edge o Chrome.
    </p>

    <section v-if="estadoTipo" class="estado" :class="estadoTipo">
      <p class="estado-mensaje">{{ estadoMensaje }}</p>
      <ul v-if="errores.length > 0" class="lista-errores">
        <li v-for="(item, i) in errores" :key="i">{{ item }}</li>
      </ul>
    </section>

    <div v-if="vista === 'config'" class="vista-config">
      <nav class="pestanas">
        <button
          type="button"
          :class="{ activa: pestanaConfig === 'agentes' }"
          @click="pestanaConfig = 'agentes'; erroresConfig = []"
        >
          Agentes
        </button>
        <button
          type="button"
          :class="{ activa: pestanaConfig === 'calendario' }"
          @click="pestanaConfig = 'calendario'; erroresConfig = []"
        >
          Calendario
        </button>
        <button
          type="button"
          :class="{ activa: pestanaConfig === 'catalogo' }"
          @click="pestanaConfig = 'catalogo'; erroresConfig = []"
        >
          Catálogo
        </button>
      </nav>

      <ul v-if="erroresConfig.length > 0" class="lista-errores errores-config">
        <li v-for="(item, i) in erroresConfig" :key="'cfg-' + i">{{ item }}</li>
      </ul>

      <div class="acciones">
        <button type="button" @click="alGuardarPestaña">Guardar</button>
        <button type="button" @click="alDescartarPestaña">Descartar</button>
      </div>

      <section v-if="pestanaConfig === 'agentes'" class="panel-config">
        <div class="lista-agentes">
          <button type="button" @click="alNuevoAgente">Nuevo agente</button>
          <ul>
            <li
              v-for="ag in listaAgentesBorrador"
              :key="ag.id"
              :class="{ seleccionado: ag.id === idAgenteSeleccionado }"
            >
              <button type="button" class="enlace-agente" @click="idAgenteSeleccionado = ag.id">
                {{ ag.legajo || "(sin legajo)" }} — {{ ag.nombre || "(sin nombre)" }}
                <span class="meta">reloj: {{ ag.nombre_reloj || "—" }} · {{ ag.activo ? "activo" : "inactivo" }}</span>
              </button>
            </li>
          </ul>
        </div>

        <div v-if="agenteSeleccionado" class="detalle-agente">
          <p class="hint">Id: {{ agenteSeleccionado.id }} (no editable)</p>
          <div class="campos-form">
            <label>
              Legajo
              <input v-model="agenteSeleccionado.legajo" type="text">
            </label>
            <label>
              DNI
              <input v-model="agenteSeleccionado.dni" type="text">
            </label>
            <label>
              Nombre
              <input v-model="agenteSeleccionado.nombre" type="text">
            </label>
            <label>
              Nombre reloj
              <input v-model="agenteSeleccionado.nombre_reloj" type="text">
            </label>
            <label class="check">
              <input v-model="agenteSeleccionado.activo" type="checkbox">
              Activo
            </label>
          </div>

          <h3>Configuraciones</h3>
          <div class="acciones">
            <label>
              Vigencia desde (nueva)
              <input v-model="vigenciaNuevaConfig" type="text" placeholder="AAAA-MM-DD">
            </label>
            <button type="button" @click="alAgregarConfiguracion">Nueva configuración</button>
          </div>

          <div
            v-for="(cfg, ic) in agenteSeleccionado.configuraciones"
            :key="agenteSeleccionado.id + '-cfg-' + ic"
            class="bloque-config"
          >
            <div class="acciones">
              <strong>Configuración {{ ic + 1 }}</strong>
              <button type="button" @click="alQuitarConfiguracion(ic)">Quitar</button>
            </div>
            <div class="campos-form">
              <label>
                vigencia_desde
                <input v-model="cfg.vigencia_desde" type="text" placeholder="AAAA-MM-DD">
              </label>
              <label>
                vigencia_hasta
                <input v-model="cfg.vigencia_hasta" type="text" placeholder="AAAA-MM-DD o vacío">
              </label>
              <label>
                horario_inicio
                <input v-model="cfg.horario_inicio" type="text" placeholder="HH:MM">
              </label>
              <label>
                horario_fin
                <input v-model="cfg.horario_fin" type="text" placeholder="HH:MM">
              </label>
              <label>
                duracion_jornada
                <input v-model="cfg.duracion_jornada" type="text" placeholder="HH:MM">
              </label>
              <label>
                tope_extra_habil
                <input v-model="cfg.tope_extra_habil" type="text" placeholder="HH:MM">
              </label>
              <label>
                sabado_inicio
                <input v-model="cfg.sabado_inicio" type="text" placeholder="HH:MM o vacío">
              </label>
              <label>
                sabado_fin
                <input v-model="cfg.sabado_fin" type="text" placeholder="HH:MM o vacío">
              </label>
              <label>
                sabado_tope
                <input v-model="cfg.sabado_tope" type="text" placeholder="HH:MM">
              </label>
              <label>
                tope_feriado
                <input v-model="cfg.tope_feriado" type="text" placeholder="HH:MM">
              </label>
              <label>
                tope_asueto
                <input v-model="cfg.tope_asueto" type="text" placeholder="HH:MM">
              </label>
              <label>
                tope_lao_receso
                <input v-model="cfg.tope_lao_receso" type="text" placeholder="HH:MM">
              </label>
              <label>
                valor_hora_base
                <input v-model="cfg.valor_hora_base" type="text">
              </label>
            </div>
          </div>
        </div>
        <p v-else class="hint">Elegí un agente o creá uno nuevo.</p>
      </section>

      <section v-else-if="pestanaConfig === 'calendario'" class="panel-config">
        <div class="lista-cal">
          <h3>Feriados</h3>
          <button type="button" @click="alAgregarFilaCalendario('feriados')">Agregar feriado</button>
          <div
            v-for="(fila, i) in (borradorCalendario?.feriados ?? [])"
            :key="'fe-' + i"
            class="fila-cal"
          >
            <input v-model="fila.fecha" type="text" placeholder="AAAA-MM-DD">
            <input v-model="fila.descripcion" type="text" placeholder="Descripción">
            <button type="button" @click="alQuitarFilaCalendario('feriados', i)">Quitar</button>
          </div>
        </div>
        <div class="lista-cal">
          <h3>Asuetos</h3>
          <p class="hint">Los paros se cargan como asuetos.</p>
          <button type="button" @click="alAgregarFilaCalendario('asuetos')">Agregar asueto</button>
          <div
            v-for="(fila, i) in (borradorCalendario?.asuetos ?? [])"
            :key="'as-' + i"
            class="fila-cal"
          >
            <input v-model="fila.fecha" type="text" placeholder="AAAA-MM-DD">
            <input v-model="fila.descripcion" type="text" placeholder="Descripción">
            <button type="button" @click="alQuitarFilaCalendario('asuetos', i)">Quitar</button>
          </div>
        </div>
      </section>

      <section v-else class="panel-config">
        <div v-if="borradorCatalogos" class="campos-form">
          <label>
            umbral_minimo
            <input v-model="borradorCatalogos.umbral_minimo" type="text" placeholder="HH:MM">
          </label>
          <label>
            nombre_libro
            <input v-model="borradorCatalogos.nombre_libro" type="text">
          </label>
          <label>
            horas_maximas
            <input v-model="borradorCatalogos.horas_maximas" type="text" placeholder="vacío = sin control">
          </label>
        </div>
        <p class="hint">Las justificaciones y permisos no se editan en pantalla.</p>
      </section>
    </div>

    <div v-else>
    <section class="paso" :class="{ deshabilitado: !tieneFsa }">
      <h2>1. Carpeta de datos</h2>
      <button type="button" :disabled="!tieneFsa" @click="alElegirCarpeta">
        Elegir carpeta
      </button>
      <p v-if="nombreCarpeta" class="carpeta">
        Carpeta elegida: <strong>{{ nombreCarpeta }}</strong>
      </p>
    </section>

    <section class="paso" :class="{ deshabilitado: !paso1Hecho }">
      <h2>2. Excel mensuales</h2>
      <button type="button" :disabled="!paso1Hecho" @click="alPedirExcel">
        Elegir archivos Excel
      </button>
      <input
        ref="inputExcel"
        class="oculto"
        type="file"
        multiple
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        @change="alLeerExcels"
      >
      <p v-if="entradas.length > 0" class="hint">
        {{ entradas.length }} archivo(s) cargado(s).
      </p>
    </section>

    <section class="paso" :class="{ deshabilitado: !paso2Hecho }">
      <h2>3. Resultado</h2>
      <ul v-if="paso2Hecho" class="lista-entradas">
        <li v-for="entrada in entradas" :key="entrada.clave" class="entrada">
          <div>
            <strong>{{ entrada.nombreArchivo }}</strong>
            — nombre en Excel: {{ entrada.mensual.nombre }}
          </div>
          <div v-if="entrada.agente">
            Agente: {{ entrada.agente.nombre }}
            (legajo {{ entrada.agente.legajo }})
          </div>
          <div v-else class="asociar">
            Sin agente reconocido.
            <label>
              Asociar a:
              <select
                :disabled="!paso1Hecho"
                @change="alAsociarAgente(entrada, $event)"
              >
                <option value="">Elegir…</option>
                <option
                  v-for="ag in agentes"
                  :key="ag.id"
                  :value="ag.id"
                >
                  {{ ag.nombre }} ({{ ag.nombre_reloj }})
                </option>
              </select>
            </label>
          </div>
        </li>
      </ul>

      <div v-if="listaRevisar.length > 0" class="revisar">
        <h3>Días a revisar</h3>
        <ul class="lista-revisar">
          <li v-for="(item, i) in listaRevisar" :key="i" class="item-revisar">
            <div class="item-revisar-cabecera">
              <span>{{ item.agente }} — {{ item.fecha }}: {{ item.texto }}</span>
              <button
                type="button"
                :disabled="!item.clave"
                @click="alAbrirCorreccion(item)"
              >
                Corregir
              </button>
            </div>
            <div
              v-if="edicion && edicion.clave === item.clave && edicion.fecha === item.fecha"
              class="form-correccion"
            >
              <div class="campos-marca">
                <label>
                  Ingreso 1
                  <input v-model="edicionCampos.ingreso1" type="text" placeholder="HH:MM">
                  <span v-if="edicionErrores.ingreso1" class="err-campo">{{ edicionErrores.ingreso1 }}</span>
                </label>
                <label>
                  Salida 1
                  <input v-model="edicionCampos.salida1" type="text" placeholder="HH:MM">
                  <span v-if="edicionErrores.salida1" class="err-campo">{{ edicionErrores.salida1 }}</span>
                </label>
                <label>
                  Ingreso 2
                  <input v-model="edicionCampos.ingreso2" type="text" placeholder="HH:MM">
                  <span v-if="edicionErrores.ingreso2" class="err-campo">{{ edicionErrores.ingreso2 }}</span>
                </label>
                <label>
                  Salida 2
                  <input v-model="edicionCampos.salida2" type="text" placeholder="HH:MM">
                  <span v-if="edicionErrores.salida2" class="err-campo">{{ edicionErrores.salida2 }}</span>
                </label>
                <label>
                  Ingreso 3
                  <input v-model="edicionCampos.ingreso3" type="text" placeholder="HH:MM">
                  <span v-if="edicionErrores.ingreso3" class="err-campo">{{ edicionErrores.ingreso3 }}</span>
                </label>
                <label>
                  Salida 3
                  <input v-model="edicionCampos.salida3" type="text" placeholder="HH:MM">
                  <span v-if="edicionErrores.salida3" class="err-campo">{{ edicionErrores.salida3 }}</span>
                </label>
              </div>
              <div class="acciones">
                <button type="button" @click="alAplicarCorreccion">Aplicar</button>
                <button type="button" @click="alCancelarCorreccion">Cancelar</button>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <section class="paso" :class="{ deshabilitado: !paso2Hecho }">
      <h2>4. Descargar libro</h2>
      <button
        type="button"
        :disabled="!hayReconocidos"
        @click="alDescargarLibro"
      >
        Descargar libro
      </button>
      <p v-if="paso2Hecho && !hayReconocidos" class="hint">
        Hace falta al menos un archivo con agente reconocido.
      </p>
    </section>

    <details class="diagnostico">
      <summary>Diagnóstico</summary>
      <div class="acciones">
        <button type="button" @click="alCargarEjemplo">Cargar ejemplo</button>
        <button type="button" @click="alGuardarEnCarpeta">Guardar en carpeta</button>
      </div>

      <section v-if="archivosLeidos.length || archivosFaltantes.length || archivosEscritos.length" class="archivos">
        <h3>Archivos de la última operación</h3>
        <div v-if="archivosEscritos.length > 0">
          <p>Escritos:</p>
          <ul>
            <li v-for="nombre in archivosEscritos" :key="'e-' + nombre">{{ nombre }}</li>
          </ul>
        </div>
        <div v-if="archivosLeidos.length > 0">
          <p>Leídos:</p>
          <ul>
            <li v-for="nombre in archivosLeidos" :key="'l-' + nombre">{{ nombre }}</li>
          </ul>
        </div>
        <div v-if="archivosFaltantes.length > 0">
          <p>Faltantes:</p>
          <ul>
            <li v-for="nombre in archivosFaltantes" :key="'f-' + nombre">{{ nombre }}</li>
          </ul>
        </div>
      </section>

      <section v-if="resumen" class="resumen">
        <h3>Resumen del workspace</h3>
        <p class="origen">Origen: {{ origen }}</p>
        <ul>
          <li>Agentes: {{ resumen.agentes }}</li>
          <li>Feriados: {{ resumen.feriados }}</li>
          <li>Asuetos: {{ resumen.asuetos }}</li>
          <li>Justificaciones: {{ resumen.justificaciones }}</li>
          <li>Permisos: {{ resumen.permisos }}</li>
          <li>Nombre del libro: {{ resumen.nombre_libro }}</li>
          <li>Horas máximas: {{ textoOGuion(resumen.horas_maximas) }}</li>
        </ul>

        <h4>Agentes</h4>
        <div v-for="(agente, ia) in agentes" :key="'a-' + ia" class="bloque">
          <p>
            <strong>{{ agente.nombre }}</strong>
            — reloj: {{ textoOGuion(agente.nombre_reloj) }}
          </p>
          <div
            v-for="(cfg, ic) in (agente.configuraciones ?? [])"
            :key="'c-' + ia + '-' + ic"
            class="config"
          >
            <p>
              Vigencia: {{ textoOGuion(cfg.vigencia_desde) }}
              → {{ textoOGuion(cfg.vigencia_hasta) }}
            </p>
            <ul>
              <li>Horario: {{ cfg.horario_inicio }} – {{ cfg.horario_fin }}</li>
              <li>Duración jornada: {{ cfg.duracion_jornada }}</li>
              <li>Tope hábil: {{ cfg.tope_extra_habil }}</li>
              <li>Valor hora: {{ cfg.valor_hora_base }}</li>
            </ul>
          </div>
        </div>

        <h4>Feriados</h4>
        <ul>
          <li v-for="(feriado, ife) in feriados" :key="'fe-' + ife">
            {{ feriado.fecha }} — {{ feriado.descripcion }}
          </li>
        </ul>

        <h4>Asuetos</h4>
        <ul>
          <li v-for="(asueto, ia) in asuetos" :key="'as-' + ia">
            {{ asueto.fecha }}
            <template v-if="asueto.descripcion"> — {{ asueto.descripcion }}</template>
          </li>
        </ul>
      </section>

      <section v-if="entradas.length > 0" class="mensual">
        <h3>Detalle de Excel leídos</h3>
        <div v-for="entrada in entradas" :key="'d-' + entrada.clave" class="bloque">
          <p>
            <strong>{{ entrada.nombreArchivo }}</strong>
            — {{ entrada.mensual.nombre }}
            — {{ entrada.mensual.periodo.anio }}-{{ String(entrada.mensual.periodo.mes).padStart(2, "0") }}
            — {{ entrada.mensual.dias.length }} días
          </p>
          <div class="tabla-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Ing.1</th>
                  <th>Sal.1</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="dia in entrada.mensual.dias" :key="dia.fecha">
                  <td>{{ dia.fecha }}</td>
                  <td>{{ horaTexto(dia.marcaciones[0].ingreso) }}</td>
                  <td>{{ horaTexto(dia.marcaciones[0].salida) }}</td>
                  <td>{{ dia.observacion }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </details>
    </div>
  </main>
</template>

<style scoped>
.pantalla {
  font-family: sans-serif;
  max-width: 52rem;
  margin: 1.5rem auto;
  padding: 0 1rem 2rem;
}
.cabecera {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}
.cabecera h1 {
  margin: 0;
}
.cabecera-acciones {
  display: flex;
  gap: 0.4rem;
}
.fase {
  color: #444;
  margin-top: 0.25rem;
}
.pestanas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.75rem 0;
}
.pestanas button.activa {
  font-weight: bold;
  border-color: #333;
}
.errores-config {
  color: #800;
  background: #fff5f5;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e0a0a0;
}
.panel-config {
  margin-top: 0.75rem;
}
.lista-agentes ul {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0;
}
.lista-agentes li {
  margin: 0.25rem 0;
}
.lista-agentes li.seleccionado .enlace-agente {
  font-weight: bold;
  background: #f0f0f0;
}
.enlace-agente {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.35rem 0.5rem;
}
.enlace-agente .meta {
  display: block;
  font-size: 0.8rem;
  font-weight: normal;
  color: #555;
}
.campos-form {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 0.5rem;
  margin: 0.5rem 0 1rem;
}
.campos-form label {
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
  gap: 0.15rem;
}
.campos-form input[type="text"] {
  padding: 0.25rem;
}
.campos-form label.check {
  flex-direction: row;
  align-items: center;
  gap: 0.35rem;
}
.bloque-config {
  margin: 0.75rem 0;
  padding: 0.5rem;
  border: 1px solid #ddd;
}
.lista-cal {
  margin-bottom: 1.25rem;
}
.fila-cal {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.35rem 0;
}
.fila-cal input {
  flex: 1 1 8rem;
  padding: 0.25rem;
}
.paso {
  margin: 1.25rem 0;
  padding: 0.75rem 0;
  border-top: 1px solid #ddd;
}
.paso.deshabilitado {
  opacity: 0.45;
  pointer-events: none;
}
.paso h2 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
}
.acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.75rem 0;
}
button:disabled {
  opacity: 0.5;
}
.aviso {
  color: #555;
}
.carpeta,
.hint {
  margin: 0.5rem 0 0;
}
.estado {
  margin: 1rem 0;
  padding: 0.75rem;
  border: 1px solid #ccc;
}
.estado.ok {
  color: #065;
  background: #f3fff6;
  border-color: #9c9;
}
.estado.error {
  color: #800;
  background: #fff5f5;
  border-color: #e0a0a0;
}
.estado.neutro {
  color: #333;
  background: #f5f5f5;
  border-color: #bbb;
}
.estado-mensaje {
  margin: 0;
  font-weight: bold;
}
.lista-errores {
  margin: 0.5rem 0 0;
}
.lista-entradas {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0;
}
.entrada {
  margin: 0.5rem 0;
  padding: 0.5rem;
  border: 1px solid #ddd;
}
.asociar {
  margin-top: 0.35rem;
}
.revisar {
  margin-top: 1rem;
}
.revisar h3 {
  margin: 0 0 0.35rem;
  font-size: 1rem;
}
.lista-revisar {
  list-style: none;
  padding: 0;
}
.item-revisar {
  margin: 0.5rem 0;
  padding: 0.5rem;
  border: 1px solid #ddd;
}
.item-revisar-cabecera {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
}
.form-correccion {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px dashed #ccc;
}
.campos-marca {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: 0.5rem;
}
.campos-marca label {
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
  gap: 0.15rem;
}
.campos-marca input {
  padding: 0.25rem;
}
.err-campo {
  color: #800;
  font-size: 0.75rem;
}
.archivos ul,
.resumen ul,
.revisar ul {
  margin: 0.25rem 0 0.75rem;
  padding-left: 1.25rem;
}
.origen {
  font-style: italic;
}
.oculto {
  display: none;
}
.diagnostico {
  margin-top: 2rem;
  padding-top: 0.75rem;
  border-top: 1px solid #ccc;
}
.diagnostico summary {
  cursor: pointer;
  font-weight: bold;
}
.tabla-wrap {
  overflow-x: auto;
}
.mensual table {
  border-collapse: collapse;
  font-size: 0.85rem;
  width: 100%;
}
.mensual th,
.mensual td {
  border: 1px solid #ccc;
  padding: 0.2rem 0.4rem;
  text-align: left;
  white-space: nowrap;
}
.bloque {
  margin-bottom: 1rem;
}
.config {
  margin: 0.5rem 0 0.75rem 0.75rem;
  padding-left: 0.5rem;
  border-left: 2px solid #ddd;
}
</style>
