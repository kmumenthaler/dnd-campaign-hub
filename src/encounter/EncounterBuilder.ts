import { App, Notice, TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { updateYamlFrontmatter } from "../utils/YamlFrontmatter";

// Trap-related interfaces
export interface TrapElement {
  name: string;
  element_type: 'active' | 'dynamic' | 'constant';
  initiative?: number;  // For active elements
  attack_bonus?: number;
  save_dc?: number;
  save_ability?: string;
  damage?: string;
  additional_damage?: string;  // Extra damage (e.g., ongoing, secondary)
  range?: string;  // Attack/effect range (e.g., "60 ft.", "Touch")
  on_success?: string;  // What happens on successful save
  on_failure?: string;  // What happens on failed save
  effect?: string;
  condition?: string;  // For dynamic elements
}

export interface TrapCountermeasure {
  method: string;
  description?: string;
  dc?: number;
  checks_needed?: number;
  effect?: string;
}

export interface EncounterCreature {
  name: string;
  count: number;
  hp?: number;
  ac?: number;
  cr?: string;
  source?: string;
  path?: string;  // Path to creature file for statblock plugin
  isCustom?: boolean;  // Temporary custom creature
  isFriendly?: boolean;  // Friendly NPC/creature
  isHidden?: boolean;  // Hidden from players
  isTrap?: boolean;  // Trap hazard (uses trap calculation logic)
  trapData?: {  // Trap-specific data for difficulty calculation
    elements: TrapElement[];
    threatLevel: 'setback' | 'dangerous' | 'deadly';
    trapType: 'simple' | 'complex';
  };
}

export interface EncounterData {
  name: string;
  creatures: EncounterCreature[];
  includeParty: boolean;
  useColorNames: boolean;
  adventurePath?: string;
  scenePath?: string;
  campaignPath?: string;
  difficulty?: {
    rating: string;
    color: string;
    summary: string;
    partyStats?: any;
    enemyStats?: any;
  };
}

export class EncounterBuilder {
  app: App;
  plugin: DndCampaignHubPlugin;

  encounterName = "";
  creatures: EncounterCreature[] = [];
  includeParty = true;
  selectedPartyMembers: string[] = [];
  selectedPartyId = "";
  useColorNames = false;
  adventurePath = "";
  scenePath = "";
  campaignPath = "";

  constructor(app: App, plugin: DndCampaignHubPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  /**
   * Refresh party data from vault frontmatter
   */
  async refreshPartyData(): Promise<boolean> {
    try {
      await this.plugin.partyManager.syncAllMemberNames();
      new Notice("✅ Party stats refreshed from vault notes");
      return true;
    } catch (error) {
      console.error("[RefreshPartyData] Error refreshing party data:", error);
      new Notice("❌ Failed to refresh party stats");
      return false;
    }
  }

  findCampaignFolder(filePath: string): string | null {
    // Look for campaign folder in path (folders containing "ttrpgs" subdirectory)
    const parts = filePath.split('/');
    for (let i = parts.length - 1; i >= 0; i--) {
      const potentialCampaign = parts.slice(0, i + 1).join('/');
      const ttrpgPath = `${potentialCampaign}/ttrpgs`;
      if (this.app.vault.getAbstractFileByPath(ttrpgPath)) {
        return potentialCampaign;
      }
    }
    return null;
  }

  async getAvailablePartyMembers(): Promise<Array<{ name: string; level: number; hp: number; ac: number; cr?: string }>> {
    const members: Array<{ name: string; level: number; hp: number; ac: number; cr?: string }> = [];

    try {
      const party = this.resolveParty();
      if (!party) return members;

      const resolved = await this.plugin.partyManager.resolveMembers(party.id);
      for (const m of resolved) {
        members.push({
          name: m.name,
          level: m.level,
          hp: m.maxHp,
          ac: m.ac,
          cr: m.cr,
        });
      }
    } catch (error) {
      console.error("Error getting available party members:", error);
    }

    return members;
  }

  async getAvailableParties(): Promise<Array<{ id: string; name: string }>> {
    try {
      return this.plugin.partyManager.getParties().map((p) => ({ id: p.id, name: p.name }));
    } catch (error) {
      console.error("Error getting available parties:", error);
      return [];
    }
  }

  async getResolvedParty(): Promise<{ id: string; name: string } | null> {
    const party = this.resolveParty();
    if (!party) return null;
    return { id: party.id, name: party.name };
  }

  async getPartyForDifficulty(): Promise<Array<{ level: number; hp?: number; ac?: number }>> {
    if (!this.includeParty) return [];

    const partyMembers: Array<{ level: number; hp?: number; ac?: number }> = [];

    try {
      const party = this.resolveParty();
      if (!party) return partyMembers;

      const resolved = await this.plugin.partyManager.resolveMembers(party.id);
      for (const m of resolved) {
        partyMembers.push({
          level: m.level,
          hp: m.maxHp,
          ac: m.ac,
        });
      }
    } catch (error) {
      console.error("Error getting party for difficulty:", error);
    }

    return partyMembers;
  }

  async getSelectedPartyPlayers(): Promise<any[]> {
    try {
      const party = this.resolveParty();
      if (!party) return [];

      const resolved = await this.plugin.partyManager.resolveMembers(party.id);
      const selectedNames = this.selectedPartyMembers.length > 0
        ? new Set(this.selectedPartyMembers)
        : null;

      return resolved
        .filter((m) => !selectedNames || selectedNames.has(m.name))
        .map((m) => ({
          name: m.name,
          level: m.level,
          hp: m.maxHp,
          currentMaxHP: m.maxHp,
          currentHP: m.hp,
          ac: m.ac,
          currentAC: m.ac,
          thp: m.thp,
          path: m.notePath,
          note: m.notePath,
          tokenId: m.tokenId,
          initBonus: m.initBonus,
        }));
    } catch (error) {
      console.error("Error getting selected party players:", error);
      return [];
    }
  }

  resolveParty(campaignNameOverride?: string): any | null {
    const pm = this.plugin.partyManager;

    if (this.selectedPartyId) {
      const selected = pm.getParty(this.selectedPartyId) || pm.getPartyByName(this.selectedPartyId);
      if (selected) return selected;
    }

    let campaignName = campaignNameOverride || "";
    
    // Use campaignPath if available (e.g., "ttrpgs/Frozen Sick (SOLINA)")
    if (!campaignName && this.campaignPath) {
      const pathParts = this.campaignPath.split('/');
      campaignName = pathParts[pathParts.length - 1] || "";
    }
    
    if (!campaignName) {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        const campaignFolder = this.findCampaignFolder(activeFile.path);
        if (campaignFolder) {
          campaignName = campaignFolder.split('/').pop() || "";
        }
      }
    }

    if (campaignName) {
      const partyName = `${campaignName} Party`;
      const namedParty = pm.getPartyByName(partyName);
      if (namedParty) return namedParty;
    }

    return pm.getDefaultParty() || null;
  }

  getCRStats(cr: string | undefined): { hp: number; ac: number; dpr: number; attackBonus: number; xp: number } {
    // CR stats table from D&D 5e DMG
    const crTable: { [key: string]: { hp: number; ac: number; dpr: number; attackBonus: number; xp: number } } = {
      "0": { hp: 5, ac: 13, dpr: 1, attackBonus: 3, xp: 10 },
      "1/8": { hp: 10, ac: 13, dpr: 2, attackBonus: 3, xp: 25 },
      "1/4": { hp: 20, ac: 13, dpr: 3, attackBonus: 3, xp: 50 },
      "1/2": { hp: 35, ac: 13, dpr: 5, attackBonus: 3, xp: 100 },
      "1": { hp: 70, ac: 13, dpr: 8, attackBonus: 3, xp: 200 },
      "2": { hp: 85, ac: 13, dpr: 15, attackBonus: 3, xp: 450 },
      "3": { hp: 100, ac: 13, dpr: 21, attackBonus: 4, xp: 700 },
      "4": { hp: 115, ac: 14, dpr: 27, attackBonus: 5, xp: 1100 },
      "5": { hp: 130, ac: 15, dpr: 33, attackBonus: 6, xp: 1800 },
      "6": { hp: 145, ac: 15, dpr: 39, attackBonus: 6, xp: 2300 },
      "7": { hp: 160, ac: 15, dpr: 45, attackBonus: 6, xp: 2900 },
      "8": { hp: 175, ac: 16, dpr: 51, attackBonus: 7, xp: 3900 },
      "9": { hp: 190, ac: 16, dpr: 57, attackBonus: 7, xp: 5000 },
      "10": { hp: 205, ac: 17, dpr: 63, attackBonus: 7, xp: 5900 },
      "11": { hp: 220, ac: 17, dpr: 69, attackBonus: 7, xp: 7200 },
      "12": { hp: 235, ac: 17, dpr: 75, attackBonus: 8, xp: 8400 },
      "13": { hp: 250, ac: 18, dpr: 81, attackBonus: 8, xp: 10000 },
      "14": { hp: 265, ac: 18, dpr: 87, attackBonus: 8, xp: 11500 },
      "15": { hp: 280, ac: 18, dpr: 93, attackBonus: 8, xp: 13000 },
      "16": { hp: 295, ac: 18, dpr: 99, attackBonus: 9, xp: 15000 },
      "17": { hp: 310, ac: 19, dpr: 105, attackBonus: 10, xp: 18000 },
      "18": { hp: 325, ac: 19, dpr: 111, attackBonus: 10, xp: 20000 },
      "19": { hp: 340, ac: 19, dpr: 117, attackBonus: 10, xp: 22000 },
      "20": { hp: 355, ac: 19, dpr: 123, attackBonus: 10, xp: 25000 },
      "21": { hp: 400, ac: 19, dpr: 140, attackBonus: 11, xp: 33000 },
      "22": { hp: 450, ac: 19, dpr: 150, attackBonus: 11, xp: 41000 },
      "23": { hp: 500, ac: 19, dpr: 160, attackBonus: 11, xp: 50000 },
      "24": { hp: 550, ac: 19, dpr: 170, attackBonus: 12, xp: 62000 },
      "25": { hp: 600, ac: 19, dpr: 180, attackBonus: 12, xp: 75000 },
      "26": { hp: 650, ac: 19, dpr: 190, attackBonus: 12, xp: 90000 },
      "27": { hp: 700, ac: 19, dpr: 200, attackBonus: 13, xp: 105000 },
      "28": { hp: 750, ac: 19, dpr: 210, attackBonus: 13, xp: 120000 },
      "29": { hp: 800, ac: 19, dpr: 220, attackBonus: 13, xp: 135000 },
      "30": { hp: 850, ac: 19, dpr: 230, attackBonus: 14, xp: 155000 }
    };

    return crTable[cr || "1/4"] || crTable["1/4"]!;
  }

  getLevelStats(level: number): { hp: number; ac: number; dpr: number; attackBonus: number } {
    // Level-based stats from D&D 5e Player's Handbook averages
    // Updated DPR to be more realistic for actual play
    const baseHP = 8; // Average starting HP
    const hpPerLevel = 5; // Average HP gain per level
    const baseAC = 12;
    const acIncreaseInterval = 4; // AC increases every 4 levels
    const baseDPR = 8; // Starting DPR at level 1 (more realistic)
    const dprPerLevel = 2.5; // DPR increases more significantly per level
    const baseAttackBonus = 2;
    const proficiencyBonus = Math.floor((level - 1) / 4) + 2;

    return {
      hp: baseHP + hpPerLevel * (level - 1),
      ac: baseAC + Math.floor(level / acIncreaseInterval),
      dpr: baseDPR + dprPerLevel * (level - 1),
      attackBonus: baseAttackBonus + proficiencyBonus
    };
  }

  calculateHitChance(attackBonus: number, targetAC: number): number {
    const rollNeeded = Math.max(2, Math.min(20, targetAC - attackBonus));
    return Math.max(0.05, Math.min(0.95, (21 - rollNeeded) / 20));
  }

  calculateEffectiveDPR(baseDPR: number, hitChance: number): number {
    return baseDPR * hitChance;
  }

  calculateRoundsToDefeat(totalHP: number, effectiveDPR: number): number {
    if (effectiveDPR <= 0) return 999;
    return Math.max(1, Math.ceil(totalHP / effectiveDPR));
  }

  /**
   * Detect if trap effect text indicates area-of-effect (multiple targets)
   */
  detectAoETargets(effectText: string): number {
    if (!effectText) return 1;
    
    const text = effectText.toLowerCase();
    
    // Strong AoE indicators - likely hits all party members
    const strongAoE = [
      'each creature',
      'all creatures',
      'any creature',
      'creatures in the',
      'everyone in',
      'all targets',
      'each target',
      'all characters'
    ];
    
    for (const indicator of strongAoE) {
      if (text.includes(indicator)) {
        return 4; // Average party size
      }
    }
    
    // Area indicators with size
    const areaPatterns = [
      /(\d+)-foot (radius|cone|cube|line|sphere|cylinder)/,
      /(\d+)-foot.{0,20}(radius|cone|cube|line|sphere|cylinder)/,
      /within (\d+) feet/
    ];
    
    for (const pattern of areaPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const size = parseInt(match[1]);
        // Estimate targets based on area size
        let targets = 1;
        if (size >= 30) targets = 4; // Large area
        else if (size >= 20) targets = 3; // Medium area
        else if (size >= 10) targets = 2; // Small area
        return targets;
      }
    }
    
    // Moderate AoE indicators - likely hits 2-3 characters
    const moderateAoE = [
      'creatures within',
      'multiple targets',
      'targets within',
      'nearby creatures',
      'adjacent creatures'
    ];
    
    for (const indicator of moderateAoE) {
      if (text.includes(indicator)) {
        return 2;
      }
    }
    
    // Single target indicators
    const singleTarget = [
      'one target',
      'one creature',
      'single target',
      'the target',
      'a target'
    ];
    
    for (const indicator of singleTarget) {
      if (text.includes(indicator)) {
        return 1;
      }
    }
    
    // No clear indicators - check if it mentions targeting at all
    if (text.includes('target') || text.includes('creature')) {
      return 2; // Conservative estimate for unclear traps
    }
    
    return 1;
  }

  /**
   * Calculate trap stats for encounter difficulty
   * Traps are treated as hostile entities that deal damage but have different mechanics
   */
  calculateTrapStats(trapData: {
    elements: TrapElement[];
    threatLevel: 'setback' | 'dangerous' | 'deadly';
    trapType: 'simple' | 'complex';
  }): { hp: number; ac: number; dpr: number; attackBonus: number; cr: string } {
    
    
    let totalDamage = 0;
    let maxDC = 0;
    let maxAttackBonus = 0;
    let elementCount = 0;
    let maxAoETargets = 1;

    // Parse damage from each element and detect AoE
    for (const element of trapData.elements) {
      
      if (element.damage) {
        const avgDamage = this.parseTrapDamage(element.damage);
        totalDamage += avgDamage;
        elementCount++;
      }

      if (element.additional_damage) {
        const additionalDmg = this.parseTrapDamage(element.additional_damage);
        totalDamage += additionalDmg;
      }

      if (element.save_dc && element.save_dc > maxDC) {
        maxDC = element.save_dc;
      }

      if (element.attack_bonus && element.attack_bonus > maxAttackBonus) {
        maxAttackBonus = element.attack_bonus;
      }
      
      // Check for AoE indicators in effect text
      if (element.effect) {
        const targets = this.detectAoETargets(element.effect);
        if (targets > maxAoETargets) {
          maxAoETargets = targets;
        }
      } else {
      }
    }

    // Calculate DPR (damage per round)
    // All trap elements deal their full damage (even if on different initiatives)
    // Complex traps with multiple initiatives create sustained threat, not reduced damage
    let dpr = totalDamage;

    // Multiply DPR by number of targets for AoE traps
    if (maxAoETargets > 1) {
      dpr *= maxAoETargets;
    }

    // Apply threat level modifier to DPR
    if (trapData.threatLevel === 'dangerous') {
      dpr *= 1.25;
    } else if (trapData.threatLevel === 'deadly') {
      dpr *= 1.5;
    } else if (trapData.threatLevel === 'setback') {
      dpr *= 0.75;
    }

    // Determine attack bonus or save DC for hit chance calculation
    // Prefer attack bonus if present, otherwise derive from save DC
    const attackBonus = maxAttackBonus > 0 
      ? maxAttackBonus 
      : maxDC > 0 
        ? Math.floor((maxDC - 8) / 0.8) // Approximate attack bonus from DC
        : 5; // Default moderate attack bonus

    // Traps have high AC (hard to damage) but can be disabled
    // AC 15-20 depending on complexity and threat level
    let ac = 15;
    if (trapData.trapType === 'complex') ac += 2;
    if (trapData.threatLevel === 'dangerous') ac += 1;
    if (trapData.threatLevel === 'deadly') ac += 2;

    // Traps have limited HP (they're not creatures)
    // HP represents how much effort to disable/destroy
    // Base HP is proportional to DPR and threat level
    let hp = Math.max(1, Math.floor(dpr * 2));
    if (trapData.threatLevel === 'dangerous') hp *= 1.5;
    if (trapData.threatLevel === 'deadly') hp *= 2;

    // Estimate CR based on DPR
    let estimatedCR = this.estimateCRFromDPR(dpr);
    
    // Adjust CR based on save DC or attack bonus
    if (maxDC > 0 || maxAttackBonus > 0) {
      const dcOrAttack = maxDC > 0 ? maxDC : maxAttackBonus;
      const crByDC = this.estimateCRFromDC(dcOrAttack);
      estimatedCR = Math.round((estimatedCR + crByDC) / 2);
    }

    const crString = this.formatCR(estimatedCR);


    return {
      hp,
      ac,
      dpr,
      attackBonus,
      cr: crString
    };
  }

  /**
   * Parse trap damage string to average damage value
   * Examples: "4d10" -> 22, "2d6+3" -> 10, "45" -> 45
   */
  parseTrapDamage(damageStr: string | undefined): number {
    if (!damageStr) return 0;
    
    
    let cleanDamage = damageStr.trim().toLowerCase();
    
    // Remove damage type (e.g., "4d10 fire" -> "4d10")
    const parts = cleanDamage.split(' ');
    cleanDamage = parts[0] || cleanDamage;

    // Parse dice notation FIRST: XdY+Z or XdY-Z or XdY
    const diceMatch = cleanDamage.match(/(\d+)d(\d+)([+-]\d+)?/);
    if (diceMatch) {
      const numDice = parseInt(diceMatch[1]!);
      const dieSize = parseInt(diceMatch[2]!);
      const modifier = diceMatch[3] ? parseInt(diceMatch[3]) : 0;
      
      // Average of XdY is X * (Y+1)/2
      const avgRoll = numDice * (dieSize + 1) / 2;
      const total = Math.floor(avgRoll + modifier);
      return total;
    }

    // Check if it's just a number (static damage)
    const staticDamage = parseInt(cleanDamage);
    if (!isNaN(staticDamage)) {
      return staticDamage;
    }

    return 0;
  }

  /**
   * Estimate CR from DPR using D&D 5e CR table
   */
  estimateCRFromDPR(dpr: number): number {
    const crDPRTable = [
      { cr: 0, dpr: 1 },
      { cr: 0.125, dpr: 2 },
      { cr: 0.25, dpr: 3 },
      { cr: 0.5, dpr: 5 },
      { cr: 1, dpr: 8 },
      { cr: 2, dpr: 15 },
      { cr: 3, dpr: 21 },
      { cr: 4, dpr: 27 },
      { cr: 5, dpr: 33 },
      { cr: 6, dpr: 39 },
      { cr: 7, dpr: 45 },
      { cr: 8, dpr: 51 },
      { cr: 9, dpr: 57 },
      { cr: 10, dpr: 63 },
      { cr: 11, dpr: 69 },
      { cr: 12, dpr: 75 },
      { cr: 13, dpr: 81 },
      { cr: 14, dpr: 87 },
      { cr: 15, dpr: 93 },
      { cr: 16, dpr: 99 },
      { cr: 17, dpr: 105 },
      { cr: 18, dpr: 111 },
      { cr: 19, dpr: 117 },
      { cr: 20, dpr: 123 }
    ];

    let closestCR = 0;
    let minDiff = Infinity;

    for (const entry of crDPRTable) {
      const diff = Math.abs(entry.dpr - dpr);
      if (diff < minDiff) {
        minDiff = diff;
        closestCR = entry.cr;
      }
    }

    return closestCR;
  }

  /**
   * Estimate CR from save DC or attack bonus
   */
  estimateCRFromDC(dc: number): number {
    const crDCTable = [
      { cr: 0, dc: 13 },
      { cr: 1, dc: 13 },
      { cr: 2, dc: 13 },
      { cr: 3, dc: 13 },
      { cr: 4, dc: 14 },
      { cr: 5, dc: 15 },
      { cr: 8, dc: 16 },
      { cr: 11, dc: 17 },
      { cr: 13, dc: 18 },
      { cr: 17, dc: 19 },
      { cr: 21, dc: 20 },
      { cr: 24, dc: 21 },
      { cr: 27, dc: 22 },
      { cr: 29, dc: 23 },
      { cr: 30, dc: 24 }
    ];

    let closestCR = 0;
    let minDiff = Infinity;

    for (const entry of crDCTable) {
      const diff = Math.abs(entry.dc - dc);
      if (diff < minDiff) {
        minDiff = diff;
        closestCR = entry.cr;
      }
    }

    return closestCR;
  }

  /**
   * Format CR as string (handles fractional CRs)
   */
  formatCR(cr: number): string {
    if (cr === 0.125) return "1/8";
    if (cr === 0.25) return "1/4";
    if (cr === 0.5) return "1/2";
    return cr.toString();
  }

  /**
   * Parse statblock YAML to extract real combat stats
   * Returns hp, ac, dpr (damage per round), and attackBonus
   */
  async parseStatblockStats(filePath: string): Promise<{ hp: number; ac: number; dpr: number; attackBonus: number; hasPackTactics?: boolean } | null> {
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof TFile)) {
        return null;
      }

      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache?.frontmatter) {
        return null;
      }

      const fm = cache.frontmatter;
      
      // Extract basic stats
      const hp = this.parseHP(fm.hp);
      const ac = this.parseAC(fm.ac);
      
      // Calculate DPR and attack bonus from actions
      let totalDPR = 0;
      let highestAttackBonus = 0;
      let attackCount = 0;
      
      // Parse standard actions for base DPR
      if (fm.actions && Array.isArray(fm.actions)) {
        for (const action of fm.actions) {
          if (!action.name) continue;
          
          const actionName = String(action.name).toLowerCase();
          
          // Skip multiattack (handled separately as a multiplier)
          if (actionName.includes('multiattack')) continue;
          
          // === Detect Recharge abilities (e.g. "Fire Breath (Recharge 5-6)") ===
          // These are powerful but not available every round
          let rechargeWeight = 1.0;
          const rechargeMatch = actionName.match(/recharge\s+(\d+)(?:\s*[-–]\s*(\d+))?/i);
          if (rechargeMatch) {
            const low = parseInt(rechargeMatch[1]!);
            const high = rechargeMatch[2] ? parseInt(rechargeMatch[2]) : 6;
            // Probability of recharging on a d6 roll
            const rechargeChance = (high - low + 1) / 6;
            // Effective weight: use on round 1 + expected uses from recharges
            // Over a 4-round combat: 1 initial use + (3 rounds × rechargeChance)
            // Average DPR contribution = totalDamage × (1 + 3 × chance) / 4
            rechargeWeight = (1 + 3 * rechargeChance) / 4;
          }
          
          // === CHECK STRUCTURED FIELDS FIRST ===
          let actionDPR = 0;
          let actionAttackBonus = 0;
          let usedStructuredData = false;
          
          // Check for attack_bonus field
          if (typeof action.attack_bonus === 'number') {
            actionAttackBonus = action.attack_bonus;
            if (actionAttackBonus > highestAttackBonus) {
              highestAttackBonus = actionAttackBonus;
            }
            usedStructuredData = true;
          }
          
          // Check for damage_dice and damage_bonus fields
          if (action.damage_dice || action.damage_bonus) {
            let diceDamage = 0;
            if (action.damage_dice && typeof action.damage_dice === 'string') {
              const diceMatch = action.damage_dice.match(/(\d+)d(\d+)/i);
              if (diceMatch) {
                const numDice = parseInt(diceMatch[1]);
                const dieSize = parseInt(diceMatch[2]);
                diceDamage = numDice * ((dieSize + 1) / 2);
              }
            }
            
            let damageBonus = 0;
            if (typeof action.damage_bonus === 'number') {
              damageBonus = action.damage_bonus;
            } else if (typeof action.damage_bonus === 'string') {
              damageBonus = parseInt(action.damage_bonus) || 0;
            }
            
            actionDPR = diceDamage + damageBonus;
            
            if (actionDPR > 0) {
              // For recharge abilities, don't add to the main DPR total yet —
              // they'll be weighted and added after multiattack calculation
              if (rechargeMatch) {
                totalDPR += actionDPR * rechargeWeight;
              } else {
                totalDPR += actionDPR;
                attackCount++;
              }
              usedStructuredData = true;
            }
          }
          
          if (usedStructuredData) continue;
          
          // === FALLBACK TO TEXT PARSING ===
          if (action.desc && typeof action.desc === 'string') {
            const desc = action.desc;
            
            // Also check desc for recharge if not found in name
            let descRechargeWeight = rechargeWeight;
            if (descRechargeWeight === 1.0) {
              const descRechargeMatch = desc.match(/recharge\s+(\d+)(?:\s*[-–]\s*(\d+))?/i);
              if (descRechargeMatch) {
                const low = parseInt(descRechargeMatch[1]);
                const high = descRechargeMatch[2] ? parseInt(descRechargeMatch[2]) : 6;
                descRechargeWeight = (1 + 3 * ((high - low + 1) / 6)) / 4;
              }
            }
            
            const attackMatch = desc.match(/[+\-]\d+\s+to\s+hit/i);
            if (attackMatch) {
              const bonusMatch = attackMatch[0].match(/[+\-]\d+/);
              if (bonusMatch) {
                if (descRechargeWeight === 1.0) attackCount++;
                const bonus = parseInt(bonusMatch[0]);
                if (bonus > highestAttackBonus) highestAttackBonus = bonus;
              }
            }
            
            let damageFound = false;
            const avgDamageMatch = desc.match(/(\d+)\s*\((\d+)d(\d+)\s*([+\-]?\s*\d+)?\)/i);
            if (avgDamageMatch) {
              const avgDamage = parseInt(avgDamageMatch[1]);
              if (descRechargeWeight < 1.0) {
                totalDPR += avgDamage * descRechargeWeight;
              } else {
                totalDPR += avgDamage;
              }
              damageFound = true;
              if (!attackMatch && descRechargeWeight === 1.0) attackCount++;
            } else {
              const diceMatch = desc.match(/(\d+)d(\d+)\s*([+\-]?\s*\d+)?/i);
              if (diceMatch) {
                if (!attackMatch && descRechargeWeight === 1.0) attackCount++;
                const numDice = parseInt(diceMatch[1]);
                const dieSize = parseInt(diceMatch[2]);
                const modifier = diceMatch[3] ? parseInt(diceMatch[3].replace(/\s/g, '')) : 0;
                const avgDamage = Math.floor(numDice * (dieSize + 1) / 2) + modifier;
                if (descRechargeWeight < 1.0) {
                  totalDPR += avgDamage * descRechargeWeight;
                } else {
                  totalDPR += avgDamage;
                }
                damageFound = true;
              }
            }
          }
        }
      }
      
      // Check for multiattack (only applies to non-recharge standard attacks)
      let multiattackMultiplier = 1;
      if (fm.actions && Array.isArray(fm.actions)) {
        const multiattack = fm.actions.find((a: any) => 
          a.name && a.name.toLowerCase().includes('multiattack')
        );
        
        if (multiattack?.desc) {
          const countMatch = multiattack.desc.match(/makes?\s+(two|three|four|five|\d+)\s+.*?attack/i);
          if (countMatch) {
            const countStr = countMatch[1].toLowerCase();
            const countMap: Record<string, number> = { 'two': 2, 'three': 3, 'four': 4, 'five': 5 };
            multiattackMultiplier = countMap[countStr] || parseInt(countStr) || 1;
          }
        }
      }
      
      // Apply multiattack multiplier to standard attack DPR
      if (totalDPR > 0 && multiattackMultiplier > 1) {
        totalDPR *= multiattackMultiplier;
      }
      
      // === LEGENDARY ACTIONS ===
      // Creatures with legendary actions get extra actions per round (typically 3).
      // Each legendary action usually costs 1 action; some cost 2-3.
      // We parse the damage from legendary actions and add it as extra DPR.
      if (fm.legendary_actions && Array.isArray(fm.legendary_actions)) {
        let legendaryDPR = 0;
        let legendaryActionsPerRound = 3; // Default per D&D 5e rules
        
        // Check for legendary action budget description
        const legendaryDesc = fm.legendary_description;
        if (typeof legendaryDesc === 'string') {
          const budgetMatch = legendaryDesc.match(/(\d+)\s+legendary\s+action/i);
          if (budgetMatch) {
            legendaryActionsPerRound = parseInt(budgetMatch[1]!);
          }
        }
        
        // Parse each legendary action: find its cost and damage
        const parsedLegActions: { dpr: number; cost: number }[] = [];
        
        for (const la of fm.legendary_actions) {
          const name = la.name ? String(la.name).toLowerCase() : '';
          const desc = la.desc ? String(la.desc) : '';
          
          // Determine cost (default 1; look for "Costs 2 Actions" or "2 actions")
          let cost = 1;
          const costMatch = (name + ' ' + desc).match(/costs?\s+(\d+)\s+action/i);
          if (costMatch) cost = parseInt(costMatch[1]!);
          
          // Parse damage from desc
          let laDPR = 0;
          const avgMatch = desc.match(/(\d+)\s*\((\d+)d(\d+)\s*([+\-]?\s*\d+)?\)/i);
          if (avgMatch) {
            laDPR = parseInt(avgMatch[1]!);
          } else {
            const diceMatch = desc.match(/(\d+)d(\d+)\s*([+\-]?\s*\d+)?/i);
            if (diceMatch) {
              const n = parseInt(diceMatch[1]!);
              const d = parseInt(diceMatch[2]!);
              const m = diceMatch[3] ? parseInt(diceMatch[3].replace(/\s/g, '')) : 0;
              laDPR = Math.floor(n * (d + 1) / 2) + m;
            }
          }
          
          if (laDPR > 0) {
            parsedLegActions.push({ dpr: laDPR, cost });
          }
        }
        
        // Estimate DPR from legendary actions: greedily pick highest DPR/cost
        if (parsedLegActions.length > 0) {
          // Sort by damage efficiency (dpr per cost)
          parsedLegActions.sort((a, b) => (b.dpr / b.cost) - (a.dpr / a.cost));
          
          let budget = legendaryActionsPerRound;
          for (const la of parsedLegActions) {
            while (budget >= la.cost) {
              legendaryDPR += la.dpr;
              budget -= la.cost;
            }
          }
          
          totalDPR += legendaryDPR;
        }
      }
      
      // === BONUS ACTIONS (extra DPR beyond standard actions) ===
      if (fm.bonus_actions && Array.isArray(fm.bonus_actions)) {
        let bestBonusDPR = 0;
        
        for (const ba of fm.bonus_actions) {
          const desc = ba.desc ? String(ba.desc) : '';
          let baDPR = 0;
          
          const avgMatch = desc.match(/(\d+)\s*\((\d+)d(\d+)\s*([+\-]?\s*\d+)?\)/i);
          if (avgMatch) {
            baDPR = parseInt(avgMatch[1]!);
          } else {
            const diceMatch = desc.match(/(\d+)d(\d+)\s*([+\-]?\s*\d+)?/i);
            if (diceMatch) {
              const n = parseInt(diceMatch[1]!);
              const d = parseInt(diceMatch[2]!);
              const m = diceMatch[3] ? parseInt(diceMatch[3].replace(/\s/g, '')) : 0;
              baDPR = Math.floor(n * (d + 1) / 2) + m;
            }
          }
          
          // Track the best bonus action (creature uses its best one each round)
          if (baDPR > bestBonusDPR) bestBonusDPR = baDPR;
        }
        
        totalDPR += bestBonusDPR;
      }
      
      // === DAMAGE RESISTANCES & IMMUNITIES → Effective HP Multiplier ===
      let effectiveHP = hp || 1;
      
      // Count resistance/immunity categories to estimate effective HP increase.
      // Common damage types in 5e roughly distribute as:
      //   Physical (bludgeoning/piercing/slashing) ~50% of incoming damage
      //   Elemental/magical ~50%
      // Resistance = half damage → effectively 1/(1-0.5×proportion) HP multiplier
      const resistanceStr = typeof fm.damage_resistances === 'string' ? fm.damage_resistances : '';
      const immunityStr = typeof fm.damage_immunities === 'string' ? fm.damage_immunities : '';
      
      const physicalTypes = ['bludgeoning', 'piercing', 'slashing'];
      const hasPhysicalResistance = physicalTypes.some(t => resistanceStr.toLowerCase().includes(t));
      const hasPhysicalImmunity = physicalTypes.some(t => immunityStr.toLowerCase().includes(t));
      
      // Count non-physical resistance/immunity types
      const allDamageTypes = ['acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder'];
      const elementalResistCount = allDamageTypes.filter(t => resistanceStr.toLowerCase().includes(t)).length;
      const elementalImmuneCount = allDamageTypes.filter(t => immunityStr.toLowerCase().includes(t)).length;
      
      // Calculate effective HP multiplier based on damage reduction
      // Physical damage is ~50% of incoming; each elemental type is ~5%
      let damageReductionFraction = 0;
      
      if (hasPhysicalImmunity) {
        damageReductionFraction += 0.50; // Immune to all physical = 50% less damage taken
      } else if (hasPhysicalResistance) {
        damageReductionFraction += 0.25; // Resistant to physical = 25% less damage taken
      }
      
      // Each elemental resistance/immunity is worth ~5% of incoming damage
      damageReductionFraction += elementalResistCount * 0.025; // Resistance = half of 5%
      damageReductionFraction += elementalImmuneCount * 0.05;  // Immunity = full 5%
      
      // Cap the reduction at 60% to avoid unrealistic values
      damageReductionFraction = Math.min(damageReductionFraction, 0.60);
      
      if (damageReductionFraction > 0) {
        effectiveHP = Math.round(effectiveHP / (1 - damageReductionFraction));
      }
      
      // === PACK TACTICS & SIMILAR ADVANTAGE TRAITS ===
      // Traits that grant advantage on attack rolls effectively increase hit chance
      let attackBonusAdjustment = 0;
      let hasPackTactics = false;
      
      if (fm.traits && Array.isArray(fm.traits)) {
        for (const trait of fm.traits) {
          const name = trait.name ? String(trait.name).toLowerCase() : '';
          const desc = trait.desc ? String(trait.desc).toLowerCase() : '';
          const traitText = name + ' ' + desc;
          
          // Pack Tactics: advantage when ally is adjacent — flag it for encounter-level adjustment
          if (traitText.includes('pack tactics')) {
            hasPackTactics = true;
          }
          
          // Reckless Attack / Reckless: advantage on attacks (always active, creature's choice)
          if (name.includes('reckless')) {
            attackBonusAdjustment = Math.max(attackBonusAdjustment, 4);
          }
          
          // Surprise Attack / Ambusher: extra damage in first round
          if (traitText.includes('surprise attack') || traitText.includes('ambush')) {
            const surpriseMatch = desc.match(/(\d+)\s*\((\d+)d(\d+)\)/i);
            if (surpriseMatch) {
              // Add ~25% of surprise damage as averaged across combat
              const surpriseDmg = parseInt(surpriseMatch[1]!);
              totalDPR += Math.round(surpriseDmg * 0.25);
            }
          }
        }
      }
      
      // If we couldn't parse DPR, return null to fall back to CR estimates
      if (totalDPR === 0) {
        return null;
      }
      
      // Use a reasonable default attack bonus if we couldn't parse it
      if (highestAttackBonus === 0) {
        highestAttackBonus = Math.max(2, Math.floor(totalDPR / 5));
      }
      
      // Apply advantage-based attack bonus adjustment
      highestAttackBonus += attackBonusAdjustment;
      
      const result = {
        hp: effectiveHP,
        ac: ac || 10,
        dpr: totalDPR,
        attackBonus: highestAttackBonus,
        hasPackTactics,
      };
      return result;
    } catch (error) {
      console.error("[Parser] Error parsing statblock:", filePath, error);
      return null;
    }
  }

  /**
   * Parse HP from various formats: "45 (6d10+12)" or just "45"
   */
  parseHP(hpStr: any): number {
    if (typeof hpStr === 'number') return hpStr;
    if (typeof hpStr !== 'string') return 0;
    
    const match = hpStr.match(/^(\d+)/);
    return match && match[1] ? parseInt(match[1]) : 0;
  }

  /**
   * Parse AC from various formats: "13 (natural armor)" or just "13" or number
   */
  parseAC(acStr: any): number {
    if (typeof acStr === 'number') return acStr;
    if (typeof acStr !== 'string') return 10;
    
    const match = acStr.match(/^(\d+)/);
    return match && match[1] ? parseInt(match[1]) : 10;
  }

  /**
   * Consolidate trap elements (creatures with [SRD] path and initiative numbers)
   * into single trap entities with trapData loaded from trap files
   */
  async consolidateTrapElements(): Promise<void> {
    const trapGroups = new Map<string, any[]>();
    const nonTraps: any[] = [];
    
    // Group creatures by trap name (before the "Initiative" part)
    for (const creature of this.creatures) {
      // Check if this looks like a trap element: has [SRD] path and name with "Initiative"
      if (creature.path === "[SRD]" && creature.name.includes("(Initiative")) {
        const baseName = creature.name.replace(/\s*\(Initiative\s+\d+\)/, '').trim();
        if (!trapGroups.has(baseName)) {
          trapGroups.set(baseName, []);
        }
        trapGroups.get(baseName)!.push(creature);
      } else if (!creature.isTrap) {
        // Keep non-trap creatures as-is
        nonTraps.push(creature);
      } else {
        // Already a proper trap with trapData
        nonTraps.push(creature);
      }
    }
    
    // Find and load trap files for each trap group
    const consolidatedTraps: any[] = [];
    for (const [trapName, elements] of trapGroups.entries()) {
      
      // Search for the trap file
      let trapFile: TFile | null = null;
      for (const file of this.app.vault.getMarkdownFiles()) {
        const cache = this.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter?.type === 'trap' && 
            (cache.frontmatter.trap_name === trapName || file.basename === trapName)) {
          trapFile = file;
          break;
        }
      }
      
      if (trapFile) {
        try {
          const trapCache = this.app.metadataCache.getFileCache(trapFile);
          if (trapCache?.frontmatter) {
            const fm = trapCache.frontmatter;
            const consolidatedTrap = {
              name: trapName,
              count: 1,
              isTrap: true,
              trapData: {
                trapType: fm.trap_type || "complex",
                threatLevel: fm.threat_level || "dangerous",
                elements: fm.elements || []
              },
              // Preserve manual overrides from first element if any
              hp: elements[0].hp,
              ac: elements[0].ac,
              cr: elements[0].cr,
              path: trapFile.path
            };
            consolidatedTraps.push(consolidatedTrap);
          }
        } catch (error) {
          console.error(`Error loading trap file for ${trapName}:`, error);
          // If we can't load the trap, keep the elements as regular creatures
          nonTraps.push(...elements);
        }
      } else {
        nonTraps.push(...elements);
      }
    }
    
    // Replace creatures array with consolidated version
    this.creatures = [...nonTraps, ...consolidatedTraps];
  }

  async calculateEncounterDifficulty(): Promise<any> {
    // First, consolidate any trap elements
    await this.consolidateTrapElements();
    
    // Calculate enemy stats with real statblock data when available
    let enemyTotalHP = 0;
    let enemyTotalAC = 0;
    let enemyTotalDPR = 0;
    let enemyTotalAttackBonus = 0;
    let enemyCount = 0;
    
    // Track friendly creatures to add to party
    let friendlyTotalHP = 0;
    let friendlyTotalAC = 0;
    let friendlyTotalDPR = 0;
    let friendlyTotalAttackBonus = 0;
    let friendlyCount = 0;
    
    // Track Pack Tactics creatures for post-processing
    const packTacticsCreatures: { attackBonus: number; count: number }[] = [];
    
    for (const creature of this.creatures) {
      const count = creature.count || 1;
      
      
      // Handle friendly creatures - add them to the party side
      if (creature.isFriendly) {
        
        // Get stats for friendly creature (same logic as enemies)
        let realStats = null;
        if (creature.path && typeof creature.path === 'string') {
          realStats = await this.parseStatblockStats(creature.path);
        }
        
        const crStats = this.getCRStats(creature.cr);
        const hp = creature.hp || realStats?.hp || crStats.hp;
        const ac = creature.ac || realStats?.ac || crStats.ac;
        const dpr = realStats?.dpr || crStats.dpr;
        const attackBonus = realStats?.attackBonus || crStats.attackBonus;
        
        
        friendlyTotalHP += hp * count;
        friendlyTotalAC += ac * count;
        friendlyTotalDPR += dpr * count;
        friendlyTotalAttackBonus += attackBonus * count;
        friendlyCount += count;
        continue;
      }
      
      // Handle traps differently from creatures
      if (creature.isTrap && creature.trapData) {
        const trapStats = await this.calculateTrapStats(creature.trapData);
        
        const hp = trapStats.hp;
        const ac = trapStats.ac;
        const dpr = trapStats.dpr;
        const attackBonus = trapStats.attackBonus;
        
        
        // Traps don't add to HP pool (they're hazards, not damage sponges)
        // But they DO contribute DPR, AC (for difficulty calculation), and count as threats
        enemyTotalAC += ac * count;
        enemyTotalDPR += dpr * count;
        enemyTotalAttackBonus += attackBonus * count;
        enemyCount += count;
        continue;
      }
      
      // Try to get real stats from statblock if available
      let realStats = null;
      if (creature.path && typeof creature.path === 'string') {
        realStats = await this.parseStatblockStats(creature.path);
      }
      
      // Fall back to CR-based estimates if no statblock or parsing failed
      const crStats = this.getCRStats(creature.cr);
      
      const hp = creature.hp || realStats?.hp || crStats.hp;
      const ac = creature.ac || realStats?.ac || crStats.ac;
      const dpr = realStats?.dpr || crStats.dpr;
      const attackBonus = realStats?.attackBonus || crStats.attackBonus;
      
      // Track Pack Tactics for post-loop adjustment
      if (realStats?.hasPackTactics) {
        packTacticsCreatures.push({ attackBonus, count });
      }

      enemyTotalHP += hp * count;
      enemyTotalAC += ac * count;
      enemyTotalDPR += dpr * count;
      enemyTotalAttackBonus += attackBonus * count;
      enemyCount += count;
    }
    
    // Apply Pack Tactics bonus only when the creature has allies (enemyCount > 1)
    // Advantage ≈ +4 to hit. We add this to the total attack bonus for Pack Tactics creatures.
    if (enemyCount > 1) {
      for (const pt of packTacticsCreatures) {
        // Add +4 attack bonus for each Pack Tactics creature instance
        enemyTotalAttackBonus += 4 * pt.count;
      }
    }

    const avgEnemyAC = enemyCount > 0 ? enemyTotalAC / enemyCount : 13;
    const avgEnemyAttackBonus = enemyCount > 0 ? enemyTotalAttackBonus / enemyCount : 3;

    // Get party stats
    const partyMembers = await this.getPartyForDifficulty();

    let partyTotalHP = 0;
    let partyTotalAC = 0;
    let partyTotalDPR = 0;
    let partyTotalAttackBonus = 0;
    let totalLevel = 0;

    for (const member of partyMembers) {
      const levelStats = this.getLevelStats(member.level);

      const memberHP = Number(member.hp) || 0;
      const memberAC = Number(member.ac) || 0;

      partyTotalHP += memberHP > 0 ? memberHP : levelStats.hp;
      partyTotalAC += memberAC > 0 ? memberAC : levelStats.ac;
      partyTotalDPR += levelStats.dpr;
      partyTotalAttackBonus += levelStats.attackBonus;
      totalLevel += member.level;
    }
    
    // Add friendly creatures to party totals
    
    partyTotalHP += friendlyTotalHP;
    partyTotalAC += friendlyTotalAC;
    partyTotalDPR += friendlyTotalDPR;
    partyTotalAttackBonus += friendlyTotalAttackBonus;

    const memberCount = partyMembers.length + friendlyCount;
    const pcMemberCount = partyMembers.length;

    let avgPartyAC: number;
    let avgPartyAttackBonus: number;
    let avgLevel: number;

    if (memberCount > 0) {
      avgPartyAC = partyTotalAC / memberCount;
      avgPartyAttackBonus = partyTotalAttackBonus / memberCount;
      avgLevel = pcMemberCount > 0 ? totalLevel / pcMemberCount : 3;
    } else {
      const defaultStats = this.getLevelStats(3);
      partyTotalHP = defaultStats.hp * 4;
      partyTotalDPR = defaultStats.dpr * 4;
      avgPartyAC = defaultStats.ac;
      avgPartyAttackBonus = defaultStats.attackBonus;
      avgLevel = 3;
    }

    // Calculate hit chances
    const partyHitChance = this.calculateHitChance(avgPartyAttackBonus, avgEnemyAC);
    const enemyHitChance = this.calculateHitChance(avgEnemyAttackBonus, avgPartyAC);

    // Calculate effective DPR
    const partyEffectiveDPR = this.calculateEffectiveDPR(partyTotalDPR, partyHitChance);
    const enemyEffectiveDPR = this.calculateEffectiveDPR(enemyTotalDPR, enemyHitChance);

    // Calculate rounds to defeat
    const roundsToDefeatEnemies = this.calculateRoundsToDefeat(enemyTotalHP, partyEffectiveDPR);
    const roundsToDefeatParty = this.calculateRoundsToDefeat(partyTotalHP, enemyEffectiveDPR);

    // Survival ratio
    const survivalRatio = roundsToDefeatParty / roundsToDefeatEnemies;

    // Determine difficulty
    let difficulty: string;
    let difficultyColor: string;

    if (survivalRatio >= 4 || roundsToDefeatEnemies <= 1) {
      difficulty = "Trivial";
      difficultyColor = "#888888";
    } else if (survivalRatio >= 2.5) {
      difficulty = "Easy";
      difficultyColor = "#00aa00";
    } else if (survivalRatio >= 1.5) {
      difficulty = "Medium";
      difficultyColor = "#aaaa00";
    } else if (survivalRatio >= 1.0) {
      difficulty = "Hard";
      difficultyColor = "#ff8800";
    } else if (survivalRatio >= 0.6) {
      difficulty = "Deadly";
      difficultyColor = "#ff0000";
    } else {
      difficulty = "TPK Risk";
      difficultyColor = "#880000";
    }

    // Generate summary
    let summary = "";
    if (partyMembers.length === 0 && friendlyCount === 0) {
      summary = `⚠️ No party found. Using default 4-player party (Level 3).\n`;
      summary += `Expected duration: ~${roundsToDefeatEnemies} round${roundsToDefeatEnemies !== 1 ? 's' : ''}.`;
    } else {
      const partyText = pcMemberCount > 0 ? `${pcMemberCount} PC${pcMemberCount !== 1 ? 's' : ''}` : '';
      const friendlyText = friendlyCount > 0 ? `${friendlyCount} friendly creature${friendlyCount !== 1 ? 's' : ''}` : '';
      const combatants = [partyText, friendlyText].filter(t => t).join(' + ');
      
      summary = `Party: ${combatants}`;
      if (pcMemberCount > 0) {
        summary += ` (Avg Level ${avgLevel.toFixed(1)})`;
      }
      summary += `\n`;
      summary += `Enemies: ${enemyCount} creatures\n`;
      summary += `Expected duration: ~${roundsToDefeatEnemies} round${roundsToDefeatEnemies !== 1 ? 's' : ''}`;
    }

    return {
      enemyStats: {
        totalHP: enemyTotalHP,
        avgAC: avgEnemyAC,
        totalDPR: enemyTotalDPR,
        avgAttackBonus: avgEnemyAttackBonus,
        creatureCount: enemyCount
      },
      partyStats: {
        totalHP: partyTotalHP,
        avgAC: avgPartyAC,
        totalDPR: partyTotalDPR,
        avgAttackBonus: avgPartyAttackBonus,
        memberCount: memberCount,
        avgLevel: avgLevel
      },
      analysis: {
        partyHitChance,
        enemyHitChance,
        partyEffectiveDPR,
        enemyEffectiveDPR,
        roundsToDefeatEnemies,
        roundsToDefeatParty,
        survivalRatio,
        difficulty,
        difficultyColor,
        summary
      }
    };
  }

  async searchVaultCreatures(query: string): Promise<Array<{ name: string; path: string; hp: number; ac: number; cr?: string }>> {
    const creatures: Array<{ name: string; path: string; hp: number; ac: number; cr?: string }> = [];

    // Check multiple possible creature/monster folder locations
    const possiblePaths = [
      "z_Beastiarity",
      "My Vault/z_Beastiarity",
      "nvdh-ttrpg-vault/monsters",
      "monsters"
    ];

    const beastiaryFolders: TFolder[] = [];
    for (const path of possiblePaths) {
      const folder = this.app.vault.getAbstractFileByPath(path);
      if (folder instanceof TFolder) {
        beastiaryFolders.push(folder);
      }
    }

    // Also search campaign NPC folders for NPCs with statblock: true
    const ttrpgsFolder = this.app.vault.getAbstractFileByPath("ttrpgs");
    if (ttrpgsFolder instanceof TFolder) {
      for (const child of ttrpgsFolder.children) {
        if (child instanceof TFolder) {
          const npcsFolder = this.app.vault.getAbstractFileByPath(`${child.path}/NPCs`);
          if (npcsFolder instanceof TFolder) {
            beastiaryFolders.push(npcsFolder);
          }
        }
      }
    }

    if (beastiaryFolders.length === 0) return creatures;

    const queryLower = query.toLowerCase();

    // Recursively search all files in beastiary
    const searchFolder = async (folder: TFolder) => {
      for (const child of folder.children) {
        if (child instanceof TFile && child.extension === "md") {
          try {
            const cache = this.app.metadataCache.getFileCache(child);

            // Check if file has statblock
            if (cache?.frontmatter && cache.frontmatter.statblock === true) {
              const name = cache.frontmatter.name || child.basename;

              // Filter by query
              if (!query || name.toLowerCase().includes(queryLower)) {
                creatures.push({
                  name: name,
                  path: child.path,
                  hp: cache.frontmatter.hp || 1,
                  ac: cache.frontmatter.ac || 10,
                  cr: cache.frontmatter.cr?.toString() || undefined
                });
              }
            }
          } catch (error) {
            console.error(`Error reading creature file ${child.path}:`, error);
          }
        } else if (child instanceof TFolder) {
          await searchFolder(child);
        }
      }
    };

    // Search all found beastiary folders
    for (const folder of beastiaryFolders) {
      await searchFolder(folder);
    }

    // Sort alphabetically
    creatures.sort((a, b) => a.name.localeCompare(b.name));

    return creatures;
  }

  async loadAllCreatures(): Promise<Array<{ name: string; path: string; hp: number; ac: number; cr?: string }>> {
    const vaultCreatures = await this.searchVaultCreatures("");
    const statblocksCreatures = await this.getStatblocksPluginCreatures();

    // Merge and deduplicate by name (vault takes priority)
    const allCreatures = [...vaultCreatures];
    const vaultNames = new Set(vaultCreatures.map(c => c.name.toLowerCase()));

    for (const creature of statblocksCreatures) {
      if (!vaultNames.has(creature.name.toLowerCase())) {
        allCreatures.push(creature);
      }
    }

    // Sort alphabetically
    allCreatures.sort((a, b) => a.name.localeCompare(b.name));

    return allCreatures;
  }

  async getStatblocksPluginCreatures(): Promise<Array<{ name: string; path: string; hp: number; ac: number; cr?: string }>> {
    const creatures: Array<{ name: string; path: string; hp: number; ac: number; cr?: string }> = [];

    try {
      const statblocksPlugin = (this.app as any).plugins?.plugins?.["obsidian-5e-statblocks"];
      if (!statblocksPlugin) {
        return creatures;
      }

      let bestiaryCreatures: any[] = [];

      if (statblocksPlugin.api?.getBestiaryCreatures) {
        const apiCreatures = statblocksPlugin.api.getBestiaryCreatures();
        if (Array.isArray(apiCreatures)) {
          bestiaryCreatures = apiCreatures;
        }
      }

      if (bestiaryCreatures.length === 0 && statblocksPlugin.data?.monsters) {
        const monstersData = statblocksPlugin.data.monsters;
        if (Array.isArray(monstersData)) {
          bestiaryCreatures = monstersData;
        } else if (typeof monstersData === "object") {
          bestiaryCreatures = Object.values(monstersData);
        }
      }

      if (bestiaryCreatures.length === 0) {
        return creatures;
      }


      for (const monster of bestiaryCreatures) {
        if (!monster || typeof monster !== "object") continue;

        creatures.push({
          name: monster.name || "Unknown",
          path: monster.path || "[SRD]",
          hp: monster.hp || 1,
          ac: typeof monster.ac === "number" ? monster.ac : (parseInt(monster.ac) || 10),
          cr: monster.cr?.toString() || undefined
        });
      }

      if (creatures.length > 0) {
      }
    } catch (error) {
      console.error("Error accessing 5e Statblocks plugin creatures:", error);
    }

    return creatures;
  }

  async createEncounter(scenePath: string) {
    if (this.creatures.length === 0) return;

    try {
      const pm = this.plugin.partyManager;

      // Color names for duplicate creatures
      const colors = [
        "Red", "Blue", "Green", "Yellow", "Purple", "Orange",
        "Pink", "Brown", "Black", "White", "Gray", "Cyan",
        "Magenta", "Lime", "Teal", "Indigo", "Violet", "Gold",
        "Silver", "Bronze"
      ];

      // Get campaign party members if requested
      let partyCreatures: import("../party/PartyTypes").StoredEncounterCreature[] = [];
      if (this.includeParty) {
        partyCreatures = await this.getCampaignPartyCreatures();
      }

      // Build creature data
      const creatures: import("../party/PartyTypes").StoredEncounterCreature[] = this.creatures.flatMap(c => {
        const instances: import("../party/PartyTypes").StoredEncounterCreature[] = [];
        for (let i = 0; i < c.count; i++) {
          const hp = c.hp || 1;
          const ac = c.ac || 10;

          let creatureName = c.name;
          let displayName = c.name;

          if (c.count > 1 && this.useColorNames) {
            const colorIndex = i % colors.length;
            creatureName = `${c.name} (${colors[colorIndex]})`;
            displayName = creatureName;
          }

          instances.push({
            name: creatureName,
            display: displayName,
            initiative: 0,
            modifier: 0,
            hp: hp,
            maxHP: hp,
            currentHP: hp,
            tempHP: 0,
            cr: c.cr || undefined,
            ac: ac,
            currentAC: ac,
            id: pm.generateId(),
            enabled: true,
            hidden: false,
            friendly: false,
            player: false,
            notePath: c.path || undefined,
            statuses: [],
          });
        }
        return instances;
      });

      const allCombatants = [...partyCreatures, ...creatures];

      const encounter = pm.buildEncounter(
        this.encounterName,
        allCombatants,
        scenePath,
      );

      await pm.saveEncounter(this.encounterName, encounter);
      new Notice(`✅ Encounter "${this.encounterName}" saved!`);

      // Link encounter to scene
      await this.linkEncounterToScene(scenePath);

    } catch (error) {
      console.error("Error creating encounter:", error);
      new Notice("⚠️ Could not save encounter. Check console for details.");
    }
  }

  async getCampaignPartyCreatures(): Promise<import("../party/PartyTypes").StoredEncounterCreature[]> {
    try {
      const pm = this.plugin.partyManager;

      // Get campaign name from adventure path
      const adventureFile = this.app.vault.getAbstractFileByPath(this.adventurePath);
      if (!(adventureFile instanceof TFile)) return [];

      const adventureContent = await this.app.vault.read(adventureFile);
      const campaignMatch = adventureContent.match(/^campaign:\s*([^\r\n]+)$/m);
      const campaignName = (campaignMatch?.[1]?.trim() || "Unknown").replace(/^["']|["']$/g, '');

      // Find the campaign's party
      const party = this.resolveParty(campaignName);
      if (!party || party.members.length === 0) return [];

      // Resolve live stats and convert to encounter creatures
      const resolved = await pm.resolveMembers(party.id);

      // Filter by selected party members if applicable
      const selectedNames = this.selectedPartyMembers.length > 0
        ? new Set(this.selectedPartyMembers)
        : null;

      return resolved
        .filter(m => m.enabled && (!selectedNames || selectedNames.has(m.name)))
        .map(m => pm.memberToEncounterCreature(m));
    } catch (error) {
      console.error("Error fetching party members:", error);
      return [];
    }
  }

  async linkEncounterToScene(scenePath: string) {
    try {
      const sceneFile = this.app.vault.getAbstractFileByPath(scenePath);
      if (!(sceneFile instanceof TFile)) return;

      let content = await this.app.vault.read(sceneFile);

      content = updateYamlFrontmatter(content, (fm) => ({
        ...fm,
        tracker_encounter: this.encounterName,
      }));

      await this.app.vault.modify(sceneFile, content);

    } catch (error) {
      console.error("Error linking encounter to scene:", error);
    }
  }
}