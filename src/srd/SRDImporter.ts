import { Notice, TFile, requestUrl } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { CreatureSize, MarkerDefinition } from "../marker/MarkerTypes";

export async function importAllSRDData(plugin: DndCampaignHubPlugin) {
	const categories = [
		{ key: "ability-scores", folder: "z_AbilityScores", name: "Ability Scores" },
		{ key: "classes", folder: "z_Classes", name: "Classes" },
		{ key: "conditions", folder: "z_Conditions", name: "Conditions" },
		{ key: "damage-types", folder: "z_DamageTypes", name: "Damage Types" },
		{ key: "equipment", folder: "z_Equipment", name: "Equipment" },
		{ key: "features", folder: "z_Features", name: "Features" },
		{ key: "languages", folder: "z_Languages", name: "Languages" },
		{ key: "magic-schools", folder: "z_MagicSchools", name: "Magic Schools" },
		{ key: "proficiencies", folder: "z_Proficiencies", name: "Proficiencies" },
		{ key: "races", folder: "z_Races", name: "Races" },
		{ key: "skills", folder: "z_Skills", name: "Skills" },
		{ key: "subclasses", folder: "z_Subclasses", name: "Subclasses" },
		{ key: "subraces", folder: "z_Subraces", name: "Subraces" },
		{ key: "traits", folder: "z_Traits", name: "Traits" },
		{ key: "weapon-properties", folder: "z_WeaponProperties", name: "Weapon Properties" }
	];

	let totalSuccess = 0;
	let totalErrors = 0;
	const startTime = Date.now();

	new Notice("Starting full SRD data import...");

	for (const category of categories) {
		const result = await importSRDCategory(plugin, category.key, category.folder, category.name, true);
		totalSuccess += result.success;
		totalErrors += result.errors;
	}

	const duration = Math.round((Date.now() - startTime) / 1000);
	new Notice(`✅ SRD import complete! ${totalSuccess} items imported, ${totalErrors} errors. (${duration}s)`);
}

/**
 * Import all SRD creatures as battlemap tokens with images.
 * Fetches every monster from the D&D 5e SRD API, downloads its artwork,
 * creates a creature note in z_Beastiarity, and registers a MarkerDefinition
 * (creature-type token) in the marker library with the image attached.
 * Already-existing creatures are overwritten.
 */
