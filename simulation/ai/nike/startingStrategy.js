import * as filters from "simulation/ai/common-api/filters.js";
import { ResourcesManager } from "simulation/ai/common-api/resources.js";
import { SquareVectorDistance, aiWarn } from "simulation/ai/common-api/utils.js";
import { Config } from "simulation/ai/nike/config.js";
import * as difficulty from "simulation/ai/nike/difficultyLevel.js";
import { gatherTreasure, getHolder, getLandAccess, isFastMoving } from
	"simulation/ai/nike/entityExtend.js";
import { ConstructionPlan } from "simulation/ai/nike/queueplanBuilding.js";

/**
 * Determines the strategy to adopt when starting a new game,
 * depending on the initial conditions
 */

export function gameAnalysis(HQ, gameState)
{
	// Analysis of the terrain and the different access regions
	if (!regionAnalysis(HQ, gameState))
		return false;

	HQ.attackManager.init(gameState);
	HQ.buildManager.init(gameState);
	HQ.navalManager.init(gameState);
	HQ.tradeManager.init(gameState);
	HQ.diplomacyManager.init(gameState);

	// Make a list of buildable structures from the config file
	structureAnalysis(HQ, gameState);

	// Let's get our initial situation here.
	HQ.basesManager.init(gameState);
	HQ.updateTerritories(gameState);

	// Assign entities and resources in the different bases
	assignStartingEntities(HQ, gameState);


	// Sandbox difficulty should not try to expand
	HQ.canExpand = HQ.Config.difficulty != difficulty.SANDBOX;
	// If no base yet, check if we can construct one. If not, dispatch our units to possible tasks/attacks
	HQ.canBuildUnits = true;
	if (!gameState.getOwnStructures().filter(filters.byClass("CivCentre")).hasEntities())
	{
		const template = gameState.applyCiv("structures/{civ}/civil_centre");
		if (!gameState.isTemplateAvailable(template) || !gameState.getTemplate(template).available(gameState))
		{
			if (HQ.Config.debug > 1)
				aiWarn(" this AI is unable to produce any units");
			HQ.canBuildUnits = false;
			dispatchUnits(HQ, gameState);
		}
		else
			buildFirstBase(HQ, gameState);
	}

	// configure our first base strategy
	if (HQ.hasPotentialBase())
		configFirstBase(HQ, gameState);

	return true;
}

/**
 * Assign the starting entities to the different bases
 */
function assignStartingEntities(HQ, gameState)
{
	for (const ent of gameState.getOwnEntities().values())
	{
		// do not affect merchant ship immediately to trade as they may-be useful for transport
		if (ent.hasClasses(["Trader+!Ship"]))
			HQ.tradeManager.assignTrader(ent);

		const pos = ent.position();
		if (!pos)
		{
			// TODO should support recursive garrisoning. Make a warning for now
			if (ent.isGarrisonHolder() && ent.garrisoned().length)
			{
				aiWarn("Nike warning: support for garrisoned units inside garrisoned holders " +
					"not yet implemented");
			}
			continue;
		}

		// make sure we have not rejected small regions with units (TODO should probably also check with other non-gaia units)
		const gamepos = gameState.ai.accessibility.gamePosToMapPos(pos);
		const index = gamepos[0] + gamepos[1]*gameState.ai.accessibility.width;
		const land = gameState.ai.accessibility.landPassMap[index];
		if (land > 1 && !HQ.landRegions[land])
			HQ.landRegions[land] = true;
		const sea = gameState.ai.accessibility.navalPassMap[index];
		if (sea > 1 && !HQ.navalRegions[sea])
			HQ.navalRegions[sea] = true;

		// if garrisoned units inside, ungarrison them except if a ship in which case we will make a transport
		// when a construction will start (see createTransportIfNeeded)
		if (ent.isGarrisonHolder() && ent.garrisoned().length && !ent.hasClass("Ship"))
			for (const id of ent.garrisoned())
				ent.unload(id);

		const territorypos = HQ.territoryMap.gamePosToMapPos(pos);
		const territoryIndex = territorypos[0] + territorypos[1] * HQ.territoryMap.width;

		HQ.basesManager.assignEntity(gameState, ent, territoryIndex);
	}
}

