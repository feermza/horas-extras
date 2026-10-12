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
import { leerArchivoMensual } from "../excel/importarMensual.js";
import { formatearHM } from "../motor/tiempo.js";

/** @typedef {"ok"|"error"|"neutro"|""} EstadoTipo */

/** @type {import("vue").Ref<import("../datos/persistencia.js").Workspace|null>} */
const workspace = ref(null);
/** @type {import("vue").Ref<FileSystemDirectoryHandle|null>} */
const carpeta = ref(null);
const nombreCarpeta = ref("");
/** origen de los datos del resumen */
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
/** @type {import("vue").Ref<Awaited<ReturnType<typeof leerArchivoMensual>>|null>} */
const mensual = ref(null);
const inputExcel = ref(/** @type {HTMLInputElement|null} */ (null));

const resumen = computed(() => (
  workspace.value === null ? null : resumenWorkspace(workspace.value)
));
const agentes = computed(() => workspace.value?.agentes?.agentes ?? []);
const feriados = computed(() => workspace.value?.calendario?.feriados ?? []);
const eventos = computed(() => workspace.value?.eventos?.eventos ?? []);
const tieneFsa = soportaFileSystemAccess();
const hayCarpeta = computed(() => carpeta.value !== null);
const hayDatos = computed(() => workspace.value !== null);
const hayListaArchivos = computed(() => (
  archivosLeidos.value.length > 0
  || archivosFaltantes.value.length > 0
  || archivosEscritos.value.length > 0
));

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
 * Acepta cualquier valor rechazado (Error u otro) y lo muestra en la zona de estado.
 *
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

async function alElegirCarpeta() {
  try {
    const handle = await abrirCarpetaTrabajo();
    carpeta.value = handle;
    nombreCarpeta.value = handle.name;
    marcarOk(`Carpeta elegida: ${handle.name} (${horaActual()}).`);
  } catch (err) {
    if (esCancelacion(err)) {
      marcarNeutro("Operación cancelada");
      return;
    }
    marcarError(err);
  }
}

async function alLeerCarpeta() {
  if (carpeta.value === null) {
    marcarError(new Error("No hay carpeta elegida."));
    return;
  }
  try {
    const resultado = await leerWorkspace(carpeta.value);
    workspace.value = resultado.workspace;
    origen.value = `leído de la carpeta ${nombreCarpeta.value}`;
    marcarOk(`Carpeta leída y validada (${horaActual()}).`, {
      leidos: resultado.leidos,
      faltantes: resultado.faltantes,
    });
  } catch (err) {
    // Cualquier excepción: el workspace anterior se conserva intacto.
    marcarError(err);
  }
}

