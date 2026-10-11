import { describe, expect, it } from "vitest";
import { calcularMes, identificarAgente } from "../../src/motor/calculoMes.js";
import { catalogo } from "./fixtures/catalogo.js";

const CATALOGO = { ...catalogo, umbral_minimo: "00:50" };

/**
 * @param {object} [parcial]
 * @returns {object}
 */
function configuracion(parcial = {}) {
  return {
    vigencia_desde: "2020-01-01",
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
    tope_paro: "04:00",
    tope_lao_receso: "08:00",
    valor_hora_base: 4500,
    ...parcial,
  };
}

/**
 * @param {object} [parcial]
 * @returns {object}
 */
function agente(parcial = {}) {
  return {
    nombre: "PEREZ, Juan A.",
    activo: false,
    configuraciones: [configuracion()],
    ...parcial,
  };
}

/**
 * @param {object} parcial
 * @returns {object}
 */
function mes(parcial) {
  return calcularMes({
    nombre: parcial.nombre ?? "PEREZ, Juan A.",
    agentes: parcial.agentes ?? [agente(parcial.agente)],
    archivo: {
      periodo: parcial.periodo ?? { anio: 2026, mes: 8 },
      dias: parcial.dias ?? [],
    },
    feriados: parcial.feriados ?? [],
    eventos: parcial.eventos ?? [],
    catalogo: CATALOGO,
    finales: parcial.finales,
  });
}

describe("identificarAgente", () => {
  it("identifica por nombre con otras tildes y mayúsculas, aunque activo sea false", () => {
    const juan = agente();
    expect(identificarAgente("pérez, JUAN A.", [juan])).toBe(juan);
  });

  it("devuelve nulo si no hay coincidencia o hay más de una", () => {
    const juan = agente();
    const otro = agente({ nombre: "GARCIA, Ana" });
    const repetido = agente();
    expect(identificarAgente("NADIE, Nadie", [juan])).toBeNull();
    expect(identificarAgente("PEREZ, Juan A.", [juan, repetido])).toBeNull();
    expect(identificarAgente("GARCIA, Ana", [juan, otro])).toBe(otro);
  });
});

