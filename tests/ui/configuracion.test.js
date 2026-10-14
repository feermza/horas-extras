import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import { workspaceSintetico } from "../../src/datos/ejemploSintetico.js";
import { ARCHIVOS } from "../../src/datos/esquemas.js";
import {
  crearDirectorioMemoria,
  escribirParteWorkspace,
  escribirWorkspace,
  leerWorkspace,
} from "../../src/datos/persistencia.js";
import {
  agregarNuevaConfiguracion,
  clonarDatos,
  crearAgenteNuevo,
  diaAnterior,
  normalizarAgentesParaGuardar,
  normalizarCalendarioParaGuardar,
  normalizarCatalogoParaGuardar,
  prepararAgentesParaEdicion,
  prepararCalendarioParaEdicion,
  prepararCatalogoParaEdicion,
  siguienteIdAgente,
  validarEdicionAgentes,
  validarEdicionCalendario,
  validarEdicionCatalogo,
} from "../../src/ui/configuracion.js";

describe("clonarDatos con Proxy de Vue", () => {
  it("clona reactive() sin lanzar y deja una copia independiente", () => {
    const origen = reactive(structuredClone(workspaceSintetico.agentes));
    expect(() => clonarDatos(origen)).not.toThrow();
    const copia = clonarDatos(origen);
    expect(copia).toEqual(workspaceSintetico.agentes);
    expect(copia).not.toBe(origen);
    copia.agentes[0].nombre = "OTRO";
    expect(origen.agentes[0].nombre).toBe(workspaceSintetico.agentes.agentes[0].nombre);

    const borradorAg = prepararAgentesParaEdicion(origen);
    expect(borradorAg.agentes[0].nombre).toBe(workspaceSintetico.agentes.agentes[0].nombre);
    borradorAg.agentes[0].nombre = "EDITADO";
    expect(origen.agentes[0].nombre).toBe(workspaceSintetico.agentes.agentes[0].nombre);

    const calReactivo = reactive(structuredClone(workspaceSintetico.calendario));
    expect(() => prepararCalendarioParaEdicion(calReactivo)).not.toThrow();
    const catReactivo = reactive(structuredClone(workspaceSintetico.catalogos));
    expect(() => prepararCatalogoParaEdicion(catReactivo)).not.toThrow();
  });
});

describe("siguienteIdAgente y crearAgenteNuevo", () => {
  it("genera el id siguiente con tres dígitos", () => {
    expect(siguienteIdAgente([])).toBe("A001");
    expect(siguienteIdAgente([{ id: "A001" }, { id: "A004" }])).toBe("A005");
    const nuevo = crearAgenteNuevo(workspaceSintetico.agentes.agentes);
    expect(nuevo.id).toBe("A002");
    expect(nuevo.configuraciones[0].tope_lao_receso).toBe("08:00");
    expect(nuevo.configuraciones[0].tope_extra_habil).toBe("");
    expect(nuevo.configuraciones[0].tope_feriado).toBe("");
  });
});

describe("agregarNuevaConfiguracion", () => {
  it("copia la última y cierra vigencia_hasta nula el día anterior", () => {
    const configs = [
      {
        vigencia_desde: "2024-01-01",
        vigencia_hasta: null,
        horario_inicio: "08:00",
        horario_fin: "14:30",
        duracion_jornada: "06:30",
        tope_extra_habil: "04:00",
        sabado_inicio: null,
        sabado_fin: null,
        sabado_tope: "00:00",
        tope_feriado: "04:00",
        tope_asueto: "04:00",
        tope_lao_receso: "08:00",
        valor_hora_base: 4500,
      },
    ];
    const resultado = agregarNuevaConfiguracion(configs, "2026-03-01");
    expect(resultado.ok).toBe(true);
    expect(resultado.configuraciones).toHaveLength(2);
    expect(resultado.configuraciones[0].vigencia_hasta).toBe(diaAnterior("2026-03-01"));
    expect(resultado.configuraciones[0].vigencia_hasta).toBe("2026-02-28");
    expect(resultado.configuraciones[1].vigencia_desde).toBe("2026-03-01");
    expect(resultado.configuraciones[1].vigencia_hasta).toBeNull();
    expect(resultado.configuraciones[1].valor_hora_base).toBe(4500);
  });

  it("no cambia vigencia_hasta si ya estaba cargada", () => {
    const configs = [
      {
        vigencia_desde: "2024-01-01",
        vigencia_hasta: "2025-12-31",
        horario_inicio: "08:00",
        horario_fin: "14:30",
        duracion_jornada: "06:30",
        tope_extra_habil: "04:00",
        sabado_inicio: null,
        sabado_fin: null,
        sabado_tope: "00:00",
        tope_feriado: "04:00",
        tope_asueto: "04:00",
        tope_lao_receso: "08:00",
        valor_hora_base: 4500,
      },
    ];
    const resultado = agregarNuevaConfiguracion(configs, "2026-01-01");
    expect(resultado.ok).toBe(true);
    expect(resultado.configuraciones[0].vigencia_hasta).toBe("2025-12-31");
  });
});

