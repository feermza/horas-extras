<script setup>
import { computed, ref } from "vue";
import { ARCHIVOS } from "../datos/esquemas.js";
import { workspaceSintetico } from "../datos/ejemploSintetico.js";
import {
  abrirCarpetaTrabajo,
  escribirWorkspace,
  leerWorkspace,
  resumenWorkspace,
  soportaFileSystemAccess,
  textosDesdeWorkspace,
  workspaceDesdeTextos,
} from "../datos/persistencia.js";

/** @type {import("vue").Ref<import("../datos/persistencia.js").Workspace|null>} */
const workspace = ref(null);
/** @type {import("vue").Ref<FileSystemDirectoryHandle|null>} */
const carpeta = ref(null);
const mensaje = ref("");
const error = ref("");
const inputImportar = ref(/** @type {HTMLInputElement|null} */ (null));

const resumen = computed(() => (
  workspace.value === null ? null : resumenWorkspace(workspace.value)
));
const tieneFsa = soportaFileSystemAccess();

/**
 * @param {string} texto
 */
function ok(texto) {
  mensaje.value = texto;
  error.value = "";
}

/**
 * @param {unknown} err
 */
function fallar(err) {
  mensaje.value = "";
  error.value = err instanceof Error ? err.message : String(err);
}

async function alElegirCarpeta() {
  try {
    const handle = await abrirCarpetaTrabajo();
    carpeta.value = handle;
    workspace.value = await leerWorkspace(handle);
    ok("Carpeta abierta y datos leídos.");
  } catch (err) {
    fallar(err);
  }
}

async function alGuardar() {
  if (workspace.value === null) {
    fallar(new Error("No hay datos cargados."));
    return;
  }
  if (carpeta.value === null) {
    fallar(new Error("No hay carpeta elegida. Exportá los JSON o elegí una carpeta."));
    return;
  }
  try {
    await escribirWorkspace(carpeta.value, workspace.value);
    ok("Datos guardados en la carpeta.");
  } catch (err) {
    fallar(err);
  }
}

function alCargarEjemplo() {
  try {
    workspace.value = structuredClone(workspaceSintetico);
    ok("Ejemplo sintético cargado en memoria.");
  } catch (err) {
    fallar(err);
  }
}

function alExportar() {
  if (workspace.value === null) {
    fallar(new Error("No hay datos para exportar."));
    return;
  }
  try {
    const textos = textosDesdeWorkspace(workspace.value);
    for (const [clave, nombre] of Object.entries(ARCHIVOS)) {
      const blob = new Blob([textos[clave]], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      URL.revokeObjectURL(url);
    }
    ok("Se descargaron los cinco JSON.");
  } catch (err) {
    fallar(err);
  }
}

function alPedirImportar() {
  inputImportar.value?.click();
}

/**
 * @param {Event} evento
 */
async function alImportar(evento) {
  const input = /** @type {HTMLInputElement} */ (evento.target);
  const archivos = Array.from(input.files ?? []);
  input.value = "";
  if (archivos.length === 0) {
    return;
  }
  try {
    /** @type {Partial<Record<keyof typeof ARCHIVOS, string>>} */
    const textos = {};
    for (const archivo of archivos) {
      const clave = /** @type {keyof typeof ARCHIVOS|undefined} */ (
        Object.entries(ARCHIVOS).find(([, nombre]) => nombre === archivo.name)?.[0]
      );
      if (clave === undefined) {
        throw new Error(`Archivo no reconocido: ${archivo.name}`);
      }
      textos[clave] = await archivo.text();
    }
    for (const clave of Object.keys(ARCHIVOS)) {
      if (typeof textos[clave] !== "string") {
        throw new Error(`Falta ${ARCHIVOS[clave]} en la selección.`);
      }
    }
    workspace.value = workspaceDesdeTextos(
      /** @type {Record<keyof typeof ARCHIVOS, string>} */ (textos),
    );
    ok("JSON importados y validados.");
  } catch (err) {
    fallar(err);
  }
}
</script>

<template>
  <main class="pantalla">
    <h1>Horas extras</h1>
    <p class="fase">Fase 5 — persistencia JSON (pantalla mínima)</p>

    <div class="acciones">
      <button type="button" @click="alCargarEjemplo">Cargar ejemplo</button>
      <button type="button" :disabled="!tieneFsa" @click="alElegirCarpeta">
        Elegir carpeta
      </button>
      <button type="button" :disabled="workspace === null || carpeta === null" @click="alGuardar">
        Guardar en carpeta
      </button>
      <button type="button" :disabled="workspace === null" @click="alExportar">
        Exportar JSON
      </button>
      <button type="button" @click="alPedirImportar">Importar JSON</button>
      <input
        ref="inputImportar"
        class="oculto"
        type="file"
        accept="application/json,.json"
        multiple
        @change="alImportar"
      >
    </div>

    <p v-if="!tieneFsa" class="aviso">
      Este navegador no ofrece elección de carpeta. Usá exportar e importar JSON.
    </p>

    <p v-if="mensaje" class="ok">{{ mensaje }}</p>
    <pre v-if="error" class="error">{{ error }}</pre>

    <section v-if="resumen" class="resumen">
      <h2>Resumen del workspace</h2>
      <ul>
        <li>Agentes: {{ resumen.agentes }}</li>
        <li>Grupos: {{ resumen.grupos }}</li>
        <li>Feriados: {{ resumen.feriados }}</li>
        <li>Eventos: {{ resumen.eventos }}</li>
        <li>Justificaciones: {{ resumen.justificaciones }}</li>
        <li>Permisos: {{ resumen.permisos }}</li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.pantalla {
  font-family: "Segoe UI", Tahoma, sans-serif;
  max-width: 40rem;
  margin: 2rem auto;
  padding: 0 1rem;
  color: #1a1a1a;
}
.fase {
  color: #555;
  margin-top: 0;
}
.acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1.25rem 0;
}
button {
  font: inherit;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.oculto {
  display: none;
}
.ok {
  color: #0b5;
}
.error {
  color: #b00;
  white-space: pre-wrap;
  background: #fff5f5;
  padding: 0.75rem;
  border: 1px solid #f0c0c0;
}
.aviso {
  color: #666;
  font-size: 0.95rem;
}
.resumen ul {
  padding-left: 1.25rem;
}
</style>
