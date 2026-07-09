type DigestNumber = (value: number) => void;
type DigestString = (value: string) => void;

function digestNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

function digestString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

export function mixWallVisibilityDigest(
  wall: any,
  n: DigestNumber,
  s: DigestString,
): void {
  const type = digestString(wall?.type || "wall");
  s(type);
  if (wall?.id) s(digestString(wall.id));

  n(digestNumber(wall?.start?.x));
  n(digestNumber(wall?.start?.y));
  n(digestNumber(wall?.end?.x));
  n(digestNumber(wall?.end?.y));
  n(wall?.open ? 1 : 0);
  n(digestNumber(wall?.height));

  if (wall?.openDirection !== undefined) {
    n(digestNumber(wall.openDirection));
  }
  if (wall?.pivotEnd) {
    s(digestString(wall.pivotEnd));
  }
}