export async function importSRDCreatureTokens(plugin: DndCampaignHubPlugin): Promise<{ imported: number; errors: number }> {
	const SRD_BASE = "https://www.dnd5eapi.co";
	const API_BASE = `${SRD_BASE}/api/2014`;
	const BESTIARY_FOLDER = "z_Beastiarity";
	const IMAGE_FOLDER = "z_Beastiarity/images";
	const BATCH_SIZE = 8;

	let imported = 0;
	let errors = 0;

	new Notice("🐉 Starting SRD creature token import…");
	const startTime = Date.now();

	try {
		// Ensure folders exist
		await plugin.ensureFolderExists(BESTIARY_FOLDER);
		await plugin.ensureFolderExists(IMAGE_FOLDER);

		// 1. Fetch monster list
		const listResponse = await requestUrl({ url: `${API_BASE}/monsters` });
		const monsters: { index: string; name: string; url: string }[] = listResponse.json.results || [];

		if (monsters.length === 0) {
			new Notice("⚠️ No monsters returned from the SRD API.");
			return { imported: 0, errors: 0 };
		}

		new Notice(`📋 Found ${monsters.length} SRD creatures. Importing…`);

		// 2. Process in batches
		for (let i = 0; i < monsters.length; i += BATCH_SIZE) {
			const batch = monsters.slice(i, i + BATCH_SIZE);

			const batchResults = await Promise.allSettled(
				batch.map(async (entry) => {
					try {
						// Fetch full monster data
						const detailRes = await requestUrl({ url: `${SRD_BASE}${entry.url}` });
						const m = detailRes.json;

						// ── Download image ──
						let imagePath: string | undefined;
						if (m.image) {
							try {
								const imgUrl = `${SRD_BASE}${m.image}`;
								const imgRes = await requestUrl({ url: imgUrl });
								const ext = m.image.split(".").pop() || "png";
								imagePath = `${IMAGE_FOLDER}/${m.index}.${ext}`;

								// Write image (overwrite if exists)
								if (await plugin.app.vault.adapter.exists(imagePath)) {
									await plugin.app.vault.adapter.writeBinary(imagePath, imgRes.arrayBuffer);
								} else {
									await plugin.app.vault.createBinary(imagePath, imgRes.arrayBuffer);
								}
							} catch (imgErr) {
								imagePath = undefined;
							}
						}

						// ── Map creature size ──
						const sizeMap: Record<string, CreatureSize> = {
							Tiny: "tiny", Small: "small", Medium: "medium",
							Large: "large", Huge: "huge", Gargantuan: "gargantuan"
						};
						const creatureSize: CreatureSize = sizeMap[m.size] || "medium";

						// ── Parse darkvision ──
						let darkvision = 0;
						if (m.senses?.darkvision) {
							const dvMatch = String(m.senses.darkvision).match(/(\d+)/);
							if (dvMatch && dvMatch[1]) darkvision = parseInt(dvMatch[1], 10);
						}

						// ── Build / update MarkerDefinition (token) ──
						// Check if a token for this creature already exists (by name + type)
						const existingMarkers = plugin.markerLibrary.getAllMarkers();
						let existingToken = existingMarkers.find(
							(mk) => mk.name === m.name && mk.type === "creature"
						);

						const now = Date.now();
						const tokenId = existingToken?.id || plugin.markerLibrary.generateId();

						const tokenDef: MarkerDefinition = {
							id: tokenId,
							name: m.name,
							type: "creature",
							icon: "",
							backgroundColor: "#8b0000",
							borderColor: "#ffffff",
							imageFile: imagePath,
							imageFit: "contain",
							creatureSize,
							darkvision: darkvision > 0 ? darkvision : undefined,
							createdAt: existingToken?.createdAt || now,
							updatedAt: now
						};
						await plugin.markerLibrary.setMarker(tokenDef);

						// ── Build creature note ──
						const noteContent = buildSRDCreatureNote(m, tokenId, imagePath);
						const filePath = `${BESTIARY_FOLDER}/${m.name}.md`;

						if (await plugin.app.vault.adapter.exists(filePath)) {
							const existingFile = plugin.app.vault.getAbstractFileByPath(filePath) as TFile;
							if (existingFile) {
								await plugin.app.vault.modify(existingFile, noteContent);
							}
						} else {
							await plugin.app.vault.create(filePath, noteContent);
						}

						imported++;
					} catch (err) {
						console.error(`[SRD Import] Failed to import ${entry.name}:`, err);
						errors++;
					}
				})
			);

			// Progress notice every 40 creatures
			if (i > 0 && i % 40 === 0) {
				new Notice(`🐉 Progress: ${i}/${monsters.length} creatures…`);
			}
		}

		const duration = Math.round((Date.now() - startTime) / 1000);
		new Notice(
			`✅ SRD creature import complete! ${imported} tokens imported, ${errors} errors. (${duration}s)`
		);
	} catch (error) {
		console.error("[SRD Import] Fatal error during creature import:", error);
		new Notice("❌ SRD creature import failed. Check the console for details.");
	}

	return { imported, errors };
}

/**
 * Build a creature note markdown from SRD API monster data.
 * Creates the same frontmatter format as the Creature Creation Modal
 * so the note is fully compatible with the plugin's creature system.
 */
