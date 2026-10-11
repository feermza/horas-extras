import { describe, expect, it } from "vitest";
import {
  validarAgentes,
  validarCalendario,
  validarCatalogos,
  validarEventos,
  validarGrupos,
  validarWorkspace,
} from "../../src/datos/esquemas.js";
import { workspaceSintetico } from "./fixtures/workspace.js";

/** @param {object} extras */
function agentesConConfig(extras) {
  const base = structuredClone(workspaceSintetico.agentes);
  Object.assign(base.agentes[0].configuraciones[0], extras);
  return base;
}

describe("validarWorkspace", () => {
  it("acepta el ejemplo sintético de la sección 5", () => {
    expect(validarWorkspace(workspaceSintetico)).toEqual({ ok: true });
  });
});

describe("validarAgentes", () => {
  it("rechaza una hora de configuración mal formada", () => {
    const datos = agentesConConfig({ horario_inicio: "25:00" });
    const resultado = validarAgentes(datos);
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.some((e) => e.includes("horario_inicio"))).toBe(true);
  });

  it("rechaza sábado con un solo extremo cargado", () => {
    const datos = agentesConConfig({ sabado_inicio: "08:00", sabado_fin: null });
    const resultado = validarAgentes(datos);
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.some((e) => e.includes("sabado_inicio"))).toBe(true);
  });

  it("acepta sábado con ambos extremos", () => {
    const datos = agentesConConfig({ sabado_inicio: "08:00", sabado_fin: "12:00" });
    expect(validarAgentes(datos)).toEqual({ ok: true });
  });

  it("rechaza vigencias superpuestas del mismo agente", () => {
    const datos = structuredClone(workspaceSintetico.agentes);
    datos.agentes[0].configuraciones.push({
      ...datos.agentes[0].configuraciones[0],
      vigencia_desde: "2026-06-01",
      vigencia_hasta: null,
    });
    const resultado = validarAgentes(datos);
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.some((e) => e.includes("superpuestas"))).toBe(true);
  });
});

describe("validarGrupos", () => {
  it("rechaza horas_maximas inválidas", () => {
    const datos = structuredClone(workspaceSintetico.grupos);
    datos.grupos[0].horas_maximas = "xx";
    const resultado = validarGrupos(datos);
    expect(resultado.ok).toBe(false);
  });
});

describe("validarCalendario", () => {
  it("rechaza feriado sin fecha", () => {
    const resultado = validarCalendario({ feriados: [{ descripcion: "x" }] });
    expect(resultado.ok).toBe(false);
  });
});

describe("validarEventos", () => {
  it("rechaza un tipo que no es ASUETO ni PARO", () => {
    const datos = structuredClone(workspaceSintetico.eventos);
    datos.eventos[0].tipo = "FERIADO";
    const resultado = validarEventos(datos);
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.some((e) => e.includes("ASUETO o PARO"))).toBe(true);
  });
});

describe("validarCatalogos", () => {
  it("rechaza umbral_minimo inválido", () => {
    const datos = structuredClone(workspaceSintetico.catalogos);
    datos.umbral_minimo = "1:5";
    const resultado = validarCatalogos(datos);
    expect(resultado.ok).toBe(false);
  });
});
