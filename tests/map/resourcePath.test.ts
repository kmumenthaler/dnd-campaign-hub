import { describe, expect, it } from "vitest";
import { versionMapResourcePath } from "../../src/map/resourcePath";

describe("map/resourcePath", () => {
  it("changes the resource URL version when map dimensions change", () => {
    const first = versionMapResourcePath("app://vault/Maps/cave.png", {
      imageFile: "Maps/cave.png",
      dimensions: { width: 1000, height: 800 },
      lastModified: "2026-07-09T20:00:00.000Z",
    });
    const second = versionMapResourcePath("app://vault/Maps/cave.png", {
      imageFile: "Maps/cave.png",
      dimensions: { width: 2000, height: 1600 },
      lastModified: "2026-07-09T20:00:00.000Z",
    });

    expect(first).toContain("dndHubMapV=");
    expect(second).toContain("dndHubMapV=");
    expect(first).not.toBe(second);
  });

  it("preserves existing query parameters and hash fragments", () => {
    const versioned = versionMapResourcePath("app://vault/Maps/cave.png?foo=bar#frag", {
      imageFile: "Maps/cave.png",
      dimensions: { width: 1000, height: 800 },
    });

    expect(versioned).toContain("?foo=bar&dndHubMapV=");
    expect(versioned.endsWith("#frag")).toBe(true);
  });
});
