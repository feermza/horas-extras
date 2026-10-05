import { describe, expect, it } from "vitest";
import { ejecutarPrueba } from "../../src/motor/prueba.js";

describe("ejecutarPrueba", () => {
  it("devuelve ok", () => {
    expect(ejecutarPrueba()).toBe("ok");
  });
});
