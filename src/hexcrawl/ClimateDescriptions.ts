/**
 * Climate × Terrain Description Library
 * 
 * Provides pre-written, evocative read-aloud descriptions for every
 * combination of ClimateType and TerrainType. When a GM opens the
 * hex-procedure modal, the system looks up the hex's climate + terrain
 * and auto-populates a description the GM can read aloud or customise.
 * 
 * Each key is `${ClimateType}_${TerrainType}` and the value is an array
 * of variant descriptions. The system picks one at random (or cycles)
 * so repeated visits to the same combo don't feel stale.
 */

import type { ClimateType } from './types';
import type { TerrainType, DescriptionLanguage } from './types';
import { CLIMATE_TERRAIN_DESCRIPTIONS_DE } from './ClimateDescriptionsDe';

// ─── Lookup helper ─────────────────────────────────────────────────────────

type DescriptionKey = `${ClimateType}_${TerrainType}`;

/**
 * Return a random description for the given climate + terrain combo.
 * Falls back to the terrain's generic description when no match exists.
 */
export function getClimateTerrainDescription(
  climate: ClimateType | undefined,
  terrain: TerrainType,
  language: DescriptionLanguage = 'en',
): string {
  if (!climate) return '';
  const key = `${climate}_${terrain}` as DescriptionKey;
  const pool = language === 'de'
    ? (CLIMATE_TERRAIN_DESCRIPTIONS_DE[key] ?? CLIMATE_TERRAIN_DESCRIPTIONS[key] ?? [])
    : (CLIMATE_TERRAIN_DESCRIPTIONS[key] ?? []);
  if (pool.length === 0) return '';
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/**
 * Return ALL variant descriptions for the combo (for a dropdown/cycle UI).
 */
export function getAllClimateTerrainDescriptions(
  climate: ClimateType | undefined,
  terrain: TerrainType,
  language: DescriptionLanguage = 'en',
): string[] {
  if (!climate) return [];
  const key = `${climate}_${terrain}` as DescriptionKey;
  if (language === 'de') {
    return CLIMATE_TERRAIN_DESCRIPTIONS_DE[key] ?? CLIMATE_TERRAIN_DESCRIPTIONS[key] ?? [];
  }
  return CLIMATE_TERRAIN_DESCRIPTIONS[key] ?? [];
}

// ─── Description Library ───────────────────────────────────────────────────

const CLIMATE_TERRAIN_DESCRIPTIONS: Record<DescriptionKey, string[]> = {

  // ━━━ TEMPERATE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  temperate_plains: [
    'Rolling green fields stretch to the horizon beneath a high blue sky. Wildflowers dot the grassland and a gentle breeze carries the scent of clover.',
    'A patchwork of farmland and wild meadow spreads before you, bisected by a meandering stream. Birdsong fills the warm afternoon air.',
    'Tall grass ripples like an emerald sea under scattered clouds. A weathered stone marker—ancient and moss-covered—stands at a crossroads.',
  ],
  temperate_forest: [
    'Sunlight filters through a canopy of oak and beech, dappling the fern-covered floor. The air smells of damp earth and pine.',
    'Ancient trees rise like cathedral pillars, their interlocking branches admitting shafts of golden light. A carpet of fallen leaves crunches underfoot.',
    'The forest thickens around you—ivy-draped trunks, buzzing insects, and the distant tap of a woodpecker. A game trail winds between the roots.',
  ],
  temperate_hills: [
    'Gentle hills rise and fall like frozen waves, their slopes dotted with heather and low stone walls. Sheep graze on a distant ridge.',
    'Rocky outcrops break through grassy hillsides. A cool wind sweeps across the high ground, offering sweeping views of the valleys below.',
    'You crest a hill to find a verdant valley carved by a silver stream. Old ruins cling to the far hillside, half-reclaimed by ivy.',
  ],
  temperate_mountains: [
    'Gray peaks loom overhead, streaked with waterfalls that plunge into misty gorges. The trail narrows to a rocky ledge carved into the mountainside.',
    'Pine forests give way to bare stone as you climb. The air grows thin, and eagles wheel against a sky bruised with clouds.',
    'A mountain pass opens between twin summits. Wind howls through the gap, carrying flurries of grit and the distant rumble of a rock slide.',
  ],
  temperate_swamp: [
    'Murky water stretches between moss-draped willows. The ground squelches underfoot, and bulrushes whisper as unseen things slither through the shallows.',
    'A fetid bog spreads before you, its surface broken by rotting logs and clusters of pale, spongy mushrooms. Frogs croak in a continuous chorus.',
    'Thick fog clings to this waterlogged lowland. The twisted trunks of dead trees reach skyward like grasping fingers.',
  ],
  temperate_desert: [
    'A barren stretch of dry, cracked earth—perhaps an ancient lakebed. Scrubby gorse clings to life between bleached stones.',
    'Wind-scoured badlands of pale clay stretch beneath an overcast sky. Sparse thorn bushes and the occasional stunted tree are the only signs of life.',
  ],
  temperate_arctic: [
    'A late-season frost blankets the ground in white. The air bites, and puddles of ice crackle underfoot as you cross the frozen meadow.',
    'The highland plateau is windswept and barren, dusted with rime. Hardy mosses and lichens are the only vegetation.',
  ],
  temperate_coastal: [
    'White chalk cliffs overlook a pebble beach where waves lap gently. Seabirds wheel overhead, crying into a stiff salt breeze.',
    'A sheltered cove with golden sand and rock pools full of anemones. The ruins of a fishing village stand above the tideline.',
    'The coastline is a tangle of grassy dunes and tidal flats, alive with the cries of gulls and the rhythmic crash of surf.',
  ],
  temperate_jungle: [
    'An unusually dense and humid stretch of broadleaf forest, almost tropical in its lushness. Vines drape every surface and the air buzzes with insects.',
    'This sheltered valley traps warmth and moisture, spawning an improbable tangle of greenery more suited to southern lands.',
  ],
  temperate_underdark: [
    'A gaping sinkhole opens in the meadow, its edges fringed with ferns. Below, darkness yawns—and with it, a cold, mineral-scented draft.',
    'The hillside caves are well-known locally. Stalactites drip onto a worn path that descends into lamplit gloom.',
  ],
  temperate_water: [
    'A broad, slow-moving river reflects the green hills on either bank. Fish dimple the surface and herons stand motionless at the water\'s edge.',
    'A deep lake of startling blue fills a natural bowl between wooded hills. A crumbling stone jetty extends from the shore.',
  ],
  temperate_road: [
    'A well-maintained cobblestone road cuts through the countryside, flanked by low stone walls and occasionally shaded by ancient elms.',
    'The trade road is wide and rutted by wagon wheels. A milestone reads the distance to the next town. Travellers dot the route in both directions.',
  ],

  // ━━━ ARCTIC ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  arctic_plains: [
    'An endless expanse of frozen tundra stretches beneath a pewter sky. The wind screams across the flat, driving stinging ice crystals into exposed skin.',
    'The permafrost crackles underfoot. Low, hardy scrub is the only sign of life on this featureless white plain—that, and the distant howl of wolves.',
    'A vast snowfield, eerily silent save for the creak of ice. Aurora-light shimmers faintly on the horizon even in daylight.',
  ],
  arctic_forest: [
    'Frost-crusted pines stand like ghostly sentinels, their branches bowed beneath the weight of snow. Your breath hangs in the still, bitterly cold air.',
    'The taiga is dense and dark, the ground a frozen carpet of needles and ice. Somewhere ahead, a branch cracks under the weight of unseen wildlife.',
    'Pale birch trees rise from deep snow, their bark peeling like parchment. Icicles hang from every limb, glinting in the weak winter sun.',
  ],
  arctic_hills: [
    'Wind-scoured hills of bare rock and permafrost rise from the frozen plain. Snow gathers in every crevice, and the exposed ridges are polished to ice.',
    'Low, rounded hills covered in deep snow stretch in every direction. The only features are occasional boulders dropped by ancient glaciers.',
  ],
  arctic_mountains: [
    'Towering peaks of ice and black stone pierce the grey sky. Glaciers groan in the valleys below, their surfaces riven with deep blue crevasses.',
    'The mountain is a fortress of ice. Wind batters the exposed face, and avalanche chutes scar the slopes with corridors of devastation.',
    'A frozen waterfall cascades down the cliff face in suspended animation—tons of blue-white ice, eerily beautiful and utterly impassable.',
  ],
  arctic_swamp: [
    'This low-lying area is a labyrinth of frozen pools and frost-heaved hummocks. In warmer months it would be a bog; now it is a treacherous maze of thin ice.',
    'The marsh has frozen into a jumble of ice and dead reeds. Dark water still moves beneath the surface, and the ice groans ominously.',
  ],
  arctic_desert: [
    'A polar desert of wind-packed snow and exposed gravel. No precipitation falls here—just an endless, bone-dry cold that cracks lips and splits skin.',
    'The ice sheet stretches to the horizon, featureless and blinding white. The silence is absolute, broken only by your own laboured breathing.',
  ],
  arctic_arctic: [
    'Deep winter grips the land in an iron fist. The temperature is lethal; bare skin freezes in minutes. The sky offers only a thin band of grey twilight.',
    'This is the deep tundra—where even the hardiest creatures burrow underground. The world is white on white, directionless and merciless.',
  ],
  arctic_coastal: [
    'Ice-choked waters lap against a frozen shore. Sea ice extends far out into the grey ocean, punctuated by the dark shapes of icebergs.',
    'The coastline is a jumble of frozen spray and black volcanic rock. Seal colonies bark from ice floes, and the air reeks of brine and cold.',
  ],
  arctic_jungle: [
    'Against all reason, thick vegetation has taken root around a geothermal vent. Steam rises into the frigid air, and ferns grow amid the snow.',
    'A sheltered hot-spring valley sustains an impossible pocket of green. The contrast between the frozen waste and this lush micro-jungle is jarring.',
  ],
  arctic_underdark: [
    'A crack in the glacier leads down into darkness. The ice walls give way to stone, and the temperature actually rises as you descend—unnervingly.',
    'The cave mouth exhales a plume of warm mist into the frozen air. Inside, lichen glows faintly on walls slick with condensation.',
  ],
  arctic_water: [
    'A frozen lake stretches before you, its surface swept clean by the wind. Dark shapes move beneath the thick ice—fish, or perhaps something larger.',
    'The river has frozen solid, creating a natural highway of smooth ice. Pressure ridges buckle the surface where currents shift below.',
  ],
  arctic_road: [
    'The trail is barely visible—just a line of stakes driven into the snow, each topped with a frayed red flag. The wind tries to push you off the path.',
    'A frozen trade route, packed hard by sled runners. Frost-rimed mile markers list distances in Dwarvish runes.',
  ],

  // ━━━ TROPICAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  tropical_plains: [
    'A sun-baked savanna stretches beneath an immense sky. Tall golden grasses sway, and acacia trees cast spindly shadows. Distant herds raise a haze of dust.',
    'The humid grassland buzzes with insect life. Termite mounds dot the landscape like earthen towers, and the air shimmers with heat.',
  ],
  tropical_forest: [
    'The jungle closes in—a wall of green on all sides. Parrots shriek overhead, vines hang like curtains, and the air is thick enough to drink.',
    'Colossal trees with buttress roots tower above a dense understorey of ferns and palms. Shafts of light illuminate clouds of pollen and butterflies.',
    'The canopy is so dense it creates a perpetual emerald twilight below. Water drips constantly; everything is damp and alive.',
  ],
  tropical_hills: [
    'Lush green hills rise steeply, their slopes terraced by ancient hands or cut by monsoon erosion. Waterfalls cascade down every ravine.',
    'The hillside is clothed in dense tropical vegetation, broken by outcrops of red laterite rock. Clouds cling to the summit.',
  ],
  tropical_mountains: [
    'Cloud forests drape the mountainside, their trees festooned with epiphytes and orchids. Mist rolls through the passes in great white curtains.',
    'The volcanic peak steams gently, its slopes green to treeline and bare black rock above. The air is warm even at altitude.',
  ],
  tropical_swamp: [
    'A mangrove swamp stretches to the horizon—tangled roots, brackish water, and the drone of a million mosquitoes. Crocodile eyes surface and vanish.',
    'The tropical wetland is a riot of life: herons, snakes, fish leaping from dark water. The heat is suffocating and the smell is overwhelming.',
  ],
  tropical_desert: [
    'A stretch of sun-blasted hardpan between jungle regions. Thorny scrub and cacti cling to the cracked red earth. Heat mirages shimmer on the horizon.',
    'This arid pocket in the jungle belt bakes under relentless sun. Lizards dart between the rocks, and vultures circle patiently.',
  ],
  tropical_arctic: [
    'An impossible anomaly—frost and ice persist amid tropical heat. Some Cold-magic must sustain this unnatural frozen zone.',
    'The temperature drops sharply as you enter this magically chilled region. Frost rimes the edges of tropical leaves, creating an eerie contrast.',
  ],
  tropical_coastal: [
    'White sand beaches fringed by swaying palm trees. Turquoise waves lap at the shore, and colourful fish dart through the crystal shallows.',
    'A steamy stretch of coast where jungle meets the sea. Mangrove roots reach into tidal pools, and hermit crabs scuttle across the wet sand.',
  ],
  tropical_jungle: [
    'This is deep jungle—untouched, primordial. The canopy towers two hundred feet overhead. You are an intruder in a world that belongs to something else.',
    'Every surface is alive: lichen, moss, crawling insects, flowers of impossible colour. The air thrums with a constant chorus of birds, frogs, and things unnamed.',
    'Dinosaur tracks sink into the muddy trail. The jungle here is ancient beyond reckoning, and it watches your passage with a thousand unseen eyes.',
  ],
  tropical_underdark: [
    'A cenote—a vast sinkhole—opens in the jungle floor, its vertical walls dripping with roots and vines. Turquoise water glimmers far below.',
    'The cave entrance is hidden behind a waterfall. Inside, bioluminescent fungi paint the walls in ghostly blue-green light.',
  ],
  tropical_water: [
    'A wide, muddy river winds through the jungle, its surface dotted with lily pads and the occasional log that may not be a log at all.',
    'A steaming jungle lake, its waters mirror-still and dark. Strange birds call from the far shore, and bubbles rise from the depths.',
  ],
  tropical_road: [
    'An overgrown trail hacked through the jungle—already the vegetation is reclaiming it. Machete marks scar the tree trunks.',
    'A raised wooden causeway spans the wetlands, its planks green with algae and warped by the humidity.',
  ],

  // ━━━ ARID ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  arid_plains: [
    'A sun-scorched expanse of hard-packed earth and sparse, dried grass. The heat distorts the air into shimmering mirages on the horizon.',
    'The steppe is dry and dusty, dotted with thorn bushes and the bleached bones of animals. A hot wind blows from the south.',
  ],
  arid_forest: [
    'Twisted, drought-resistant trees cling to the dry soil—their trunks gnarled, their leaves grey-green and waxy. Every shadow is a precious refuge.',
    'A sparse woodland of scrub oak and juniper occupies this dry plateau. The soil is sandy and the leaf litter crackles like paper.',
  ],
  arid_hills: [
    'Barren red-rock mesas and winding canyons carved by an ancient river. The stone is layered in bands of rust, amber, and cream.',
    'Wind-eroded hills of sandstone rise from the desert floor, sculpted by aeons into strange, organic shapes.',
  ],
  arid_mountains: [
    'Towering sandstone cliffs glow red-gold in the harsh light. Not a drop of water is visible anywhere—only endless, crumbling rock faces.',
    'The mountain is a sun-bleached fortress. Desert winds have carved arches and pillars from the softer stone, creating an alien landscape.',
  ],
  arid_swamp: [
    'An alkali flat—blinding white salt crusts over shallow, briny pools. The water is undrinkable, and the stench of mineral deposits stings the nostrils.',
    'A muddy oasis surrounded by cracked earth—a dying wetland sustained by a failing underground spring.',
  ],
  arid_desert: [
    'Dunes of fine golden sand roll to the horizon like a frozen ocean. The sun beats down without mercy, and the wind reshapes the land hour by hour.',
    'A vast, stony desert of black basalt and orange sand. The heat radiates from the ground in visible waves, and silence reigns.',
    'The desert is featureless and deadly. Your water skins feel lighter with every step. A line of distant palm trees might be real—or might not.',
  ],
  arid_arctic: [
    'The desert becomes cold at night—bitterly, lethally cold. Frost dusts the sand at dawn before the sun burns it away within an hour.',
    'A high-altitude cold desert where freezing winds scour a landscape of stony rubble. It is both parched and frozen.',
  ],
  arid_coastal: [
    'A desolate, windswept shore where desert meets ocean. Bleached driftwood and shells line a beach of coarse, yellow sand.',
    'The coast is a flat expanse of salt marshes and tidal flats baked hard by the sun. Flamingos wade in the shallow lagoons.',
  ],
  arid_jungle: [
    'A walled oasis filled with date palms and dense greenery—a shocking contrast to the barren waste around it. A spring bubbles at its centre.',
    'Around this oasis, dense vegetation crowds the banks of a shrinking pool. The clash of lush green and scorched sand is striking.',
  ],
  arid_underdark: [
    'A cave mouth yawns in the canyon wall, exhaling cool, damp air—precious relief from the desert heat. Ancient carvings flank the entrance.',
    'A sinkhole in the hardpan reveals a system of caverns below. The temperature drops dramatically as you descend.',
  ],
  arid_water: [
    'A hidden oasis lake, improbably blue against the tawny desert. Palm trees ring its shore, and the water is clear and sweet.',
    'A muddy, shrinking river cuts a channel through the desert. Its banks are lined with salt deposits and desperate vegetation.',
  ],
  arid_road: [
    'A caravan trail marked by cairns of stacked stones. The sand has drifted across it in places, and old wagon ruts are the only guide.',
    'The trade road is a baked-clay ribbon cutting through the wasteland. Bleached animal skulls mark the route at intervals—grim milestones.',
  ],

  // ━━━ VOLCANIC ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  volcanic_plains: [
    'A flat expanse of hardened lava rock, cracked and treacherous. Wisps of steam rise from fissures, and the air reeks of sulphur.',
    'Ash-covered plains stretch in every direction, grey and lifeless. The ground is warm to the touch, and faint tremors are a constant companion.',
  ],
  volcanic_forest: [
    'Charred tree trunks stand like blackened pillars in a forest killed by pyroclastic flow. New growth—ferns and saplings—pushes through the ash.',
    'The forest grows on old lava flows; trees thrust their roots into cracks in the basalt. The soil is rich and dark, but the air carries an acrid tang.',
  ],
  volcanic_hills: [
    'Cinder cones and lava ridges rise from the ashen terrain. Vents hiss with escaping gas, and the rock is warm underfoot.',
    'The hillside is a patchwork of old lava flows—some glossy black obsidian, others rough and rust-coloured with oxidised iron.',
  ],
  volcanic_mountains: [
    'The volcano looms above, its summit wreathed in smoke and the occasional flash of orange light. Rivers of molten rock scar the upper slopes.',
    'A mountain of black basalt and grey ash, its flanks cut by deep ravines. Hot springs pool in the lower valleys, steaming in the cool morning air.',
  ],
  volcanic_swamp: [
    'A geothermal marsh of hot mud pools and steaming vents. The water is unnervingly warm, and bubbles of gas burst on the surface with a sulphurous pop.',
    'Acidic hot springs feed a toxic wetland. The vegetation here is strange—pale, spongy, thriving on minerals that would kill normal plants.',
  ],
  volcanic_desert: [
    'A barren lava field stretches before you—a hellscape of jagged black rock and glowing fissures. The heat is oppressive even without the sun.',
    'The Inferno River—a slow-moving channel of molten rock—cuts through this blasted wasteland. The air shimmers and the ground hisses with each step.',
  ],
  volcanic_arctic: [
    'An impossible meeting of fire and ice. Glaciers calve into steaming lakes, and columns of water vapour rise where lava meets the frozen ground.',
    'Geothermal vents have melted channels through the ice, creating warm oases surrounded by frozen tundra. The mix is disorienting.',
  ],
  volcanic_coastal: [
    'Black sand beaches of crushed volcanic glass stretch along the shore. The water steams where hot springs flow into the cold ocean.',
    'Columns of basalt, hexagonal and alien, rise from the surf. Geysers erupt periodically along the coastline, sending plumes of boiling water skyward.',
  ],
  volcanic_jungle: [
    'Lush tropical growth has colonised the old lava fields. The soil here is incredibly fertile—plants grow to enormous size, fed by volcanic minerals.',
    'A steaming jungle fills a volcanic caldera, fed by hot springs and geothermal heat. The vegetation is prehistoric in its immensity.',
  ],
  volcanic_underdark: [
    'The cavern glows with the light of a magma river far below. The heat is brutal, and the stone walls are warm to the touch.',
    'Lava tubes wind through the volcanic rock, their walls glazed smooth by ancient flows. The air is hot, metallic, and barely breathable.',
  ],
  volcanic_water: [
    'A boiling lake fills a volcanic crater, its surface churning with gas and steam. The water is acidic—nothing lives in its emerald-green depths.',
    'Hot springs cascade down terraced pools of white mineral deposits. The water ranges from scalding to pleasantly warm in the lower basins.',
  ],
  volcanic_road: [
    'A path of cooled lava, worn smooth by travellers. It winds between steaming vents and crags of obsidian. Metal wagon fittings have corroded to red flakes.',
    'The Ashway—a raised road built on packed volcanic gravel—crosses the lava fields. Sulphur-yellow deposits mark the route\'s edges.',
  ],

  // ━━━ MARITIME ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  maritime_plains: [
    'Salt-tinged winds sweep across low coastal meadows. The grass is thick and coarse, bent permanently landward by the prevailing sea breeze.',
    'Flat, marshy farmland stretches inland from the shore. Drainage ditches glint in the grey light, and the cries of seabirds are ever-present.',
  ],
  maritime_forest: [
    'A fog-shrouded forest of twisted, wind-bent trees draped in Old Man\'s Beard lichen. The air is damp, and everything glistens with moisture.',
    'Dense coastal woodland pressed against the sea cliffs. The salt air has stunted the trees on the windward side into gnarled, bonsai-like shapes.',
  ],
  maritime_hills: [
    'Sea cliffs rise sharply from the crashing surf below, their grassy tops swept by perpetual wind. Nesting seabirds pack every ledge.',
    'Rolling coastal hills, their seaward slopes bare and windswept, their landward sides sheltered and green. Fog pools in every hollow.',
  ],
  maritime_mountains: [
    'Sea stacks and coastal peaks emerge from the mist like the spines of some vast creature. Waterfalls plunge directly into the ocean.',
    'The fjord walls rise vertically on either side, their grey stone streaked with cascading water. The passage is narrow, dark, and cold.',
  ],
  maritime_swamp: [
    'A tidal salt marsh, crisscrossed by muddy channels that fill and drain with the tide. Wading birds stalk through the reeds.',
    'Brackish wetlands where freshwater streams meet the sea. The mud is deep, the footing treacherous, and the smell of decay is strong.',
  ],
  maritime_desert: [
    'A fog desert where mist rolls in from the ocean but no rain falls. Moisture condenses on every surface, but the ground remains parched.',
    'A barren, salt-encrusted flat near the coast. Storm surge has killed all vegetation, leaving a desolate white plain.',
  ],
  maritime_arctic: [
    'A frozen coastline battered by frigid ocean storms. Sea spray freezes instantly on every surface, creating bizarre ice formations.',
    'The northern shore is a wall of ice meeting dark, churning water. Bergs calve and slide into the sea with thunderous cracks.',
  ],
  maritime_coastal: [
    'A classic stretching coastline—sandy beaches, hidden coves, tidal caves, and the ever-present rhythm of the waves. Salt is in everything.',
    'A busy harbour coastline of wharves, jetties, and fishing boats. The smell of tar, salt fish, and rope is thick in the air.',
    'Sea caves honeycomb the eroded limestone cliffs. At low tide, dark passages beckon; at high tide, the ocean swallows them whole.',
  ],
  maritime_jungle: [
    'A rain-drenched coastal jungle where sea mist and tropical humidity combine. Everything drips; everything is green; everything is alive.',
    'Dense mangrove forest at the river delta—a labyrinth of roots, channels, and mudflats. Navigation is by water only.',
  ],
  maritime_underdark: [
    'A sea cave system carved by millennia of tidal action. The passages flood and drain with the tide—timing your descent is critical.',
    'The cliff face is riddled with tunnels. The sound of the ocean echoes through them, creating an eerie, rhythmic pulse.',
  ],
  maritime_water: [
    'Open ocean stretches in every direction—grey-green swells under a leaden sky. The wind is strong and carries the taste of salt.',
    'A sheltered bay of dark water, ringed by steep, forested shores. Fishing boats rock gently at their moorings.',
  ],
  maritime_road: [
    'A coastal road carved into the cliff face, its seaward edge crumbling. Spray from the waves below coats the stones in slippery salt.',
    'The old harbour road follows the shoreline, passing through fishing villages and between drying racks heavy with salted fish.',
  ],
};