/**
 * determine the main land Index (or water index if none)
 * as well as the list of allowed (land andf water) regions
 */
function regionAnalysis(HQ, gameState)
{
	const accessibility = gameState.ai.accessibility;
	let landIndex;
	let seaIndex;
	const ccEnts = gameState.getOwnStructures().filter(filters.byClass("CivCentre"));
	for (const cc of ccEnts.values())
	{
		const land = accessibility.getAccessValue(cc.position());
		if (land > 1)
		{
			landIndex = land;
			break;
		}
	}
	if (!landIndex)
	{
		const civ = gameState.getPlayerCiv();
		for (const ent of gameState.getOwnEntities().values())
		{
			if (!ent.position() || !ent.hasClass("Unit") && !ent.trainableEntities(civ))
				continue;
			const land = accessibility.getAccessValue(ent.position());
			if (land > 1)
			{
				landIndex = land;
				break;
			}
			const sea = accessibility.getAccessValue(ent.position(), true);
			if (!seaIndex && sea > 1)
				seaIndex = sea;
		}
	}
	if (!landIndex && !seaIndex)
	{
		aiWarn("Nike error: it does not know how to interpret this map");
		return false;
	}

	const passabilityMap = gameState.getPassabilityMap();
	const totalSize = passabilityMap.width * passabilityMap.width;
	const minLandSize = Math.floor(0.1*totalSize);
	const minWaterSize = Math.floor(0.2*totalSize);
	const cellArea = passabilityMap.cellSize * passabilityMap.cellSize;
	for (let i = 0; i < accessibility.regionSize.length; ++i)
	{
		if (landIndex && i == landIndex)
			HQ.landRegions[i] = true;
		else if (accessibility.regionType[i] === "land" && cellArea*accessibility.regionSize[i] > 320)
		{
			if (landIndex)
			{
				const sea = HQ.getSeaBetweenIndices(gameState, landIndex, i);
				if (sea && (accessibility.regionSize[i] > minLandSize || accessibility.regionSize[sea] > minWaterSize))
				{
					HQ.navalMap = true;
					HQ.landRegions[i] = true;
					HQ.navalRegions[sea] = true;
				}
			}
			else
			{
				const traject = accessibility.getTrajectToIndex(seaIndex, i);
				if (traject && traject.length === 2)
				{
					HQ.navalMap = true;
					HQ.landRegions[i] = true;
					HQ.navalRegions[seaIndex] = true;
				}
			}
		}
		else if (accessibility.regionType[i] === "water" && accessibility.regionSize[i] > minWaterSize)
		{
			HQ.navalMap = true;
			HQ.navalRegions[i] = true;
		}
		else if (accessibility.regionType[i] === "water" && cellArea*accessibility.regionSize[i] > 3600)
			HQ.navalRegions[i] = true;
	}

	if (HQ.Config.debug < 3)
		return true;
	for (const region in HQ.landRegions)
	{
		aiWarn(" >>> zone " + region + " taille " +
			cellArea * gameState.ai.accessibility.regionSize[region]);
	}
	aiWarn(" navalMap " + HQ.navalMap);
	aiWarn(" landRegions " + uneval(HQ.landRegions));
	aiWarn(" navalRegions " + uneval(HQ.navalRegions));
	return true;
}

/**
 * load units and buildings from the config files
 * TODO: change that to something dynamic
 */
function structureAnalysis(HQ, gameState)
{
	const civref = gameState.playerData.civ;
	const civ = civref in HQ.Config.buildings ? civref : 'default';
	HQ.bAdvanced = [];
	for (const building of HQ.Config.buildings[civ])
		if (gameState.isTemplateAvailable(gameState.applyCiv(building)))
			HQ.bAdvanced.push(gameState.applyCiv(building));
}

