import { describe, expect, it } from "vitest";
import { _flushMapSave } from "../../src/map/MapPersistence";

function createPluginHarness(existingJson: Record<string, any>) {
  let written = "";
  const filePath = ".obsidian/plugins/dnd-campaign-hub/map-annotations/map-1.json";
  const plugin: any = {
    manifest: { id: "dnd-campaign-hub" },
    app: {
      vault: {
        configDir: ".obsidian",
        adapter: {
          exists: async (path: string) => path === filePath || path.endsWith("map-annotations"),
          read: async () => JSON.stringify(existingJson),
          write: async (_path: string, data: string) => {
            written = data;
          },
          mkdir: async () => {},
        },
      },
    },
    _pendingSaves: new Map<string, any>(),
  };

  return {
    plugin,
    getWritten: () => JSON.parse(written),
  };
}

describe("map/MapPersistence", () => {
  it("preserves template link metadata when a stale open map config saves blank values", async () => {
    const { plugin, getWritten } = createPluginHarness({
      mapId: "map-1",
      name: "Linked map",
      templateSourceId: "template-1",
      templateSourceName: "Base template",
      templateSyncedAt: "2026-07-09T08:00:00.000Z",
    });
    const timer = setTimeout(() => {}, 1000);
    plugin._pendingSaves.set("map-1", {
      config: {
        mapId: "map-1",
        name: "Linked map",
        templateSourceId: "",
        templateSourceName: "",
        templateSyncedAt: "",
      },
      el: {},
      timer,
    });

    await _flushMapSave(plugin, "map-1");

    const saved = getWritten();
    expect(saved.templateSourceId).toBe("template-1");
    expect(saved.templateSourceName).toBe("Base template");
    expect(saved.templateSyncedAt).toBe("2026-07-09T08:00:00.000Z");
  });
});
