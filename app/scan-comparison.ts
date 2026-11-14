export const compareWindows = [[1981, 2025], [1991, 2025], [2001, 2025], [1981, 2015]] as const;

export function compareAnomalies(first: (number | null)[], second: (number | null)[], yearStart: number, start: number, end: number) {
  const pairs: { year: number; a: number; b: number }[] = [];
  for (let year = start; year <= end; year++) {
    const a = first[year - yearStart];
    const b = second[year - yearStart];
    if (typeof a === "number" && typeof b === "number") pairs.push({ year, a, b });
  }

  const minimum = Math.ceil((end - start + 1) * 0.8);
  if (pairs.length < minimum) return { pairs, minimum, slopes: null };
  const meanYear = pairs.reduce((sum, pair) => sum + pair.year, 0) / pairs.length;
  const denominator = pairs.reduce((sum, pair) => sum + (pair.year - meanYear) ** 2, 0);
  const slope = (key: "a" | "b") => 10 * pairs.reduce((sum, pair) => sum + (pair.year - meanYear) * pair[key], 0) / denominator;
  return { pairs, minimum, slopes: [slope("a"), slope("b")] };
}
