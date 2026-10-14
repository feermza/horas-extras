import { describe, expect, it } from "vitest";
import {
  ARCHIVO_EVENTOS_LEGADO,
  ARCHIVO_GRUPOS_LEGADO,
  ARCHIVOS,
} from "../../src/datos/esquemas.js";
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
  it("serializa, parsea y valida los tres archivos", () => {
    const textos = textosDesdeWorkspace(workspaceSintetico);
    expect(Object.keys(textos).sort()).toEqual(
      ["agentes", "calendario", "catalogos"].sort(),
    );
    const recuperado = workspaceDesdeTextos(textos);
    expect(recuperado).toEqual(workspaceSintetico);
  });

  it("ignora alias, concepto, grupo y tope_paro al leer y no los escribe al guardar", () => {
    const conLegados = structuredClone(workspaceSintetico.agentes);
    conLegados.agentes[0].alias = ["PEREZ, J."];
    conLegados.agentes[0].concepto = "PREST. COMPL.";
    conLegados.agentes[0].grupo = "grupo-1";
    conLegados.agentes[0].configuraciones[0].tope_paro = "04:00";
    const textos = textosCompletos();
    textos.agentes = serializarJson(conLegados);
    const leido = workspaceDesdeTextos(textos);
    expect(leido.agentes.agentes[0].alias).toBeUndefined();
    expect(leido.agentes.agentes[0].concepto).toBeUndefined();
    expect(leido.agentes.agentes[0].grupo).toBeUndefined();
    expect(leido.agentes.agentes[0].configuraciones[0].tope_paro).toBeUndefined();
    const escritos = textosDesdeWorkspace(leido);
    expect(escritos.agentes).not.toMatch(/"alias"/);
    expect(escritos.agentes).not.toMatch(/"concepto"/);
    expect(escritos.agentes).not.toMatch(/"grupo"/);
    expect(escritos.agentes).not.toMatch(/"tope_paro"/);
  });

  it("ignora tope_especial en asuetos al leer y no lo escribe", () => {
    const calendario = structuredClone(workspaceSintetico.calendario);
    calendario.asuetos[0].tope_especial = "02:00";
    const textos = textosCompletos();
    textos.calendario = serializarJson(calendario);
    const leido = workspaceDesdeTextos(textos);
    expect(leido.calendario.asuetos[0].tope_especial).toBeUndefined();
    expect(textosDesdeWorkspace(leido).calendario).not.toMatch(/"tope_especial"/);
  });

  it("guarda y lee nombre_reloj", async () => {
    const dir = directorioCon();
    await escribirWorkspace(dir, workspaceSintetico);
    const leido = await leerWorkspace(dir);
    expect(leido.workspace.agentes.agentes[0].nombre_reloj).toBe("PEREZ, JUAN");
    expect(dir._archivos.get(ARCHIVOS.agentes)).toMatch(/"nombre_reloj": "PEREZ, JUAN"/);
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
    expect(escrito.escritos).not.toContain(ARCHIVO_GRUPOS_LEGADO);

    const leido = await leerWorkspace(dir);
    expect(leido.workspace).toEqual(workspaceSintetico);
    expect(leido.leidos).toEqual(Object.values(ARCHIVOS));
    expect(leido.faltantes).toEqual([]);
  });

  it("ignora un grupos.json legado al leer la carpeta", async () => {
    const dir = directorioCon();
    dir._archivos.set(ARCHIVO_GRUPOS_LEGADO, '{"grupos":[]}');
    const leido = await leerWorkspace(dir);
    expect(leido.workspace).toEqual(workspaceSintetico);
    expect(leido.leidos).not.toContain(ARCHIVO_GRUPOS_LEGADO);
  });

  it("ignora un eventos.json legado al leer la carpeta", async () => {
    const dir = directorioCon();
    dir._archivos.set(
      ARCHIVO_EVENTOS_LEGADO,
      serializarJson({
        eventos: [{ fecha: "2026-08-20", tipo: "PARO", descripcion: "x", tope_especial: null }],
      }),
    );
    const leido = await leerWorkspace(dir);
    expect(leido.workspace).toEqual(workspaceSintetico);
    expect(leido.leidos).not.toContain(ARCHIVO_EVENTOS_LEGADO);
    expect(dir._archivos.has(ARCHIVO_EVENTOS_LEGADO)).toBe(true);
  });

  it("rechaza al leer si un archivo es inválido", async () => {
    const dir = directorioCon({
      calendario: serializarJson({ feriados: [{ descripcion: "sin fecha" }] }),
    });
    await expect(leerWorkspace(dir)).rejects.toThrow(/fecha/);
  });

  it("al leer informa leídos y faltantes sin devolver workspace", async () => {
    const textos = textosCompletos();
    const dir = crearDirectorioMemoria({
      [ARCHIVOS.agentes]: textos.agentes,
    });
    try {
      await leerWorkspace(dir);
      expect.unreachable("debía fallar por archivos faltantes");
    } catch (err) {
      expect(err.leidos).toEqual([ARCHIVOS.agentes]);
      expect(err.faltantes).toEqual([
        ARCHIVOS.calendario,
        ARCHIVOS.catalogos,
      ]);
      expect(err.errores).toEqual([
        `${ARCHIVOS.calendario}: archivo no encontrado.`,
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
      expect(texto).toMatch(/PEREZ, Juan Alberto/);
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
    expect(primero.workspace.agentes.agentes[0].nombre).toBe("PEREZ, Juan Alberto");
    expect(primero.workspace.agentes.agentes[0].configuraciones[0].valor_hora_base).toBe(4500);

    const agentes = structuredClone(primero.workspace.agentes);
    agentes.agentes[0].nombre = "LOPEZ, Ana";
    agentes.agentes[0].configuraciones[0].valor_hora_base = 9999;
    dir._archivos.set(ARCHIVOS.agentes, serializarJson(agentes));

    const segundo = await leerWorkspace(dir);
    expect(segundo.workspace.agentes.agentes[0].nombre).toBe("LOPEZ, Ana");
    expect(segundo.workspace.agentes.agentes[0].configuraciones[0].valor_hora_base).toBe(9999);
    expect(primero.workspace.agentes.agentes[0].nombre).toBe("PEREZ, Juan Alberto");
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
  it("cuenta los elementos y muestra el libro", () => {
    expect(resumenWorkspace(workspaceSintetico)).toEqual({
      agentes: 1,
      feriados: 1,
      asuetos: 1,
      justificaciones: workspaceSintetico.catalogos.justificaciones.length,
      permisos: workspaceSintetico.catalogos.permisos.length,
      nombre_libro: "Becas 540",
      horas_maximas: "560:00",
    });
  });
});
