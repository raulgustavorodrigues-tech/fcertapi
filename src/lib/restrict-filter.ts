/**
 * Monta o filtro de códigos para o PostgREST sem perder produtos:
 * divide a lista em grupos `cdpro.in.(...)` combinados com OR,
 * pois um único `in` com milhares de códigos estoura o limite da URL.
 */
export function restrictFilter(codes: string[], chunk = 500): string {
  const safe = codes.map((c) => String(c).replace(/[(),]/g, "")).filter(Boolean);
  const groups: string[] = [];
  for (let i = 0; i < safe.length; i += chunk) {
    groups.push(`cdpro.in.(${safe.slice(i, i + chunk).join(",")})`);
  }
  return groups.join(",");
}
