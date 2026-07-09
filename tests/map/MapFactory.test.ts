import { describe, expect, it } from "vitest";
import {
  getTemplateSyncChangedFields,
  syncMapFromTemplate,
} from "../../src/map/MapFactory";

describe("map/MapFactory template sync", () => {
  it("copies template-owned structure while preserving instance content", () => {
    const mapData = {
      mapId: "active-map",
      name: "Active Map",
      imageFile: "Maps/old.png",
      isTemplate: false,
      templateSourceId: "template-map",
      gridSize: 70,
      walls: [{ id: "active-wall", start: { x: 1, y: 1 }, end: { x: 2, y: 2 } }],
      lightSources: [{ id: "active-light", x: 20, y: 20, bright: 10, dim: 20 }],
      tileElevations: { "1,1": 10 },
      markers: [{ id: "token-1", position: { x: 10, y: 10 } }],
      drawings: [{ id: "drawing-1", points: [{ x: 1, y: 1 }] }],
      textAnnotations: [{ id: "label-1", text: "Instance label" }],
      linkedEncounter: "z_Encounters/Fight.md",
    };

    const templateData = {
      mapId: "template-map",
      name: "Template Map",
      imageFile: "Maps/new.png",
      isTemplate: true,
      gridSize: 100,
      walls: [{ id: "wall-1", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }],
      lightSources: [{ id: "light-1", x: 5, y: 5, bright: 20, dim: 40 }],
      markers: [{ id: "template-token", position: { x: 99, y: 99 } }],
      drawings: [{ id: "template-drawing", points: [{ x: 2, y: 2 }] }],
      textAnnotations: [{ id: "template-label", text: "Template label" }],
    };

    const synced = syncMapFromTemplate(mapData, templateData);

    expect(synced.imageFile).toBe("Maps/new.png");
    expect(synced.gridSize).toBe(100);
    expect(synced.walls).toEqual([...mapData.walls, ...templateData.walls]);
    expect(synced.lightSources).toEqual([...mapData.lightSources, ...templateData.lightSources]);
    expect(synced.tileElevations).toEqual({ "1,1": 10 });
    expect(synced.markers).toEqual(mapData.markers);
    expect(synced.drawings).toEqual(mapData.drawings);
    expect(synced.textAnnotations).toEqual(mapData.textAnnotations);
    expect(synced.linkedEncounter).toBe("z_Encounters/Fight.md");
    expect(synced.templateSourceId).toBe("template-map");
    expect(synced.templateSourceName).toBe("Template Map");
  });

  it("reports only template-owned field changes", () => {
    const changedFields = getTemplateSyncChangedFields(
      {
        mapId: "active-map",
        imageFile: "Maps/map.png",
        gridSize: 70,
        walls: [],
        markers: [{ id: "active-token" }],
      },
      {
        mapId: "template-map",
        imageFile: "Maps/map.png",
        gridSize: 100,
        walls: [{ id: "template-wall" }],
        markers: [{ id: "template-token" }],
      },
    );

    expect(changedFields).toContain("gridSize");
    expect(changedFields).toContain("walls");
    expect(changedFields).not.toContain("markers" as any);
  });

  it("does not keep reporting collection fields changed just because the battlemap has additions", () => {
    const templateData = {
      mapId: "template-map",
      imageFile: "Maps/map.png",
      gridSize: 70,
      walls: [{ id: "template-wall" }],
      lightSources: [{ id: "template-light", x: 5, y: 5 }],
    };
    const syncedMap = syncMapFromTemplate(
      {
        mapId: "active-map",
        imageFile: "Maps/map.png",
        gridSize: 70,
        walls: [{ id: "active-wall" }],
        lightSources: [{ id: "active-light", x: 10, y: 10 }],
      },
      templateData,
    );

    const changedFields = getTemplateSyncChangedFields(syncedMap, templateData);

    expect(changedFields).not.toContain("walls");
    expect(changedFields).not.toContain("lightSources");
  });

  it("updates matching template items by id without removing battlemap additions", () => {
    const synced = syncMapFromTemplate(
      {
        mapId: "active-map",
        walls: [
          { id: "template-wall", name: "Old wall", start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
          { id: "active-wall", name: "Battlemap wall", start: { x: 2, y: 2 }, end: { x: 3, y: 3 } },
        ],
      },
      {
        mapId: "template-map",
        isTemplate: true,
        walls: [
          { id: "template-wall", name: "Updated wall", start: { x: 0, y: 0 }, end: { x: 5, y: 5 } },
        ],
      },
    );

    expect(synced.walls).toEqual([
      { id: "template-wall", name: "Updated wall", start: { x: 0, y: 0 }, end: { x: 5, y: 5 } },
      { id: "active-wall", name: "Battlemap wall", start: { x: 2, y: 2 }, end: { x: 3, y: 3 } },
    ]);
  });
});
