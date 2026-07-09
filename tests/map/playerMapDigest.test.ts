import { describe, expect, it } from "vitest";
import { mixWallVisibilityDigest } from "../../src/map-views/playerMapDigest";

function hashWall(wall: any): number {
  let h = 5381;
  const n = (value: number) => { h = ((h << 5) + h + (value | 0)) | 0; };
  const s = (value: string) => {
    for (let i = 0; i < value.length; i++) {
      h = ((h << 5) + h + value.charCodeAt(i)) | 0;
    }
  };

  mixWallVisibilityDigest(wall, n, s);
  return h;
}

describe("map/playerMapDigest", () => {
  it("changes when wall endpoints change", () => {
    const base = hashWall({
      id: "wall-1",
      type: "wall",
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
    });
    const moved = hashWall({
      id: "wall-1",
      type: "wall",
      start: { x: 11, y: 20 },
      end: { x: 30, y: 40 },
    });

    expect(moved).not.toBe(base);
  });

  it("changes when wall visibility behavior changes", () => {
    const closedDoor = hashWall({
      id: "door-1",
      type: "door",
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
      open: false,
    });
    const openDoor = hashWall({
      id: "door-1",
      type: "door",
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
      open: true,
    });
    const window = hashWall({
      id: "door-1",
      type: "window",
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
      open: false,
    });

    expect(openDoor).not.toBe(closedDoor);
    expect(window).not.toBe(closedDoor);
  });
});
