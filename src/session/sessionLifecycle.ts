export type SessionLifecycleStatus = "planned" | "in-progress" | "completed" | "archived";

export interface SessionCandidate<T> {
  value: T;
  status?: unknown;
  sessionNumber: number;
}

export function normalizeSessionStatus(status: unknown): SessionLifecycleStatus | null {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "planned" || normalized === "in-progress" || normalized === "completed" || normalized === "archived"
    ? normalized
    : null;
}

export function selectCurrentSession<T>(candidates: SessionCandidate<T>[]): T | null {
  const rank = (status: unknown): number => {
    switch (normalizeSessionStatus(status)) {
      case "in-progress": return 0;
      case "planned": return 1;
      case null: return 2;
      case "completed": return 3;
      case "archived": return 4;
    }
  };
  return [...candidates]
    .filter(candidate => normalizeSessionStatus(candidate.status) !== "archived")
    .sort((a, b) => rank(a.status) - rank(b.status) || b.sessionNumber - a.sessionNumber)[0]?.value ?? null;
}
