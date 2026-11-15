import { createHash } from "node:crypto";
import { analyzePower, InsufficientPowerData, powerCoordinates, powerSource } from "../../power-analysis";

export const maxDuration = 30;

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const point = powerCoordinates(query.get("lat"), query.get("lon"));
  if (!point) return Response.json({ error: "Enter a latitude from −90 to 90 and a longitude from −180 to 180." }, { status: 400 });
  const { latitude, longitude } = point;
  try {
    const nasa = await fetch(powerSource(latitude, longitude), {
      cache: "no-store", signal: AbortSignal.timeout(22000),
    });
    if (!nasa.ok) {
      const temporary = nasa.status === 429 || nasa.status >= 500;
      return Response.json({ error: temporary ? "NASA POWER is temporarily unavailable. Try again shortly."
        : "NASA POWER did not return a record for these coordinates." }, { status: temporary ? 503 : 502 });
    }
    const bytes = Buffer.from(await nasa.arrayBuffer());
    const record = analyzePower(JSON.parse(bytes.toString("utf8")), latitude, longitude, {
      retrieved_at_utc: new Date().toISOString(), sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    return Response.json(record, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
  } catch (error) {
    if (error instanceof InsufficientPowerData) return Response.json({ error: error.message }, { status: 422 });
    console.warn("NASA POWER point request failed", error);
    return Response.json({ error: "Could not verify the NASA POWER response. Try again shortly." }, { status: 502 });
  }
}