describe("calcularMes", () => {
  it("recorre 28, 29, 30 y 31 días", () => {
    expect(mes({ periodo: { anio: 2026, mes: 2 } }).dias).toHaveLength(28);
    expect(mes({ periodo: { anio: 2024, mes: 2 } }).dias).toHaveLength(29);
    expect(mes({ periodo: { anio: 2026, mes: 4 } }).dias).toHaveLength(30);
    expect(mes({ periodo: { anio: 2026, mes: 8 } }).dias).toHaveLength(31);
  });

  it("calcula vacío un día que el archivo no trae", () => {
    const resultado = mes({
      dias: [{ fecha: "2026-08-18", marcaciones: [{ ingreso: "08:00", salida: "17:10" }], observacion: "" }],
    });
    const presente = resultado.dias.find((dia) => dia.fecha === "2026-08-18");
    const ausente = resultado.dias.find((dia) => dia.fecha === "2026-08-21");
    expect(presente.Hs_Extra_Realizada).toBe(160);
    expect(ausente.Hs_Trab).toBe(0);
    expect(ausente.Hs_Extra_Realizada).toBe(0);
    expect(ausente.observacion ?? ausente.bloqueante).toBeNull();
    expect(resultado.dias).toHaveLength(31);
  });

  it("suma un feriado y un día simple en C5 a C10", () => {
    // 18/08 hábil 08:00-17:10: realizada 2:40, computada 2:40, factor 1.
    // 19/08 feriado 08:00-16:00: realizada 8:00, computada 4:00, factor 2.
    // C5 = 160+480 = 640. C6 = 160+240 = 400.
    // C7 = 160. C8 = 240. C9 = 640. C10 = 640 * 4500 / 60 = 48000.
    const resultado = mes({
      feriados: [{ fecha: "2026-08-19", descripcion: "Feriado de prueba" }],
      dias: [
        { fecha: "2026-08-18", marcaciones: [{ ingreso: "08:00", salida: "17:10" }], observacion: "" },
        { fecha: "2026-08-19", marcaciones: [{ ingreso: "08:00", salida: "16:00" }], observacion: "" },
      ],
    });
    expect(resultado.totales).toEqual({
      realizadas: 640,
      computadasSistema: 400,
      finalesSimples: 160,
      finalesDobles: 240,
      finalesEquivalentes: 640,
      importe: 48000,
      valorHoraBase: 4500,
    });
    expect(resultado.hayBloqueantes).toBe(false);
  });

  it("tres días de 1 minuto a valor hora 100 dan importe 5", () => {
    const fechas = ["2026-08-17", "2026-08-18", "2026-08-20"];
    const resultado = mes({
      agente: { configuraciones: [configuracion({ valor_hora_base: 100 })] },
      dias: fechas.map((fecha) => ({
        fecha,
        marcaciones: [{ ingreso: "14:30", salida: "14:31" }],
        observacion: "",
      })),
      finales: Object.fromEntries(fechas.map((fecha) => [fecha, 1])),
    });
    expect(resultado.totales.finalesEquivalentes).toBe(3);
    expect(resultado.totales.importe).toBe(5);
  });

  it("editar un final cambia los totales y marca modificado", () => {
    const resultado = mes({
      dias: [{ fecha: "2026-08-18", marcaciones: [{ ingreso: "08:00", salida: "17:10" }], observacion: "" }],
      finales: { "2026-08-18": 100 },
    });
    const editado = resultado.dias.find((dia) => dia.fecha === "2026-08-18");
    const otro = resultado.dias.find((dia) => dia.fecha === "2026-08-19");
    expect(editado.Hs_Final).toBe(100);
    expect(editado.modificado).toBe(true);
    expect(otro.modificado).toBe(false);
    expect(resultado.totales.realizadas).toBe(160);
    expect(resultado.totales.computadasSistema).toBe(160);
    expect(resultado.totales.finalesSimples).toBe(100);
    expect(resultado.totales.finalesEquivalentes).toBe(100);
    expect(resultado.totales.importe).toBe(7500);
  });

  it("un final fuera de rango lanza RangeError", () => {
    const dias = [{ fecha: "2026-08-18", marcaciones: [{ ingreso: "08:00", salida: "17:10" }], observacion: "" }];
    expect(() => mes({ dias, finales: { "2026-08-18": 161 } })).toThrow(RangeError);
    expect(() => mes({ dias, finales: { "2026-08-18": -1 } })).toThrow(RangeError);
  });

  it("un día bloqueado aporta 0", () => {
    const resultado = mes({
      dias: [
        { fecha: "2026-08-18", marcaciones: [{ ingreso: "08:00", salida: "17:10" }], observacion: "" },
        { fecha: "2026-08-20", marcaciones: [{ ingreso: "08:00", salida: "25:00" }], observacion: "" },
      ],
    });
    const bloqueado = resultado.dias.find((dia) => dia.fecha === "2026-08-20");
    expect(bloqueado.bloqueante).toBe("DATOS_HORARIOS_IMPOSIBLES");
    expect(bloqueado.Hs_Extra_Realizada).toBe(0);
    expect(bloqueado.Hs_Final).toBe(0);
    expect(resultado.totales.realizadas).toBe(160);
    expect(resultado.totales.importe).toBe(12000);
    expect(resultado.hayBloqueantes).toBe(true);
    expect(resultado.bloqueantes).toEqual([
      { fecha: "2026-08-20", codigo: "DATOS_HORARIOS_IMPOSIBLES" },
    ]);
  });

  it("no calcula días ni totales si el agente no se identifica", () => {
    const resultado = mes({ nombre: "NADIE, Nadie" });
    expect(resultado.agente).toBeNull();
    expect(resultado.dias).toBeNull();
    expect(resultado.totales).toBeNull();
    expect(resultado.hayBloqueantes).toBe(true);
    expect(resultado.bloqueantes).toEqual([
      { fecha: null, codigo: "AGENTE_SIN_CONFIGURACION" },
    ]);
  });

  it("un mes entero fuera de la vigencia aporta cero y no bloquea", () => {
    const resultado = mes({
      agente: { configuraciones: [configuracion({ vigencia_desde: "2027-01-01" })] },
      dias: [{ fecha: "2026-08-18", marcaciones: [{ ingreso: "08:00", salida: "17:10" }], observacion: "" }],
    });
    expect(resultado.dias).toHaveLength(31);
    expect(resultado.hayBloqueantes).toBe(false);
    expect(resultado.bloqueantes).toEqual([]);
    expect(resultado.totales.realizadas).toBe(0);
    expect(resultado.totales.importe).toBeNull();
    expect(resultado.dias.every((dia) => (
      dia.bloqueante === null
      && dia.editable === false
      && dia.Hs_Extra_Realizada === 0
      && dia.avisos.length === 0
    ))).toBe(true);
  });

  it("un agente que empieza el día 12 deja los días anteriores en cero", () => {
    const resultado = mes({
      agente: { configuraciones: [configuracion({ vigencia_desde: "2026-08-12" })] },
      dias: [
        { fecha: "2026-08-05", marcaciones: [{ ingreso: "08:00", salida: "17:10" }], observacion: "" },
        { fecha: "2026-08-12", marcaciones: [{ ingreso: "08:00", salida: "17:10" }], observacion: "" },
      ],
    });
    const anterior = resultado.dias.find((dia) => dia.fecha === "2026-08-05");
    const inicio = resultado.dias.find((dia) => dia.fecha === "2026-08-12");
    expect(anterior.Hs_Trab).toBe(0);
    expect(anterior.Hs_Extra_Realizada).toBe(0);
    expect(anterior.Hs_Computada_Sistema).toBe(0);
    expect(anterior.Hs_Excedente).toBe(0);
    expect(anterior.Hs_Final).toBe(0);
    expect(anterior.avisos).toEqual([]);
    expect(anterior.bloqueante).toBeNull();
    expect(anterior.editable).toBe(false);
    expect(inicio.Hs_Extra_Realizada).toBe(160);
    expect(inicio.bloqueante).toBeNull();
    expect(resultado.totales.realizadas).toBe(160);
    expect(resultado.totales.valorHoraBase).toBe(4500);
    expect(resultado.hayBloqueantes).toBe(false);
  });

  it("no lanza si dos configuraciones cubren el mes", () => {
    const resultado = mes({
      agente: {
        configuraciones: [
          configuracion(),
          configuracion({ vigencia_desde: "2026-08-01", vigencia_hasta: "2026-08-31" }),
        ],
      },
    });
    expect(resultado.dias).toBeNull();
    expect(resultado.totales).toBeNull();
    expect(resultado.hayBloqueantes).toBe(true);
    expect(resultado.bloqueantes[0].codigo).toBeNull();
    expect(resultado.bloqueantes[0].fecha).toBe("2026-08-01");
  });
});
