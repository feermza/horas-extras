import { describe, expect, it } from "vitest";
import { ARCHIVOS } from "../../src/datos/esquemas.js";
import {
  crearDirectorioMemoria,
  escribirWorkspace,
  leerWorkspace,
  parsearJson,
  resumenWorkspace,
  serializarJson,
  textosDesdeWorkspace,
  workspaceDesdeTextos,
} from "../../src/datos/persistencia.js";
import { workspaceSintetico } from "./fixtures/workspace.js";

describe("ida y vuelta por texto", () => {
  it("serializa, parsea y valida los cinco archivos", () => {
    const textos = textosDesdeWorkspace(workspaceSintetico);
    expect(Object.keys(textos).sort()).toEqual(
      ["agentes", "calendario", "catalogos", "eventos", "grupos"].sort(),
    );
    const recuperado = workspaceDesdeTextos(textos);
    expect(recuperado).toEqual(workspaceSintetico);
  });

  it("parsearJson nombra el archivo si el texto no es JSON", () => {
    expect(() => parsearJson("{", ARCHIVOS.agentes)).toThrow(/agentes\.json/);
  });

  it("serializarJson termina en salto de línea", () => {
    expect(serializarJson({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});

describe("File System Access (mock en memoria)", () => {
  it("escribe y vuelve a leer el workspace", async () => {
    const dir = crearDirectorioMemoria();
    await escribirWorkspace(dir, workspaceSintetico);
    expect(dir._carpetas.has("periodos")).toBe(true);
    expect(dir._archivos.has(ARCHIVOS.agentes)).toBe(true);

    const leido = await leerWorkspace(dir);
    expect(leido).toEqual(workspaceSintetico);
  });

  it("rechaza al leer si un archivo es inválido", async () => {
    const textos = textosDesdeWorkspace(workspaceSintetico);
    textos.eventos = serializarJson({
      eventos: [{ fecha: "2026-08-20", tipo: "FERIADO", descripcion: "x", tope_especial: null }],
    });
    const dir = crearDirectorioMemoria({
      [ARCHIVOS.agentes]: textos.agentes,
      [ARCHIVOS.grupos]: textos.grupos,
      [ARCHIVOS.calendario]: textos.calendario,
      [ARCHIVOS.eventos]: textos.eventos,
      [ARCHIVOS.catalogos]: textos.catalogos,
    });
    await expect(leerWorkspace(dir)).rejects.toThrow(/ASUETO o PARO/);
  });
});

describe("resumenWorkspace", () => {
  it("cuenta los elementos de cada archivo", () => {
    expect(resumenWorkspace(workspaceSintetico)).toEqual({
      agentes: 1,
      grupos: 1,
      feriados: 1,
      eventos: 1,
      justificaciones: workspaceSintetico.catalogos.justificaciones.length,
      permisos: workspaceSintetico.catalogos.permisos.length,
    });
  });
});
