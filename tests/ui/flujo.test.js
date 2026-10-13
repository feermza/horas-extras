import { describe, expect, it } from "vitest";
import { workspaceSintetico } from "../../src/datos/ejemploSintetico.js";
import { ARCHIVOS } from "../../src/datos/esquemas.js";
import {
  crearDirectorioMemoria,
  escribirWorkspace,
  leerWorkspace,
} from "../../src/datos/persistencia.js";
import {
  armarMesesParaLibro,
  asociarNombreReloj,
  diasARevisar,
  esCarpetaSinDatos,
  MENSAJE_CARPETA_SIN_DATOS,
} from "../../src/ui/flujo.js";

describe("asociarNombreReloj", () => {
  it("reemplaza nombre_reloj del agente y no muta el workspace original", () => {
    const original = structuredClone(workspaceSintetico);
    const actualizado = asociarNombreReloj(original, "A001", "NUEVO, NOMBRE");
    expect(actualizado.agentes.agentes[0].nombre_reloj).toBe("NUEVO, NOMBRE");
    expect(original.agentes.agentes[0].nombre_reloj).toBe("PEREZ, JUAN");
    expect(actualizado.agentes.agentes[0].nombre).toBe("PEREZ, Juan Alberto");
  });

  it("lanza si el id no existe", () => {
    expect(() => asociarNombreReloj(workspaceSintetico, "X", "A")).toThrow(/id/);
  });
});

describe("diasARevisar", () => {
  it("lista bloqueantes y MARCACIONES_INCOMPLETAS; ignora otros avisos", () => {
    const calculos = [
      {
        resultado: {
          agente: { nombre: "PEREZ, Juan Alberto" },
          dias: [
            {
              fecha: "2026-08-01",
              bloqueante: "DATOS_HORARIOS_IMPOSIBLES",
              avisos: [],
            },
            {
              fecha: "2026-08-02",
              bloqueante: null,
              avisos: [
                { codigo: "MARCACIONES_INCOMPLETAS", realizada: 0, tope: 0, excedente: 0 },
              ],
            },
            {
              fecha: "2026-08-03",
              bloqueante: null,
              avisos: [
                { codigo: "BAJO_UMBRAL", realizada: 30, tope: 240, excedente: 30 },
              ],
            },
          ],
        },
      },
    ];
    const lista = diasARevisar(calculos, 50);
    expect(lista).toEqual([
      {
        agente: "PEREZ, Juan Alberto",
        fecha: "2026-08-01",
        texto: "DATOS_HORARIOS_IMPOSIBLES",
      },
      {
        agente: "PEREZ, Juan Alberto",
        fecha: "2026-08-02",
        texto: "Marcaciones incompletas: horas estimadas",
      },
    ]);
  });

  it("devuelve vacío si no hay días a revisar", () => {
    expect(diasARevisar([{ resultado: { agente: { nombre: "A" }, dias: [] } }], 50)).toEqual([]);
  });
});

describe("armarMesesParaLibro", () => {
  it("incluye solo entradas con agente y resultado", () => {
    const archivo = { periodo: { anio: 2026, mes: 8 }, dias: [] };
    const resultado = { agente: { id: "A001" }, dias: [], totales: {} };
    const meses = armarMesesParaLibro([
      { agente: { id: "A001" }, resultado, archivo },
      { agente: null, resultado: null, archivo },
      { agente: { id: "A002" }, resultado: null, archivo },
    ]);
    expect(meses).toEqual([{ resultado, archivo }]);
  });
});

describe("esCarpetaSinDatos y carpeta vacía", () => {
  it("detecta cuando faltan los cuatro JSON", () => {
    expect(esCarpetaSinDatos({
      leidos: [],
      faltantes: Object.values(ARCHIVOS),
    })).toBe(true);
    expect(esCarpetaSinDatos({
      leidos: [ARCHIVOS.agentes],
      faltantes: [ARCHIVOS.calendario, ARCHIVOS.eventos, ARCHIVOS.catalogos],
    })).toBe(false);
    expect(MENSAJE_CARPETA_SIN_DATOS).toMatch(/no tiene datos todavía/);
  });

  it("carpeta vacía: al guardar se crean los cuatro archivos", async () => {
    const dir = crearDirectorioMemoria();
    // Simula paso 1 con carpeta vacía: se conserva el handle aunque la lectura falle.
    let carpetaConservada = null;
    try {
      await leerWorkspace(dir);
      expect.unreachable("debía fallar por carpeta vacía");
    } catch (err) {
      expect(esCarpetaSinDatos(err)).toBe(true);
      carpetaConservada = dir;
    }
    expect(carpetaConservada).toBe(dir);

    const escrito = await escribirWorkspace(carpetaConservada, workspaceSintetico);
    expect(escrito.escritos).toEqual(Object.values(ARCHIVOS));
    for (const nombre of Object.values(ARCHIVOS)) {
      expect(dir._archivos.has(nombre)).toBe(true);
    }
    const leido = await leerWorkspace(dir);
    expect(leido.workspace).toEqual(workspaceSintetico);
  });
});
