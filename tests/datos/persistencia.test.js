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

/**
 * @returns {Record<string, string>}
 */
function textosCompletos() {
  return textosDesdeWorkspace(workspaceSintetico);
}

/**
 * Textos del workspace indexados por nombre de archivo (agentes.json, …).
 *
 * @param {Partial<Record<keyof typeof ARCHIVOS, string>>} [parcial]
 * @returns {Record<string, string>}
 */
function archivosDelWorkspace(parcial = {}) {
  const textos = { ...textosCompletos(), ...parcial };
  /** @type {Record<string, string>} */
  const porNombre = {};
  for (const [clave, nombre] of Object.entries(ARCHIVOS)) {
    porNombre[nombre] = textos[/** @type {keyof typeof ARCHIVOS} */ (clave)];
  }
  return porNombre;
}

/**
 * @param {Partial<Record<keyof typeof ARCHIVOS, string>>} [parcial]
 * @returns {ReturnType<typeof crearDirectorioMemoria>}
 */
function directorioCon(parcial = {}) {
  return crearDirectorioMemoria(archivosDelWorkspace(parcial));
}

describe("ida y vuelta por texto", () => {
  it("serializa, parsea y valida los cinco archivos", () => {
    const textos = textosDesdeWorkspace(workspaceSintetico);
    expect(Object.keys(textos).sort()).toEqual(
      ["agentes", "calendario", "catalogos", "eventos", "grupos"].sort(),
    );
    const recuperado = workspaceDesdeTextos(textos);
    expect(recuperado).toEqual(workspaceSintetico);
  });

  it("ignora alias al leer y no lo escribe al guardar", () => {
    const conAlias = structuredClone(workspaceSintetico.agentes);
    conAlias.agentes[0].alias = ["PEREZ, J."];
    const textos = textosCompletos();
    textos.agentes = serializarJson(conAlias);
    const leido = workspaceDesdeTextos(textos);
    expect(leido.agentes.agentes[0].alias).toBeUndefined();
    const escritos = textosDesdeWorkspace(leido);
    expect(escritos.agentes).not.toMatch(/"alias"/);
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
    const escrito = await escribirWorkspace(dir, workspaceSintetico);
    expect(dir._carpetas.has("periodos")).toBe(true);
    expect(dir._archivos.has(ARCHIVOS.agentes)).toBe(true);
    expect(escrito.escritos).toEqual(Object.values(ARCHIVOS));

    const leido = await leerWorkspace(dir);
    expect(leido.workspace).toEqual(workspaceSintetico);
    expect(leido.leidos).toEqual(Object.values(ARCHIVOS));
    expect(leido.faltantes).toEqual([]);
  });

  it("rechaza al leer si un archivo es inválido", async () => {
    const dir = directorioCon({
      eventos: serializarJson({
        eventos: [{ fecha: "2026-08-20", tipo: "FERIADO", descripcion: "x", tope_especial: null }],
      }),
    });
    await expect(leerWorkspace(dir)).rejects.toThrow(/ASUETO o PARO/);
  });

  it("al leer informa leídos y faltantes sin devolver workspace", async () => {
    const textos = textosCompletos();
    const dir = crearDirectorioMemoria({
      [ARCHIVOS.agentes]: textos.agentes,
      [ARCHIVOS.grupos]: textos.grupos,
    });
    try {
      await leerWorkspace(dir);
      expect.unreachable("debía fallar por archivos faltantes");
    } catch (err) {
      expect(err.leidos).toEqual([ARCHIVOS.agentes, ARCHIVOS.grupos]);
      expect(err.faltantes).toEqual([
        ARCHIVOS.calendario,
        ARCHIVOS.eventos,
        ARCHIVOS.catalogos,
      ]);
      expect(err.errores).toEqual([
        `${ARCHIVOS.calendario}: archivo no encontrado.`,
        `${ARCHIVOS.eventos}: archivo no encontrado.`,
        `${ARCHIVOS.catalogos}: archivo no encontrado.`,
      ]);
    }
  });

  it("falla si horario_inicio no es HH:MM estricto y nombra agente y campo", async () => {
    const agentes = structuredClone(workspaceSintetico.agentes);
    agentes.agentes[0].configuraciones[0].horario_inicio = "8:00";
    const dir = directorioCon({ agentes: serializarJson(agentes) });
    try {
      await leerWorkspace(dir);
      expect.unreachable("debía fallar por HH:MM");
    } catch (err) {
      const texto = err.errores.join("\n");
      expect(texto).toMatch(/PEREZ, Juan A\./);
      expect(texto).toMatch(/horario_inicio/);
    }
  });

  it("falla si solo sabado_inicio está cargado", async () => {
    const agentes = structuredClone(workspaceSintetico.agentes);
    agentes.agentes[0].configuraciones[0].sabado_inicio = "08:00";
    agentes.agentes[0].configuraciones[0].sabado_fin = null;
    const dir = directorioCon({ agentes: serializarJson(agentes) });
    await expect(leerWorkspace(dir)).rejects.toThrow(/sabado_inicio/);
  });

  it("una segunda lectura refleja cambios en agentes.json", async () => {
    const dir = directorioCon();
    const primero = await leerWorkspace(dir);
    expect(primero.workspace.agentes.agentes[0].nombre).toBe("PEREZ, Juan A.");
    expect(primero.workspace.agentes.agentes[0].configuraciones[0].valor_hora_base).toBe(4500);

    const agentes = structuredClone(primero.workspace.agentes);
    agentes.agentes[0].nombre = "LOPEZ, Ana";
    agentes.agentes[0].configuraciones[0].valor_hora_base = 9999;
    dir._archivos.set(ARCHIVOS.agentes, serializarJson(agentes));

    const segundo = await leerWorkspace(dir);
    expect(segundo.workspace.agentes.agentes[0].nombre).toBe("LOPEZ, Ana");
    expect(segundo.workspace.agentes.agentes[0].configuraciones[0].valor_hora_base).toBe(9999);
    expect(primero.workspace.agentes.agentes[0].nombre).toBe("PEREZ, Juan A.");
  });

  it("si la lectura falla el workspace anterior queda intacto", async () => {
    const dir = directorioCon();
    const anterior = await leerWorkspace(dir);
    const snapshot = structuredClone(anterior.workspace);

    const agentes = structuredClone(workspaceSintetico.agentes);
    agentes.agentes[0].configuraciones[0].horario_inicio = "8:00";
    dir._archivos.set(ARCHIVOS.agentes, serializarJson(agentes));

    await expect(leerWorkspace(dir)).rejects.toThrow();
    expect(anterior.workspace).toEqual(snapshot);
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
