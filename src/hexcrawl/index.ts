/**
 * Hexcrawl Wilderness Travel System
 * 
 * Barrel export for the hexcrawl module.
 */

export * from './types';
export { HexcrawlTracker } from './HexcrawlTracker';
export { HexProcedureModal, openHexProcedureModal } from './HexProcedureModal';
export type { HexProcedureResult } from './HexProcedureModal';
export {
  buildTerrainPicker,
  setHexTerrain,
  clearHexTerrain,
  getHexTerrainAt,
  drawTerrainHex,
  HexcrawlSettingsModal,
  HexDescriptionSettingsModal,
  HexDescriptionEditModal,
  setHexClimate,
  clearHexClimate,
  getHexClimateAt,
  drawClimateHexBorder,
} from './TerrainPainter';
export type { TerrainPickerState, HexcrawlSettingsResult } from './TerrainPainter';
export {
  getClimateTerrainDescription,
  getAllClimateTerrainDescriptions,
} from './ClimateDescriptions';
export { HexcrawlView, HEXCRAWL_VIEW_TYPE } from './HexcrawlView';
export { hLoc } from './HexcrawlLocale';
export type { HexcrawlBridge } from './HexcrawlView';