/**
 * build our first base
 * if not enough resource, try first to do a dock
 */
export function buildFirstBase(HQ, gameState)
{
	if (gameState.ai.queues.civilCentre.hasQueuedUnits())
		return;
	let templateName = gameState.applyCiv("structures/{civ}/civil_centre");
	if (gameState.isTemplateDisabled(templateName))
		return;
	let template = gameState.getTemplate(templateName);
	if (!template)
		return;
	const total = gameState.getResources();
	let goal = "civil_centre";
	if (!total.canAfford(new ResourcesManager(template.cost())))
	{
		const totalExpected = gameState.getResources();
		// Check for treasures around available in some maps at startup
		for (const ent of gameState.getOwnUnits().values())
		{
			if (!ent.position())
				continue;
			// If we can get a treasure around, just do it
			if (ent.isIdle())
				gatherTreasure(gameState, ent);
			// Then count the resources from the treasures being collected
			const treasureId = ent.getMetadata(PlayerID, "treasure");
			if (!treasureId)
				continue;
			const treasure = gameState.getEntityById(treasureId);
			if (!treasure)
				continue;
			const types = treasure.treasureResources();
			for (const type in types)
				if (type in totalExpected)
					totalExpected[type] += types[type];
			// If we can collect enough resources from these treasures, wait for them.
			if (totalExpected.canAfford(new ResourcesManager(template.cost())))
				return;
		}

		// not enough resource to build a cc, try with a dock to accumulate resources if none yet
		if (!HQ.navalManager.docks.filter(filters.byClass("Dock")).hasEntities())
		{
			if (gameState.ai.queues.dock.hasQueuedUnits())
				return;
			templateName = gameState.applyCiv("structures/{civ}/dock");
			if (gameState.isTemplateDisabled(templateName))
				return;
			template = gameState.getTemplate(templateName);
			if (!template || !total.canAfford(new ResourcesManager(template.cost())))
				return;
			goal = "dock";
		}
	}
	if (!HQ.canBuild(gameState, templateName))
		return;

	// We first choose as startingPoint the point where we have the more units
	const startingPoint = [];
	for (const ent of gameState.getOwnUnits().values())
	{
		if (!ent.hasClass("Worker"))
			continue;
		if (isFastMoving(ent))
			continue;
		let pos = ent.position();
		if (!pos)
		{
			const holder = getHolder(gameState, ent);
			if (!holder || !holder.position())
				continue;
			pos = holder.position();
		}
		const gamepos = gameState.ai.accessibility.gamePosToMapPos(pos);
		const index = gamepos[0] + gamepos[1] * gameState.ai.accessibility.width;
		const land = gameState.ai.accessibility.landPassMap[index];
		const sea = gameState.ai.accessibility.navalPassMap[index];
		let found = false;
		for (const point of startingPoint)
		{
			if (land !== point.land || sea !== point.sea)
				continue;
			if (SquareVectorDistance(point.pos, pos) > 2500)
				continue;
			point.weight += 1;
			found = true;
			break;
		}
		if (!found)
			startingPoint.push({ "pos": pos, "land": land, "sea": sea, "weight": 1 });
	}
	if (!startingPoint.length)
		return;

	let imax = 0;
	for (let i = 1; i < startingPoint.length; ++i)
		if (startingPoint[i].weight > startingPoint[imax].weight)
			imax = i;

	if (goal == "dock")
	{
		const sea = startingPoint[imax].sea > 1 ? startingPoint[imax].sea : undefined;
		gameState.ai.queues.dock.addPlan(new ConstructionPlan(gameState, "structures/{civ}/dock",
			{ "sea": sea, "proximity": startingPoint[imax].pos }));
	}
	else
	{
		gameState.ai.queues.civilCentre.addPlan(new ConstructionPlan(gameState,
			"structures/{civ}/civil_centre",
			{ "base": -1, "resource": "wood", "proximity": startingPoint[imax].pos }));
	}
}