async function alGuardar() {
  if (workspace.value === null) {
    marcarError(new Error("No hay datos cargados."));
    return;
  }
  if (carpeta.value === null) {
    marcarError(new Error("No hay carpeta elegida."));
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

function alCargarEjemplo() {
  try {
    workspace.value = structuredClone(workspaceSintetico);
    origen.value = "ejemplo en memoria";
    marcarOk(`Ejemplo sintético cargado en memoria (${horaActual()}).`);
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

function alPedirExcel() {
  inputExcel.value?.click();
}

/**
 * @param {Event} evento
 */
async function alLeerExcel(evento) {
  const input = /** @type {HTMLInputElement} */ (evento.target);
  const archivo = input.files?.[0];
  input.value = "";
  if (archivo === undefined) {
    marcarNeutro("Operación cancelada");
    return;
  }
  try {
    const buffer = await archivo.arrayBuffer();
    mensual.value = await leerArchivoMensual(buffer);
    marcarOk(
      `Excel mensual leído (${horaActual()}): ${mensual.value.nombre}, `
      + `${mensual.value.periodo.anio}-${String(mensual.value.periodo.mes).padStart(2, "0")}, `
      + `${mensual.value.dias.length} días.`,
    );
  } catch (err) {
    marcarError(err);
  }
}
</script>

<template>
  <main class="pantalla">
    <h1>Horas extras</h1>
    <p class="fase">Diagnóstico — fases 5 y 6 (no es la interfaz final)</p>

    <div class="acciones">
      <button type="button" @click="alCargarEjemplo">Cargar ejemplo</button>
      <button type="button" :disabled="!tieneFsa" @click="alElegirCarpeta">
        Elegir carpeta
      </button>
      <button type="button" :disabled="!tieneFsa || !hayCarpeta" @click="alLeerCarpeta">
        Leer carpeta
      </button>
      <button
        type="button"
        :disabled="!tieneFsa || !hayCarpeta || !hayDatos"
        @click="alGuardar"
      >
        Guardar en carpeta
      </button>
      <button type="button" @click="alPedirExcel">Leer Excel mensual</button>
      <input
        ref="inputExcel"
        class="oculto"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        @change="alLeerExcel"
      >
    </div>

    <p v-if="!tieneFsa" class="aviso">
      Este navegador no tiene showDirectoryPicker. Los botones de carpeta están
      deshabilitados. La aplicación requiere Edge o Chrome.
    </p>

    <p v-if="hayCarpeta" class="carpeta">
      Carpeta elegida: <strong>{{ nombreCarpeta }}</strong>
    </p>

    <section v-if="estadoTipo" class="estado" :class="estadoTipo">
      <p class="estado-mensaje">{{ estadoMensaje }}</p>
      <ul v-if="errores.length > 0" class="lista-errores">
        <li v-for="(item, i) in errores" :key="i">{{ item }}</li>
      </ul>
    </section>

    <section v-if="hayListaArchivos" class="archivos">
      <h2>Archivos de la última operación</h2>
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

    <section v-if="mensual" class="mensual">
      <h2>Excel mensual</h2>
      <p>
        Nombre: <strong>{{ mensual.nombre }}</strong>
        — Período: {{ mensual.periodo.anio }}-{{ String(mensual.periodo.mes).padStart(2, "0") }}
        — Días: {{ mensual.dias.length }}
      </p>
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Ing.1</th>
              <th>Sal.1</th>
              <th>Ing.2</th>
              <th>Sal.2</th>
              <th>Ing.3</th>
              <th>Sal.3</th>
              <th>Observación</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="dia in mensual.dias" :key="dia.fecha">
              <td>{{ dia.fecha }}</td>
              <td>{{ horaTexto(dia.marcaciones[0].ingreso) }}</td>
              <td>{{ horaTexto(dia.marcaciones[0].salida) }}</td>
              <td>{{ horaTexto(dia.marcaciones[1].ingreso) }}</td>
              <td>{{ horaTexto(dia.marcaciones[1].salida) }}</td>
              <td>{{ horaTexto(dia.marcaciones[2].ingreso) }}</td>
              <td>{{ horaTexto(dia.marcaciones[2].salida) }}</td>
              <td>{{ dia.observacion }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="resumen" class="resumen">
      <h2>Resumen del workspace</h2>
      <p class="origen">Origen: {{ origen }}</p>
      <ul>
        <li>Agentes: {{ resumen.agentes }}</li>
        <li>Feriados: {{ resumen.feriados }}</li>
        <li>Eventos: {{ resumen.eventos }}</li>
        <li>Justificaciones: {{ resumen.justificaciones }}</li>
        <li>Permisos: {{ resumen.permisos }}</li>
        <li>Nombre del libro: {{ resumen.nombre_libro }}</li>
        <li>Horas máximas: {{ textoOGuion(resumen.horas_maximas) }}</li>
      </ul>

      <h3>Agentes</h3>
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
            <li>Tope feriado: {{ cfg.tope_feriado }}</li>
            <li>Tope asueto: {{ cfg.tope_asueto }}</li>
            <li>Tope paro: {{ cfg.tope_paro }}</li>
            <li>Tope LAO/receso: {{ cfg.tope_lao_receso }}</li>
            <li>
              Sábado: {{ textoOGuion(cfg.sabado_inicio) }}
              – {{ textoOGuion(cfg.sabado_fin) }}
              (tope {{ cfg.sabado_tope }})
            </li>
            <li>Valor hora: {{ cfg.valor_hora_base }}</li>
          </ul>
        </div>
      </div>

      <h3>Feriados</h3>
      <ul>
        <li v-for="(feriado, ife) in feriados" :key="'fe-' + ife">
          {{ feriado.fecha }} — {{ feriado.descripcion }}
        </li>
      </ul>

      <h3>Eventos</h3>
      <ul>
        <li v-for="(evento, ie) in eventos" :key="'ev-' + ie">
          {{ evento.fecha }} — {{ evento.tipo }}
          <template v-if="evento.descripcion"> — {{ evento.descripcion }}</template>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.pantalla {
  font-family: sans-serif;
  max-width: 46rem;
  margin: 1.5rem auto;
  padding: 0 1rem;
}
.fase {
  color: #444;
  margin-top: 0;
}
.acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 1rem 0;
}
button:disabled {
  opacity: 0.5;
}
.aviso {
  color: #555;
}
.carpeta {
  margin: 0.5rem 0;
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
.archivos ul,
.resumen ul {
  margin: 0.25rem 0 0.75rem;
  padding-left: 1.25rem;
}
.origen {
  font-style: italic;
}
.oculto {
  display: none;
}
.tabla-wrap {
  overflow-x: auto;
}
.mensual table {
  border-collapse: collapse;
  font-size: 0.9rem;
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
  padding-left: 0.25rem;
}
.config {
  margin: 0.5rem 0 0.75rem 0.75rem;
  padding-left: 0.5rem;
  border-left: 2px solid #ddd;
}
</style>
