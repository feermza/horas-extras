import { describe, expect, it } from "vitest";
import {
  validarAgentes,
  validarCalendario,
  validarCatalogos,
  validarEventos,
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
  it("exige nombre_reloj no vacío", () => {
    const sinCampo = structuredClone(workspaceSintetico.agentes);
    delete sinCampo.agentes[0].nombre_reloj;
    const falta = validarAgentes(sinCampo);
    expect(falta.ok).toBe(false);
    expect(falta.errores.some((e) => e.includes("nombre_reloj"))).toBe(true);

    const vacio = structuredClone(workspaceSintetico.agentes);
    vacio.agentes[0].nombre_reloj = "   ";
    const resultadoVacio = validarAgentes(vacio);
    expect(resultadoVacio.ok).toBe(false);
    expect(resultadoVacio.errores.some((e) => e.includes("nombre_reloj"))).toBe(true);
  });

  it("rechaza dos agentes con el mismo nombre_reloj normalizado", () => {
    const datos = structuredClone(workspaceSintetico.agentes);
    datos.agentes.push({
      ...structuredClone(datos.agentes[0]),
      nombre: "PEREZ, Otro",
      nombre_reloj: "pérez, juan",
    });
    const resultado = validarAgentes(datos);
    expect(resultado.ok).toBe(false);
    expect(resultado.errores.some((e) => (
      e.includes("nombre_reloj") && e.includes("PEREZ, Juan Alberto") && e.includes("PEREZ, Otro")
    ))).toBe(true);
  });

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

  it("exige nombre_libro no vacío", () => {
    const vacio = structuredClone(workspaceSintetico.catalogos);
    vacio.nombre_libro = "";
    expect(validarCatalogos(vacio).ok).toBe(false);

    const espacios = structuredClone(workspaceSintetico.catalogos);
    espacios.nombre_libro = "   ";
    expect(validarCatalogos(espacios).ok).toBe(false);

    const ausente = structuredClone(workspaceSintetico.catalogos);
    delete ausente.nombre_libro;
    expect(validarCatalogos(ausente).ok).toBe(false);
  });

  it("acepta horas_maximas ausente, null y 560:00", () => {
    const conValor = structuredClone(workspaceSintetico.catalogos);
    conValor.horas_maximas = "560:00";
    expect(validarCatalogos(conValor)).toEqual({ ok: true });

    const conNull = structuredClone(workspaceSintetico.catalogos);
    conNull.horas_maximas = null;
    expect(validarCatalogos(conNull)).toEqual({ ok: true });

    const ausente = structuredClone(workspaceSintetico.catalogos);
    delete ausente.horas_maximas;
    expect(validarCatalogos(ausente)).toEqual({ ok: true });
  });

  it("rechaza horas_maximas inválidas", () => {
    const datos = structuredClone(workspaceSintetico.catalogos);
    datos.horas_maximas = "xx";
    expect(validarCatalogos(datos).ok).toBe(false);
  });
});
