import { describe, expect, it } from "vitest";
import { restrictFilter } from "./restrict-filter";

// Regra: o filtro "abaixo do mínimo" não pode deixar produtos de fora,
// independente de quantos códigos existam.
describe("restrictFilter", () => {
  it("retorna todos os códigos, divididos em grupos de OR", () => {
    const codes = Array.from({ length: 1201 }, (_, i) => String(i + 1));
    const filter = restrictFilter(codes);

    const groups = filter.split("),cdpro.in.(");
    expect(groups).toHaveLength(3);
    const restored = filter
      .replace(/cdpro\.in\.\(/g, "")
      .replace(/\)/g, "")
      .split(",")
      .map(Number);
    expect(restored).toHaveLength(1201);
    expect(Math.max(...restored)).toBe(1201);
  });

  it("remove parênteses, vírgulas e vazios que quebrariam a sintaxe do OR", () => {
    const filter = restrictFilter(["A1", "", "(ruim", "b,2", "B2"]);
    expect(filter).toBe("cdpro.in.(A1,ruim,b2,B2)");
  });

  it("lista pequena sai em um único grupo", () => {
    expect(restrictFilter(["1", "2", "3"])).toBe("cdpro.in.(1,2,3)");
  });
});