/**
 * set strategy if game without construction:
 *   - if one of our allies has a cc, affect a small fraction of our army for his defense, the rest will attack
 *   - otherwise all units will attack
 */
function dispatchUnits(HQ, gameState)
{
	const allycc = gameState.getExclusiveAllyEntities().filter(filters.byClass("CivCentre"))
		.toEntityArray();
	if (allycc.length)
	{
		if (HQ.Config.debug > 1)
		{
			aiWarn(" We have allied cc " + allycc.length + " and " + gameState.getOwnUnits().length +
				" units ");
		}
		const units = gameState.getOwnUnits();
		let num = Math.max(Math.min(Math.round(0.08 * (1 + HQ.Config.personality.cooperative) *
			units.length), 20), 5);
		let num1 = Math.floor(num / 2);
		let num2 = num1;
		// first pass to affect ranged infantry
		units.filter(filters.byClasses(["Infantry+Ranged"])).forEach(ent =>
		{
			if (!num || !num1)
				return;
			if (ent.getMetadata(PlayerID, "allied"))
				return;
			const access = getLandAccess(gameState, ent);
			for (const cc of allycc)
			{
				if (!cc.position() || getLandAccess(gameState, cc) != access)
					continue;
				--num;
				--num1;
				ent.setMetadata(PlayerID, "allied", true);
				const range = 1.5 * cc.footprintRadius();
				ent.moveToRange(cc.position()[0], cc.position()[1], range, range + 5);
				break;
			}
		});
		// second pass to affect melee infantry
		units.filter(filters.byClasses(["Infantry+Melee"])).forEach(ent =>
		{
			if (!num || !num2)
				return;
			if (ent.getMetadata(PlayerID, "allied"))
				return;
			const access = getLandAccess(gameState, ent);
			for (const cc of allycc)
			{
				if (!cc.position() || getLandAccess(gameState, cc) != access)
					continue;
				--num;
				--num2;
				ent.setMetadata(PlayerID, "allied", true);
				const range = 1.5 * cc.footprintRadius();
				ent.moveToRange(cc.position()[0], cc.position()[1], range, range + 5);
				break;
			}
		});
		// and now complete the affectation, including all support units
		units.forEach(ent =>
		{
			if (!num && !ent.hasClass("Support"))
				return;
			if (ent.getMetadata(PlayerID, "allied"))
				return;
			const access = getLandAccess(gameState, ent);
			for (const cc of allycc)
			{
				if (!cc.position() || getLandAccess(gameState, cc) != access)
					continue;
				if (!ent.hasClass("Support"))
					--num;
				ent.setMetadata(PlayerID, "allied", true);
				const range = 1.5 * cc.footprintRadius();
				ent.moveToRange(cc.position()[0], cc.position()[1], range, range + 5);
				break;
			}
		});
	}
}

/**
 * configure our first base expansion
 *   - if on a small island, favor fishing
 *   - count the available wood resource, and allow rushes only if enough (we should otherwise favor expansion)
 */
