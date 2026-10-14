import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { workspaceSintetico } from "../../src/datos/ejemploSintetico.js";
import { ARCHIVOS } from "../../src/datos/esquemas.js";
import {
  crearDirectorioMemoria,
  escribirWorkspace,
  leerWorkspace,
} from "../../src/datos/persistencia.js";
import { generarLibro } from "../../src/excel/generarLibro.js";
import { calcularMes } from "../../src/motor/calculoMes.js";
import { formatearHM } from "../../src/motor/tiempo.js";
import {
  armarMesesParaLibro,
  asociarNombreReloj,
  corregirMarcaciones,
  diasARevisar,
  esCarpetaSinDatos,
  MENSAJE_CARPETA_SIN_DATOS,
} from "../../src/ui/flujo.js";
import { catalogo as catalogoBase } from "../motor/fixtures/catalogo.js";

const CATALOGO = {
  ...catalogoBase,
  umbral_minimo: "00:50",
  nombre_libro: "Becas 540",
  horas_maximas: "560:00",
};

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
        clave: "a1",
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
        clave: "a1",
      },
      {
        agente: "PEREZ, Juan Alberto",
        fecha: "2026-08-02",
        texto: "Marcaciones incompletas: horas estimadas",
        clave: "a1",
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
  it("detecta cuando faltan los tres JSON", () => {
    expect(esCarpetaSinDatos({
      leidos: [],
      faltantes: Object.values(ARCHIVOS),
    })).toBe(true);
    expect(esCarpetaSinDatos({
      leidos: [ARCHIVOS.agentes],
      faltantes: [ARCHIVOS.calendario, ARCHIVOS.catalogos],
    })).toBe(false);
    expect(MENSAJE_CARPETA_SIN_DATOS).toMatch(/no tiene datos todavía/);
  });

  it("carpeta vacía: al guardar se crean los tres archivos", async () => {
    const dir = crearDirectorioMemoria();
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

describe("corregirMarcaciones", () => {
  const agente = workspaceSintetico.agentes.agentes[0];

  /**
   * @param {object} mensual
   * @returns {object}
   */
  function calcular(mensual) {
    return calcularMes({
      nombre: mensual.nombre,
      agentes: [agente],
      archivo: {
        periodo: mensual.periodo,
        dias: mensual.dias.map((d) => ({
          fecha: d.fecha,
          observacion: d.observacion,
          marcaciones: d.marcaciones.map((par) => ({
            ingreso: par.ingreso === null ? null : formatearHM(par.ingreso),
            salida: par.salida === null ? null : formatearHM(par.salida),
          })),
        })),
      },
      feriados: [],
      asuetos: [],
      catalogo: CATALOGO,
    });
  }

  it("completa la salida faltante y calcula horas extras", () => {
    // Una sola marcación (ingreso sin salida) → incompletas, Hs_Trab 0.
    const mensual = {
      nombre: "PEREZ, JUAN",
      periodo: { anio: 2026, mes: 8 },
      dias: [
        {
          fecha: "2026-08-18",
          observacion: "",
          marcaciones: [
            { ingreso: 480, salida: null },
            { ingreso: null, salida: null },
            { ingreso: null, salida: null },
          ],
        },
      ],
    };
    const antes = calcular(mensual);
    const diaAntes = antes.dias.find((d) => d.fecha === "2026-08-18");
    expect(diaAntes.avisos.some((a) => a.codigo === "MARCACIONES_INCOMPLETAS")).toBe(true);
    expect(diaAntes.Hs_Extra_Realizada).toBe(0);

    const corr = corregirMarcaciones(mensual, "2026-08-18", {
      ingreso1: "08:00",
      salida1: "17:10",
      ingreso2: "",
      salida2: "",
      ingreso3: "",
      salida3: "",
    });
    expect(corr.ok).toBe(true);
    expect(corr.archivo.dias[0].marcaciones[0]).toEqual({ ingreso: 480, salida: 1030 });
    expect(mensual.dias[0].marcaciones[0].salida).toBeNull();

    const despues = calcular(corr.archivo);
    const diaDespues = despues.dias.find((d) => d.fecha === "2026-08-18");
    expect(diaDespues.avisos.some((a) => a.codigo === "MARCACIONES_INCOMPLETAS")).toBe(false);
    expect(diaDespues.Hs_Extra_Realizada).toBe(160);
  });

  it("quita una marcación suelta", () => {
    const mensual = {
      nombre: "PEREZ, JUAN",
      periodo: { anio: 2026, mes: 8 },
      dias: [
        {
          fecha: "2026-08-18",
          observacion: "",
          marcaciones: [
            { ingreso: 480, salida: 870 },
            { ingreso: 900, salida: null },
            { ingreso: null, salida: null },
          ],
        },
      ],
    };
    const antes = calcular(mensual);
    expect(
      antes.dias.find((d) => d.fecha === "2026-08-18").avisos
        .some((a) => a.codigo === "MARCACIONES_INCOMPLETAS"),
    ).toBe(true);

    const corr = corregirMarcaciones(mensual, "2026-08-18", {
      ingreso1: "08:00",
      salida1: "14:30",
      ingreso2: "",
      salida2: "",
      ingreso3: "",
      salida3: "",
    });
    expect(corr.ok).toBe(true);
    expect(corr.archivo.dias[0].marcaciones[1]).toEqual({ ingreso: null, salida: null });

    const despues = calcular(corr.archivo);
    const dia = despues.dias.find((d) => d.fecha === "2026-08-18");
    expect(dia.avisos.some((a) => a.codigo === "MARCACIONES_INCOMPLETAS")).toBe(false);
    expect(dia.Hs_Extra_Realizada).toBe(0);
  });

  it("rechaza hora inválida sin cambiar el archivo", () => {
    const mensual = {
      nombre: "PEREZ, JUAN",
      periodo: { anio: 2026, mes: 8 },
      dias: [
        {
          fecha: "2026-08-18",
          observacion: "",
          marcaciones: [
            { ingreso: 480, salida: null },
            { ingreso: null, salida: null },
            { ingreso: null, salida: null },
          ],
        },
      ],
    };
    const corr = corregirMarcaciones(mensual, "2026-08-18", {
      ingreso1: "8:00",
      salida1: "17:10",
      ingreso2: "",
      salida2: "",
      ingreso3: "",
      salida3: "25:00",
    });
    expect(corr.ok).toBe(false);
    expect(corr.errores.map((e) => e.campo).sort()).toEqual(["ingreso1", "salida3"]);
    expect(mensual.dias[0].marcaciones[0].salida).toBeNull();
  });

  it("el libro generado trae las marcaciones corregidas", async () => {
    const mensual = {
      nombre: "PEREZ, JUAN",
      periodo: { anio: 2026, mes: 8 },
      dias: [
        {
          fecha: "2026-08-18",
          observacion: "",
          marcaciones: [
            { ingreso: 480, salida: null },
            { ingreso: null, salida: null },
            { ingreso: null, salida: null },
          ],
        },
      ],
    };
    const corr = corregirMarcaciones(mensual, "2026-08-18", {
      ingreso1: "08:00",
      salida1: "17:10",
      ingreso2: "",
      salida2: "",
      ingreso3: "",
      salida3: "",
    });
    expect(corr.ok).toBe(true);
    const resultado = calcular(corr.archivo);
    const meses = armarMesesParaLibro([
      { agente, resultado, archivo: corr.archivo },
    ]);
    const buffer = await generarLibro({ meses, catalogo: CATALOGO });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const hoja = wb.getWorksheet("PEREZ, J");
    const fila = 13 + resultado.dias.findIndex((d) => d.fecha === "2026-08-18");
    const excelEpoch = Date.UTC(1899, 11, 30);
    /**
     * @param {unknown} valor
     * @returns {number|null}
     */
    function minutosDeCelda(valor) {
      if (valor === null || valor === undefined || valor === "") {
        return null;
      }
      if (valor instanceof Date) {
        return Math.round((valor.getTime() - excelEpoch) / 60000);
      }
      if (typeof valor === "number") {
        return Math.round(valor * 1440);
      }
      return null;
    }
    expect(minutosDeCelda(hoja.getCell(fila, 5).value)).toBe(480);
    expect(minutosDeCelda(hoja.getCell(fila, 6).value)).toBe(1030);
  });
});
