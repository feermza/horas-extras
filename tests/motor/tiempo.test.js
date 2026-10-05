import { describe, expect, it } from "vitest";
import {
  duracionPar,
  formatearHM,
  intervaloDePar,
  parsearDuracion,
  parsearHora,
  solapamiento,
  solapamientoTotal,
} from "../../src/motor/tiempo.js";

/** Después de las 14:30, solo como intervalo. La clasificación es de la fase 3. */
const DESPUES = { inicio: 870, fin: 1440 };

/** Antes de las 08:00, solo como intervalo. */
const ANTES = { inicio: 0, fin: 480 };

/**
 * @param {string} ingreso
 * @param {string} salida
 * @returns {{ inicio: number, fin: number }}
 */
function par(ingreso, salida) {
  return intervaloDePar(parsearHora(ingreso), parsearHora(salida));
}

describe("parsearHora", () => {
  it("acepta H:MM, HH:MM y trunca los segundos", () => {
    expect(parsearHora("0:00")).toBe(0);
    expect(parsearHora("00:00")).toBe(0);
    expect(parsearHora("8:05")).toBe(485);
    expect(parsearHora("08:05")).toBe(485);
    expect(parsearHora("23:59")).toBe(1439);
    expect(parsearHora("08:00:00")).toBe(480);
    expect(parsearHora("8:05:09")).toBe(485);
    expect(parsearHora("08:05:09")).toBe(485);
    expect(parsearHora("23:59:59")).toBe(1439);
  });

  it("devuelve null, sin lanzar, ante entradas inválidas", () => {
    const invalidos = [
      null,
      undefined,
      480,
      8.5,
      true,
      {},
      [],
      "",
      "   ",
      "8",
      "8:0",
      "08-00",
      "08:00:00:00",
      " 08:00",
      "08:00 ",
      "8.00",
      "abc",
      "24:00",
      "25:30",
      "12:60",
      "8:99",
      "12:30:60",
      "23:59:99",
      "-1:00",
      "08:00:",
    ];
    for (const valor of invalidos) {
      expect(parsearHora(valor)).toBeNull();
    }
  });
});

describe("parsearDuracion", () => {
  it("acepta horas sin tope de 23 y minutos de 00 a 59", () => {
    expect(parsearDuracion("0:00")).toBe(0);
    expect(parsearDuracion("00:00")).toBe(0);
    expect(parsearDuracion("4:00")).toBe(240);
    expect(parsearDuracion("04:00")).toBe(240);
    expect(parsearDuracion("24:00")).toBe(1440);
    expect(parsearDuracion("560:00")).toBe(33600);
  });

  it("devuelve null ante entradas inválidas", () => {
    const invalidos = [
      null,
      undefined,
      240,
      "",
      "   ",
      "4",
      "4:0",
      "4:60",
      "04:00:30",
      "-1:00",
      "abc",
      " 4:00",
      "4:00 ",
      "560:000",
    ];
    for (const valor of invalidos) {
      expect(parsearDuracion(valor)).toBeNull();
    }
  });
});

describe("formatearHM", () => {
  it("escribe horas sin cero a la izquierda y minutos con dos dígitos", () => {
    expect(formatearHM(0)).toBe("0:00");
    expect(formatearHM(65)).toBe("1:05");
    expect(formatearHM(160)).toBe("2:40");
    expect(formatearHM(600)).toBe("10:00");
    expect(formatearHM(33600)).toBe("560:00");
  });

  it("lanza RangeError si el valor no es un entero mayor o igual que 0", () => {
    const invalidos = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, "160", true];
    for (const valor of invalidos) {
      expect(() => formatearHM(valor)).toThrow(RangeError);
    }
  });
});

describe("ida y vuelta", () => {
  it("parsearHora(formatearHM(m)) recupera cada minuto del día", () => {
    for (let m = 0; m <= 1439; m += 1) {
      expect(parsearHora(formatearHM(m))).toBe(m);
    }
  });

  it("parsearDuracion(formatearHM(m)) recupera 0..2000 y 33600", () => {
    for (let m = 0; m <= 2000; m += 1) {
      expect(parsearDuracion(formatearHM(m))).toBe(m);
    }
    expect(parsearDuracion(formatearHM(33600))).toBe(33600);
  });
});

