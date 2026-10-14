<script setup>
import { computed, ref } from "vue";
import { workspaceSintetico } from "../datos/ejemploSintetico.js";
import {
  abrirCarpetaTrabajo,
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
    workspace.value = structuredClone(workspaceSintetico);
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
</script>

<template>
  <main class="pantalla">
    <h1>Horas extras</h1>
    <p class="fase">Flujo mensual (fase 8A)</p>

    <p v-if="!tieneFsa" class="aviso">
      Este navegador no tiene showDirectoryPicker. Se requiere Edge o Chrome.
    </p>

    <section v-if="estadoTipo" class="estado" :class="estadoTipo">
      <p class="estado-mensaje">{{ estadoMensaje }}</p>
      <ul v-if="errores.length > 0" class="lista-errores">
        <li v-for="(item, i) in errores" :key="i">{{ item }}</li>
      </ul>
    </section>

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
  </main>
</template>

<style scoped>
.pantalla {
  font-family: sans-serif;
  max-width: 46rem;
  margin: 1.5rem auto;
  padding: 0 1rem 2rem;
}
.fase {
  color: #444;
  margin-top: 0;
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