export function configFirstBase(HQ, gameState)
{
	if (!HQ.hasPotentialBase())
		return;

	HQ.firstBaseConfig = true;

	let startingSize = 0;
	const startingLand = [];
	for (const region in HQ.landRegions)
	{
		for (const base of HQ.baseManagers())
		{
			if (!base.anchor || base.accessIndex != +region)
				continue;
			startingSize += gameState.ai.accessibility.regionSize[region];
			startingLand.push(base.accessIndex);
			break;
		}
	}
	const cell = gameState.getPassabilityMap().cellSize;
	startingSize = startingSize * cell * cell;
	if (HQ.Config.debug > 1)
		aiWarn("starting size " + startingSize + "(cut at 24000 for fish pushing)");
	if (startingSize < 25000)
	{
		HQ.saveSpace = true;
		HQ.Config.Economy.popForDock = Math.min(HQ.Config.Economy.popForDock, 16);
		const num = Math.max(HQ.Config.Economy.targetNumFishers, 2);
		for (const land of startingLand)
		{
			for (const sea of gameState.ai.accessibility.regionLinks[land])
				if (gameState.ai.HQ.navalRegions[sea])
					HQ.navalManager.updateFishingBoats(sea, num);
		}
		HQ.maxFields = 1;
		HQ.needCorral = true;
	}
	else if (startingSize < 60000)
		HQ.maxFields = 2;
	else
		HQ.maxFields = false;

	// - count the available food resource, and react accordingly
	let startingFood = gameState.getResources().food;
	startingFood += HQ.getTotalResourceLevel(gameState, ["food"], ["nearby", "medium", "faraway"]).food;

	if (startingFood < 800)
	{
		if (startingSize < 25000)
		{
			HQ.needFish = true;
			HQ.Config.Economy.popForDock = 1;
		}
		else
			HQ.needFarm = true;
	}
	// - count the available wood resource, and allow rushes only if enough (we should otherwise favor expansion)
	let startingWood = gameState.getResources().wood;
	startingWood += HQ.getTotalResourceLevel(gameState, ["wood"], ["nearby", "medium", "faraway"]).wood;

	if (HQ.Config.debug > 1)
	{
		aiWarn("startingWood: " + startingWood +
			" (cut at 8500 for no rush and 6000 for saveResources)");
	}
	if (startingWood < 6000)
	{
		HQ.saveResources = true;
		HQ.Config.Economy.popPhase2 = Math.floor(0.75 * HQ.Config.Economy.popPhase2);	// Switch to town phase sooner to be able to expand

		if (startingWood < 2000 && HQ.needFarm)
		{
			HQ.needCorral = true;
			HQ.needFarm = false;
		}
	}
	if (startingWood > 8500 && HQ.canBuildUnits)
	{
		let allowed = Math.ceil((startingWood - 8500) / 3000);
		// Not useful to prepare rushing if too long ceasefire
		if (gameState.isCeasefireActive())
		{
			if (gameState.ceasefireTimeRemaining > 900)
				allowed = 0;
			else if (gameState.ceasefireTimeRemaining > 600 && allowed > 1)
				allowed = 1;
		}
		HQ.attackManager.setRushes(allowed);
	}

	// immediatly build a wood dropsite if possible.
	if (!gameState.getOwnEntitiesByClass("DropsiteWood", true).hasEntities())
	{
		const newDP = HQ.baseManagers()[0].findBestDropsiteAndLocation(gameState, "wood");
		if (newDP.quality > 40 && HQ.canBuild(gameState, newDP.templateName))
		{
			// if we start with enough workers, put our available resources in this first dropsite
			// same thing if our pop exceed the allowed one, as we will need several houses
			const numWorkers = gameState.getOwnUnits().filter(filters.byClass("Worker")).length;
			if (numWorkers > 12 && newDP.quality > 60 ||
				gameState.getPopulation() > gameState.getPopulationLimit() + 20)
			{
				const cost = new ResourcesManager(gameState.getTemplate(newDP.templateName).cost());
				gameState.ai.queueManager.setAccounts(gameState, cost, "dropsites");
			}
			gameState.ai.queues.dropsites.addPlan(new ConstructionPlan(gameState, newDP.templateName,
				{ "base": HQ.baseManagers()[0].ID }, newDP.pos));
		}
	}
	// and build immediately a corral if needed
	if (HQ.needCorral)
	{
		const template = gameState.applyCiv("structures/{civ}/corral");
		if (!gameState.getOwnEntitiesByClass("Corral", true).hasEntities() &&
			HQ.canBuild(gameState, template))
		{
			gameState.ai.queues.corral.addPlan(
				new ConstructionPlan(gameState, template, { "base": HQ.baseManagers()[0].ID }));
		}
	}
}