describe("duracionPar e intervaloDePar", () => {
  it("caso 17: 22:00-01:30 cruza la medianoche y dura 3:30", () => {
    const ingreso = parsearHora("22:00");
    const salida = parsearHora("01:30");
    expect(ingreso).toBe(1320);
    expect(salida).toBe(90);
    expect(duracionPar(ingreso, salida)).toBe(210);
    expect(formatearHM(210)).toBe("3:30");
    expect(intervaloDePar(ingreso, salida)).toEqual({ inicio: 1320, fin: 1530 });
  });

  it("calcula pares dentro del mismo día, nulos y de un minuto", () => {
    expect(duracionPar(parsearHora("08:00"), parsearHora("12:00"))).toBe(240);
    expect(intervaloDePar(parsearHora("08:00"), parsearHora("12:00"))).toEqual({
      inicio: 480,
      fin: 720,
    });

    expect(duracionPar(parsearHora("08:00"), parsearHora("08:00"))).toBe(0);
    expect(intervaloDePar(parsearHora("08:00"), parsearHora("08:00"))).toEqual({
      inicio: 480,
      fin: 480,
    });

    expect(duracionPar(parsearHora("23:59"), parsearHora("00:00"))).toBe(1);
    expect(intervaloDePar(parsearHora("23:59"), parsearHora("00:00"))).toEqual({
      inicio: 1439,
      fin: 1440,
    });

    expect(duracionPar(parsearHora("00:00"), parsearHora("23:59"))).toBe(1439);
    expect(intervaloDePar(parsearHora("00:00"), parsearHora("23:59"))).toEqual({
      inicio: 0,
      fin: 1439,
    });
  });

  it("acepta los extremos 0 y 1439", () => {
    expect(duracionPar(0, 1439)).toBe(1439);
    expect(duracionPar(1439, 0)).toBe(1);
    expect(intervaloDePar(0, 1439)).toEqual({ inicio: 0, fin: 1439 });
    expect(intervaloDePar(1439, 0)).toEqual({ inicio: 1439, fin: 1440 });
  });

  it("lanza RangeError si ingreso o salida no son enteros entre 0 y 1439", () => {
    const invalidos = [null, undefined, Number.NaN, 1.5, -1, 1440, "08:00"];
    for (const valor of invalidos) {
      expect(() => duracionPar(valor, 0)).toThrow(RangeError);
      expect(() => duracionPar(0, valor)).toThrow(RangeError);
      expect(() => intervaloDePar(valor, 0)).toThrow(RangeError);
      expect(() => intervaloDePar(0, valor)).toThrow(RangeError);
    }
  });
});

describe("solapamiento", () => {
  it("intersecta con la ventana de después de las 14:30", () => {
    expect(solapamiento(par("08:00", "17:10"), DESPUES)).toBe(160);
    expect(solapamiento(par("08:00", "15:15"), DESPUES)).toBe(45);
    expect(solapamiento(par("08:00", "15:20"), DESPUES)).toBe(50);
    expect(solapamiento(par("07:00", "16:00"), DESPUES)).toBe(90);
    expect(solapamiento(par("08:00", "21:30"), DESPUES)).toBe(420);
  });

  it("intersecta con la ventana de antes de las 08:00", () => {
    expect(solapamiento(par("07:05", "14:30"), ANTES)).toBe(55);
    expect(solapamiento(par("07:00", "16:00"), ANTES)).toBe(60);
  });

  it("caso 13: la franja 08:00-12:00 cubre 4:00 y deja 1:00 afuera", () => {
    const intervalo = par("08:00", "13:00");
    const franja = { inicio: 480, fin: 720 };
    const dentro = solapamiento(intervalo, franja);
    expect(dentro).toBe(240);
    expect(duracionPar(parsearHora("08:00"), parsearHora("13:00")) - dentro).toBe(60);
  });

  it("devuelve 0 si el tramo común no es positivo, incluso con un intervalo invertido", () => {
    expect(solapamiento({ inicio: 100, fin: 50 }, { inicio: 0, fin: 200 })).toBe(0);
    expect(solapamiento({ inicio: 0, fin: 200 }, { inicio: 100, fin: 50 })).toBe(0);
  });

  it("trata bordes, inclusión y el arreglo vacío", () => {
    expect(solapamiento({ inicio: 0, fin: 100 }, { inicio: 200, fin: 300 })).toBe(0);
    expect(solapamiento({ inicio: 0, fin: 480 }, { inicio: 480, fin: 900 })).toBe(0);
    expect(solapamiento({ inicio: 480, fin: 900 }, { inicio: 0, fin: 480 })).toBe(0);
    expect(solapamiento({ inicio: 0, fin: 600 }, { inicio: 100, fin: 200 })).toBe(100);
    expect(solapamiento({ inicio: 100, fin: 200 }, { inicio: 0, fin: 600 })).toBe(100);
    expect(solapamientoTotal([], DESPUES)).toBe(0);
  });

  it("suma sin unir intervalos que se pisan entre sí", () => {
    const total = solapamientoTotal(
      [
        { inicio: 0, fin: 100 },
        { inicio: 50, fin: 150 },
      ],
      { inicio: 0, fin: 200 },
    );
    expect(total).toBe(200);
  });

  it("mide el tramo del caso 17 que cae antes y después de la medianoche", () => {
    const intervalo = par("22:00", "01:30");
    expect(solapamiento(intervalo, { inicio: 870, fin: 1440 })).toBe(120);
    expect(solapamiento(intervalo, { inicio: 1440, fin: 1530 })).toBe(90);
  });
});