export function buildSRDCreatureNote(m: any, tokenId: string, imagePath?: string): string {
	// ── Helpers ──
	const calcMod = (score: number) => Math.floor((score - 10) / 2);
	const esc = (s: string) => String(s || "").replace(/"/g, '\\"');
	/** Wrap a non-empty value in double quotes, escaping any inner quotes. */
	const q = (v: string) => v ? `"${v.replace(/"/g, '\\"')}"` : "";

	// ── Speed string ──
	let speedParts: string[] = [];
	if (m.speed) {
		if (m.speed.walk) speedParts.push(m.speed.walk);
		if (m.speed.fly) speedParts.push(`fly ${m.speed.fly}`);
		if (m.speed.swim) speedParts.push(`swim ${m.speed.swim}`);
		if (m.speed.burrow) speedParts.push(`burrow ${m.speed.burrow}`);
		if (m.speed.climb) speedParts.push(`climb ${m.speed.climb}`);
		if (m.speed.hover) speedParts.push("hover");
	}
	const speedStr = speedParts.join(", ") || "30 ft.";

	// ── Armor class ──
	let acValue = 10;
	if (Array.isArray(m.armor_class) && m.armor_class.length > 0) {
		acValue = m.armor_class[0].value ?? 10;
	} else if (typeof m.armor_class === "number") {
		acValue = m.armor_class;
	}

	// ── Ability scores ──
	const str = m.strength ?? 10;
	const dex = m.dexterity ?? 10;
	const con = m.constitution ?? 10;
	const int = m.intelligence ?? 10;
	const wis = m.wisdom ?? 10;
	const cha = m.charisma ?? 10;
	const fage = [calcMod(str), calcMod(dex), calcMod(con), calcMod(int), calcMod(wis), calcMod(cha)];

	// ── CR formatting ──
	const formatCR = (cr: number) => {
		if (cr === 0.125) return "1/8";
		if (cr === 0.25) return "1/4";
		if (cr === 0.5) return "1/2";
		return String(cr);
	};

	// ── Proficiencies → saves & skills ──
	let saves = "";
	let skillsaves = "";
	if (Array.isArray(m.proficiencies)) {
		const savesArr: string[] = [];
		const skillArr: string[] = [];
		for (const p of m.proficiencies) {
			const idx: string = p.proficiency?.index || "";
			const val: number = p.value ?? 0;
			if (idx.startsWith("saving-throw-")) {
				const ability = idx.replace("saving-throw-", "").substring(0, 3);
				savesArr.push(`\n  - ${ability}: ${val}`);
			} else if (idx.startsWith("skill-")) {
				const skill = idx.replace("skill-", "");
				skillArr.push(`\n  - ${skill}: ${val}`);
			}
		}
		if (savesArr.length > 0) saves = savesArr.join("");
		if (skillArr.length > 0) skillsaves = skillArr.join("");
	}

	// ── Damage & condition fields ──
	const join = (arr: any) => {
		if (!arr || !Array.isArray(arr)) return "";
		return arr.map((x: any) => (typeof x === "string" ? x : x?.name || x?.index || "")).join(", ");
	};
	const dmgVuln = join(m.damage_vulnerabilities);
	const dmgRes = join(m.damage_resistances);
	const dmgImm = join(m.damage_immunities);
	const condImm = join(m.condition_immunities);

	// ── Senses & languages ──
	let sensesStr = "";
	if (m.senses) {
		const parts: string[] = [];
		if (m.senses.darkvision) parts.push(`darkvision ${m.senses.darkvision}`);
		if (m.senses.blindsight) parts.push(`blindsight ${m.senses.blindsight}`);
		if (m.senses.truesight) parts.push(`truesight ${m.senses.truesight}`);
		if (m.senses.tremorsense) parts.push(`tremorsense ${m.senses.tremorsense}`);
		if (m.senses.passive_perception) parts.push(`passive Perception ${m.senses.passive_perception}`);
		sensesStr = parts.join(", ");
	}
	const languages = m.languages || "";

	// ── Traits / actions / legendary / reactions ──
	const fmtBlock = (items: any[] | undefined, key: string) => {
		if (!items || items.length === 0) return `\n${key}: []`;
		let out = `\n${key}:`;
		for (const item of items) {
			if (item.name && item.desc) {
				out += `\n  - name: ${item.name}`;
				const descStr = String(item.desc || "");
				if (descStr.includes("\n")) {
					// Multi-line desc: emit as a YAML block scalar (|) with 6-space indent
					const indented = descStr
						.split("\n")
						.map((line) => (line.trim() === "" ? "" : `      ${line}`))
						.join("\n");
					out += `\n    desc: |\n${indented}`;
				} else {
					out += `\n    desc: "${esc(descStr)}"`;
				}
			}
		}
		return out;
	};

	// ── Assemble frontmatter ──
	// `plugin_type` is the D&D Campaign Hub entity type used for migration and
	// action-button rendering.  `type` keeps the D&D monster category so the
	// Fantasy Statblock plugin can still read it.
	let fm = `---
statblock: true
layout: Basic 5e Layout
plugin_type: creature
name: ${m.name}
size: ${m.size || "Medium"}
type: ${m.type || "creature"}`;
	if (m.subtype) fm += `\nsubtype: ${m.subtype}`;
	fm += `\nalignment: ${m.alignment || "unaligned"}`;
	fm += `\nac: ${acValue}`;
	fm += `\nhp: ${m.hit_points ?? 1}`;
	fm += `\nhit_dice: ${m.hit_dice || ""}`;
	fm += `\nspeed: ${q(speedStr)}`;
	fm += `\nstats:\n  - ${str}\n  - ${dex}\n  - ${con}\n  - ${int}\n  - ${wis}\n  - ${cha}`;
	fm += `\nfage_stats:\n  - ${fage[0]}\n  - ${fage[1]}\n  - ${fage[2]}\n  - ${fage[3]}\n  - ${fage[4]}\n  - ${fage[5]}`;
	fm += `\nsaves:${saves || " []"}`;
	fm += `\nskillsaves:${skillsaves || " []"}`;
	fm += `\ndamage_vulnerabilities: ${q(dmgVuln) || '""'}`;
	fm += `\ndamage_resistances: ${q(dmgRes) || '""'}`;
	fm += `\ndamage_immunities: ${q(dmgImm) || '""'}`;
	fm += `\ncondition_immunities: ${q(condImm) || '""'}`;
	fm += `\nsenses: ${q(sensesStr)}`;
	fm += `\nlanguages: ${q(languages)}`;
	// Fractional CRs (1/4, 1/2, 1/8) must be quoted so YAML parses them as strings.
	const crStr = formatCR(m.challenge_rating ?? 0);
	fm += `\ncr: ${crStr.includes("/") ? q(crStr) : crStr}`;
	fm += `\nspells: []`;
	fm += fmtBlock(m.special_abilities, "traits");
	fm += fmtBlock(m.actions, "actions");
	fm += fmtBlock(m.legendary_actions, "legendary_actions");
	fm += `\nbonus_actions: []`;
	fm += fmtBlock(m.reactions, "reactions");
	fm += `\ntoken_id: ${tokenId}`;
	fm += `\nsource: D&D 5e SRD`;
	fm += `\ntemplate_version: 1.10.0`;
	fm += `\n---\n\n`;

	// ── Body ──
	let body = "";
	if (imagePath) {
		body += `![[${imagePath}]]\n\n`;
	}
	body += `${m.name} creature imported from the D&D 5e SRD.\n`;

	body += `\n\`\`\`dnd-hub\n\`\`\`\n\n`;

	body += `\`\`\`statblock\ncreature: ${m.name}\n\`\`\`\n`;

	return fm + body;
}

export async function importSRDCategory(
	plugin: DndCampaignHubPlugin,
	categoryKey: string,
	folderName: string,
	categoryName: string,
	isBulkImport: boolean = false
): Promise<{success: number, errors: number}> {
	try {
		if (!isBulkImport) {
			new Notice(`Starting ${categoryName} import...`);
		}

		// Ensure folder exists
		await plugin.ensureFolderExists(folderName);

		// Fetch list of items
		const listResponse = await requestUrl({
			url: `https://www.dnd5eapi.co/api/2014/${categoryKey}`,
			method: "GET"
		});

		const items = listResponse.json.results || [];
		let successCount = 0;
		let errorCount = 0;

		for (let i = 0; i < items.length; i++) {
			try {
				const item = items[i];
				const filePath = `${folderName}/${item.name}.md`;

				// Check if file already exists
				const exists = await plugin.app.vault.adapter.exists(filePath);
				if (exists) {
					successCount++;
					continue;
				}

				// Fetch detailed data
				const detailResponse = await requestUrl({
					url: `https://www.dnd5eapi.co${item.url}`,
					method: "GET"
				});

				const data = detailResponse.json;

				// Generate markdown content based on category
				const content = generateSRDMarkdown(plugin, categoryKey, data);

				await plugin.app.vault.create(filePath, content);
				successCount++;

				// Show progress every 20 items for bulk imports
				if (isBulkImport && i % 20 === 0 && i > 0) {
				}
			} catch (error) {
				errorCount++;
				console.error(`Failed to import ${items[i].name}:`, error);
			}
		}

		if (!isBulkImport) {
			new Notice(`✅ ${categoryName} import complete! ${successCount} items imported, ${errorCount} errors.`);
		}

		return { success: successCount, errors: errorCount };
	} catch (error) {
		new Notice(`❌ Failed to import ${categoryName}: ${error instanceof Error ? error.message : String(error)}`);
		console.error(`${categoryName} import error:`, error);
		return { success: 0, errors: 0 };
	}
}

export function generateSRDMarkdown(plugin: DndCampaignHubPlugin, categoryKey: string, data: any): string {
	const name = data.name || "Unknown";
	const index = data.index || "";

	// Common frontmatter
	let frontmatter = `---
type: srd-${categoryKey}
name: ${name}
index: ${index}
source: D&D 5e SRD
---

# ${name}

`;

	// Category-specific content
	switch (categoryKey) {
		case "ability-scores":
			frontmatter += generateAbilityScoreContent(data);
			break;
		case "classes":
			frontmatter += generateClassContent(data);
			break;
		case "conditions":
			frontmatter += generateConditionContent(data);
			break;
		case "damage-types":
			frontmatter += generateDamageTypeContent(data);
			break;
		case "equipment":
			frontmatter += generateEquipmentContent(data);
			break;
		case "features":
			frontmatter += generateFeatureContent(data);
			break;
		case "languages":
			frontmatter += generateLanguageContent(data);
			break;
		case "magic-schools":
			frontmatter += generateMagicSchoolContent(data);
			break;
		case "proficiencies":
			frontmatter += generateProficiencyContent(data);
			break;
		case "races":
			frontmatter += generateRaceContent(data);
			break;
		case "skills":
			frontmatter += generateSkillContent(data);
			break;
		case "subclasses":
			frontmatter += generateSubclassContent(data);
			break;
		case "subraces":
			frontmatter += generateSubraceContent(data);
			break;
		case "traits":
			frontmatter += generateTraitContent(data);
			break;
		case "weapon-properties":
			frontmatter += generateWeaponPropertyContent(data);
			break;
		default:
			frontmatter += generateGenericContent(data);
	}

	return frontmatter;
}

function generateAbilityScoreContent(data: any): string {
	let content = `**Full Name:** ${data.full_name}\n\n`;
	if (data.desc && data.desc.length > 0) {
		content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
	}
	if (data.skills && data.skills.length > 0) {
		content += `## Skills\n\n`;
		data.skills.forEach((skill: any) => {
			content += `- ${skill.name}\n`;
		});
	}
	return content;
}

function generateClassContent(data: any): string {
	let content = `**Hit Die:** d${data.hit_die}\n\n`;

	if (data.proficiency_choices && data.proficiency_choices.length > 0) {
		content += `## Proficiency Choices\n\n`;
		data.proficiency_choices.forEach((choice: any) => {
			content += `**Choose ${choice.choose} from:**\n`;
			choice.from.options.forEach((opt: any) => {
				content += `- ${opt.item?.name || "Unknown"}\n`;
			});
			content += `\n`;
		});
	}

	if (data.proficiencies && data.proficiencies.length > 0) {
		content += `## Proficiencies\n\n`;
		data.proficiencies.forEach((prof: any) => {
			content += `- ${prof.name}\n`;
		});
		content += `\n`;
	}

	if (data.saving_throws && data.saving_throws.length > 0) {
		content += `## Saving Throws\n\n`;
		data.saving_throws.forEach((save: any) => {
			content += `- ${save.name}\n`;
		});
		content += `\n`;
	}

	if (data.starting_equipment && data.starting_equipment.length > 0) {
		content += `## Starting Equipment\n\n`;
		data.starting_equipment.forEach((eq: any) => {
			content += `- ${eq.quantity}x ${eq.equipment.name}\n`;
		});
		content += `\n`;
	}

	return content;
}

function generateConditionContent(data: any): string {
	let content = "";
	if (data.desc && data.desc.length > 0) {
		content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
	}
	return content;
}

function generateDamageTypeContent(data: any): string {
	let content = "";
	if (data.desc && data.desc.length > 0) {
		content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
	}
	return content;
}

function generateEquipmentContent(data: any): string {
	let content = "";

	if (data.equipment_category) {
		content += `**Category:** ${data.equipment_category.name}\n`;
	}

	if (data.cost) {
		content += `**Cost:** ${data.cost.quantity} ${data.cost.unit}\n`;
	}

	if (data.weight) {
		content += `**Weight:** ${data.weight} lbs\n`;
	}

	content += `\n`;

	if (data.desc && data.desc.length > 0) {
		content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
	}

	if (data.armor_category) {
		content += `## Armor Properties\n\n`;
		content += `- **Armor Category:** ${data.armor_category}\n`;
		if (data.armor_class) {
			content += `- **AC:** ${data.armor_class.base}`;
			if (data.armor_class.dex_bonus !== undefined) {
				content += ` + Dex ${data.armor_class.max_bonus !== null ? `(max ${data.armor_class.max_bonus})` : ""}`;
			}
			content += `\n`;
		}
		if (data.str_minimum) {
			content += `- **Str Minimum:** ${data.str_minimum}\n`;
		}
		if (data.stealth_disadvantage) {
			content += `- **Stealth Disadvantage:** Yes\n`;
		}
	}

	if (data.weapon_category) {
		content += `## Weapon Properties\n\n`;
		content += `- **Category:** ${data.weapon_category}\n`;
		if (data.weapon_range) {
			content += `- **Range:** ${data.weapon_range}\n`;
		}
		if (data.damage) {
			content += `- **Damage:** ${data.damage.damage_dice} ${data.damage.damage_type.name}\n`;
		}
		if (data.two_handed_damage) {
			content += `- **Two-Handed Damage:** ${data.two_handed_damage.damage_dice} ${data.two_handed_damage.damage_type.name}\n`;
		}
		if (data.range) {
			content += `- **Normal Range:** ${data.range.normal} ft\n`;
			if (data.range.long) {
				content += `- **Long Range:** ${data.range.long} ft\n`;
			}
		}
		if (data.properties && data.properties.length > 0) {
			content += `- **Properties:** ${data.properties.map((p: any) => p.name).join(", ")}\n`;
		}
	}

	return content;
}

function generateFeatureContent(data: any): string {
	let content = "";

	if (data.level) {
		content += `**Level:** ${data.level}\n`;
	}

	if (data.class) {
		content += `**Class:** ${data.class.name}\n`;
	}

	if (data.subclass) {
		content += `**Subclass:** ${data.subclass.name}\n`;
	}

	content += `\n`;

	if (data.desc && data.desc.length > 0) {
		content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
	}

	return content;
}

function generateLanguageContent(data: any): string {
	let content = "";

	if (data.type) {
		content += `**Type:** ${data.type}\n\n`;
	}

	if (data.typical_speakers && data.typical_speakers.length > 0) {
		content += `**Typical Speakers:** ${data.typical_speakers.join(", ")}\n\n`;
	}

	if (data.script) {
		content += `**Script:** ${data.script}\n\n`;
	}

	if (data.desc) {
		content += `## Description\n\n${data.desc}\n\n`;
	}

	return content;
}

function generateMagicSchoolContent(data: any): string {
	let content = "";
	if (data.desc) {
		content += `## Description\n\n${data.desc}\n\n`;
	}
	return content;
}

function generateProficiencyContent(data: any): string {
	let content = "";

	if (data.type) {
		content += `**Type:** ${data.type}\n\n`;
	}

	if (data.classes && data.classes.length > 0) {
		content += `**Classes:** ${data.classes.map((c: any) => c.name).join(", ")}\n\n`;
	}

	if (data.races && data.races.length > 0) {
		content += `**Races:** ${data.races.map((r: any) => r.name).join(", ")}\n\n`;
	}

	if (data.reference) {
		content += `**Reference:** ${data.reference.name}\n\n`;
	}

	return content;
}

function generateRaceContent(data: any): string {
	let content = "";

	if (data.speed) {
		content += `**Speed:** ${data.speed} ft\n`;
	}

	if (data.size) {
		content += `**Size:** ${data.size}\n`;
	}

	if (data.size_description) {
		content += `**Size Description:** ${data.size_description}\n`;
	}

	if (data.alignment) {
		content += `**Alignment:** ${data.alignment}\n`;
	}

	if (data.age) {
		content += `**Age:** ${data.age}\n`;
	}

	content += `\n`;

	if (data.ability_bonuses && data.ability_bonuses.length > 0) {
		content += `## Ability Score Increases\n\n`;
		data.ability_bonuses.forEach((bonus: any) => {
			content += `- **${bonus.ability_score.name}:** +${bonus.bonus}\n`;
		});
		content += `\n`;
	}

	if (data.starting_proficiencies && data.starting_proficiencies.length > 0) {
		content += `## Starting Proficiencies\n\n`;
		data.starting_proficiencies.forEach((prof: any) => {
			content += `- ${prof.name}\n`;
		});
		content += `\n`;
	}

	if (data.languages && data.languages.length > 0) {
		content += `## Languages\n\n`;
		data.languages.forEach((lang: any) => {
			content += `- ${lang.name}\n`;
		});
		content += `\n`;
	}

	if (data.traits && data.traits.length > 0) {
		content += `## Racial Traits\n\n`;
		data.traits.forEach((trait: any) => {
			content += `- ${trait.name}\n`;
		});
		content += `\n`;
	}

	if (data.subraces && data.subraces.length > 0) {
		content += `## Subraces\n\n`;
		data.subraces.forEach((subrace: any) => {
			content += `- ${subrace.name}\n`;
		});
		content += `\n`;
	}

	return content;
}

function generateSkillContent(data: any): string {
	let content = "";

	if (data.ability_score) {
		content += `**Ability Score:** ${data.ability_score.name}\n\n`;
	}

	if (data.desc && data.desc.length > 0) {
		content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
	}

	return content;
}

function generateSubclassContent(data: any): string {
	let content = "";

	if (data.class) {
		content += `**Class:** ${data.class.name}\n`;
	}

	if (data.subclass_flavor) {
		content += `**Flavor:** ${data.subclass_flavor}\n`;
	}

	content += `\n`;

	if (data.desc && data.desc.length > 0) {
		content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
	}

	if (data.spells && data.spells.length > 0) {
		content += `## Spells\n\n`;
		data.spells.forEach((spell: any) => {
			content += `- **Level ${spell.prerequisites[0]?.level || "N/A"}:** ${spell.spell.name}\n`;
		});
		content += `\n`;
	}

	return content;
}

function generateSubraceContent(data: any): string {
	let content = "";

	if (data.race) {
		content += `**Race:** ${data.race.name}\n`;
	}

	content += `\n`;

	if (data.desc) {
		content += `## Description\n\n${data.desc}\n\n`;
	}

	if (data.ability_bonuses && data.ability_bonuses.length > 0) {
		content += `## Ability Score Increases\n\n`;
		data.ability_bonuses.forEach((bonus: any) => {
			content += `- **${bonus.ability_score.name}:** +${bonus.bonus}\n`;
		});
		content += `\n`;
	}

	if (data.starting_proficiencies && data.starting_proficiencies.length > 0) {
		content += `## Starting Proficiencies\n\n`;
		data.starting_proficiencies.forEach((prof: any) => {
			content += `- ${prof.name}\n`;
		});
		content += `\n`;
	}

	if (data.racial_traits && data.racial_traits.length > 0) {
		content += `## Racial Traits\n\n`;
		data.racial_traits.forEach((trait: any) => {
			content += `- ${trait.name}\n`;
		});
		content += `\n`;
	}

	return content;
}

function generateTraitContent(data: any): string {
	let content = "";

	if (data.races && data.races.length > 0) {
		content += `**Races:** ${data.races.map((r: any) => r.name).join(", ")}\n\n`;
	}

	if (data.subraces && data.subraces.length > 0) {
		content += `**Subraces:** ${data.subraces.map((s: any) => s.name).join(", ")}\n\n`;
	}

	if (data.desc && data.desc.length > 0) {
		content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
	}

	return content;
}

function generateWeaponPropertyContent(data: any): string {
	let content = "";
	if (data.desc && data.desc.length > 0) {
		content += `## Description\n\n${data.desc.join("\n\n")}\n\n`;
	}
	return content;
}

function generateGenericContent(data: any): string {
	let content = "## Data\n\n```json\n";
	content += JSON.stringify(data, null, 2);
	content += "\n```\n";
	return content;
}
