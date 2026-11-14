export type Estimate = {
  confidence_interval: number[] | null;
  p_value: number | null;
};

export function signed(value: number, digits = 3) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  });
}

export function pValue(value: number | null) {
  if (value === null) return "Unavailable";
  return value < 0.001 ? value.toExponential(2) : value.toFixed(4);
}

export function interval(value: number[] | null) {
  return value ? value.map(bound => bound !== 0 && Math.abs(bound) < 0.001
    ? (bound > 0 ? "+" : "") + bound.toExponential(2) : signed(bound)).join(" to ") : "Unavailable";
}

export function includesZero(value: number[] | null) {
  return value ? value[0] <= 0 && value[1] >= 0 : null;
}

export function compareIntervals(conventional: Estimate, hac: Estimate) {
  const conventionalZero = includesZero(conventional.confidence_interval);
  const hacZero = includesZero(hac.confidence_interval);
  if (conventionalZero === null || hacZero === null) {
    return "At least one uncertainty estimate is unavailable.";
  }
  if (conventionalZero && hacZero) return "Both 95% intervals include zero.";
  if (conventionalZero !== hacZero) return "Only one 95% interval includes zero. The uncertainty conclusion depends on the method.";
  return "Both 95% intervals exclude zero for the fitted slope.";
}
