declare module "jstat" {
  const jStat: {
    studentt: { inv: (probability: number, degreesOfFreedom: number) => number };
    ibeta: (x: number, a: number, b: number) => number;
  };
  export default jStat;
}