describe("validarEdicionAgentes", () => {
  it("rechaza vigencias superpuestas", () => {
    const doc = structuredClone(workspaceSintetico.agentes);
    doc.agentes[0].configuraciones.push({
      ...doc.agentes[0].configuraciones[0],
      vigencia_desde: "2026-06-01",
      vigencia_hasta: null,
    });
    const resultado = validarEdicionAgentes(doc);
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.some((e) => /superpuestas/i.test(e))).toBe(true);
  });

  it("rechaza un tope vacío", () => {
    const doc = structuredClone(workspaceSintetico.agentes);
    doc.agentes[0].configuraciones[0].tope_feriado = "";
    const resultado = validarEdicionAgentes(doc);
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.some((e) => e.includes("tope_feriado"))).toBe(true);
  });

  it("rechaza sábado con una sola hora", () => {
    const doc = structuredClone(workspaceSintetico.agentes);
    doc.agentes[0].configuraciones[0].sabado_inicio = "08:00";
    doc.agentes[0].configuraciones[0].sabado_fin = null;
    const resultado = validarEdicionAgentes(doc);
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.some((e) => /sabado_inicio y sabado_fin/i.test(e))).toBe(true);
  });

  it("rechaza nombre_reloj duplicado", () => {
    const doc = structuredClone(workspaceSintetico.agentes);
    doc.agentes.push({
      ...structuredClone(doc.agentes[0]),
      id: "A002",
      nombre: "OTRO, Agente",
      nombre_reloj: "pérez, juan",
    });
    const resultado = validarEdicionAgentes(doc);
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.some((e) => /nombre_reloj/i.test(e))).toBe(true);
  });

  it("acepta el ejemplo sintético", () => {
    expect(validarEdicionAgentes(workspaceSintetico.agentes)).toEqual({ ok: true });
  });
});

describe("validarEdicionCalendario", () => {
  it("rechaza fecha inválida", () => {
    const resultado = validarEdicionCalendario({
      feriados: [{ fecha: "2026-02-29", descripcion: "No existe" }],
      asuetos: [],
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.some((e) => /fecha/i.test(e))).toBe(true);
  });

  it("rechaza fecha repetida en la misma lista", () => {
    const resultado = validarEdicionCalendario({
      feriados: [
        { fecha: "2026-08-17", descripcion: "Uno" },
        { fecha: "2026-08-17", descripcion: "Dos" },
      ],
      asuetos: [],
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.some((e) => /repetida/i.test(e))).toBe(true);
  });

  it("rechaza descripción vacía", () => {
    const resultado = validarEdicionCalendario({
      feriados: [{ fecha: "2026-08-17", descripcion: "  " }],
      asuetos: [],
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.some((e) => /descripción/i.test(e))).toBe(true);
  });

  it("acepta el ejemplo sintético", () => {
    expect(validarEdicionCalendario(workspaceSintetico.calendario)).toEqual({ ok: true });
  });
});

describe("validarEdicionCatalogo", () => {
  it("rechaza nombre_libro vacío", () => {
    const doc = structuredClone(workspaceSintetico.catalogos);
    doc.nombre_libro = "  ";
    const resultado = validarEdicionCatalogo(doc);
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.some((e) => /nombre del libro/i.test(e))).toBe(true);
  });

  it("acepta horas_maximas vacío", () => {
    const doc = structuredClone(workspaceSintetico.catalogos);
    doc.horas_maximas = "";
    expect(validarEdicionCatalogo(doc)).toEqual({ ok: true });
    expect(normalizarCatalogoParaGuardar(doc).horas_maximas).toBeNull();
  });
});

describe("guardar y releer con mock de carpeta", () => {
  it("ida y vuelta de agentes, calendario y catálogo por parte", async () => {
    const dir = crearDirectorioMemoria();
    await escribirWorkspace(dir, workspaceSintetico);

    const agentesEdit = structuredClone(workspaceSintetico.agentes);
    agentesEdit.agentes[0].nombre = "PEREZ, Juan Editado";
    const okAg = validarEdicionAgentes(agentesEdit);
    expect(okAg.ok).toBe(true);
    const guardadoAg = await escribirParteWorkspace(
      dir,
      "agentes",
      normalizarAgentesParaGuardar(agentesEdit),
    );
    expect(guardadoAg.escritos).toEqual([ARCHIVOS.agentes]);

    const calEdit = structuredClone(workspaceSintetico.calendario);
    calEdit.asuetos.push({ fecha: "2026-08-25", descripcion: "Asueto extra" });
    expect(validarEdicionCalendario(calEdit).ok).toBe(true);
    await escribirParteWorkspace(dir, "calendario", normalizarCalendarioParaGuardar(calEdit));

    const catEdit = structuredClone(workspaceSintetico.catalogos);
    catEdit.nombre_libro = "Becas editado";
    catEdit.horas_maximas = "";
    expect(validarEdicionCatalogo(catEdit).ok).toBe(true);
    await escribirParteWorkspace(dir, "catalogos", normalizarCatalogoParaGuardar(catEdit));

    const leido = await leerWorkspace(dir);
    expect(leido.workspace.agentes.agentes[0].nombre).toBe("PEREZ, Juan Editado");
    expect(leido.workspace.calendario.asuetos.some((a) => a.fecha === "2026-08-25")).toBe(true);
    expect(leido.workspace.catalogos.nombre_libro).toBe("Becas editado");
    expect(leido.workspace.catalogos.horas_maximas).toBeNull();
    expect(leido.workspace.catalogos.justificaciones.length).toBe(
      workspaceSintetico.catalogos.justificaciones.length,
    );
  });
});
