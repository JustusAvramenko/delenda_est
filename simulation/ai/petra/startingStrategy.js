import * as filters from "simulation/ai/common-api/filters.js";
import { ResourcesManager } from "simulation/ai/common-api/resources.js";
import { SquareVectorDistance, aiWarn } from "simulation/ai/common-api/utils.js";
import { Config } from "simulation/ai/petra/config.js";
import * as difficulty from "simulation/ai/petra/difficultyLevel.js";
import { gatherTreasure, getHolder, getLandAccess, isFastMoving } from
	"simulation/ai/petra/entityExtend.js";
import { Headquarters } from "simulation/ai/petra/headquarters.js";
import { ConstructionPlan } from "simulation/ai/petra/queueplanBuilding.js";

/**
 * Determines the strategy to adopt when starting a new game,
 * depending on the initial conditions
 */

Headquarters.prototype.gameAnalysis = function(gameState)
{
	// Analysis of the terrain and the different access regions
	if (!this.regionAnalysis(gameState))
		return false;

	this.attackManager.init(gameState);
	this.buildManager.init(gameState);
	this.navalManager.init(gameState);
	this.tradeManager.init(gameState);
	this.diplomacyManager.init(gameState);

	// Make a list of buildable structures from the config file
	this.structureAnalysis(gameState);

	// Let's get our initial situation here.
	this.basesManager.init(gameState);
	this.updateTerritories(gameState);

	// Assign entities and resources in the different bases
	this.assignStartingEntities(gameState);


	// Sandbox difficulty should not try to expand
	this.canExpand = this.Config.difficulty != difficulty.SANDBOX;
	// If no base yet, check if we can construct one. If not, dispatch our units to possible tasks/attacks
	this.canBuildUnits = true;
	if (!gameState.getOwnStructures().filter(filters.byClass("CivCentre")).hasEntities())
	{
		const template = gameState.applyCiv("structures/{civ}/civil_centre");
		if (!gameState.isTemplateAvailable(template) || !gameState.getTemplate(template).available(gameState))
		{
			if (this.Config.debug > 1)
				aiWarn(" this AI is unable to produce any units");
			this.canBuildUnits = false;
			this.dispatchUnits(gameState);
		}
		else
			this.buildFirstBase(gameState);
	}

	// configure our first base strategy
	if (this.hasPotentialBase())
		this.configFirstBase(gameState);

	return true;
};

/**
 * Assign the starting entities to the different bases
 */
Headquarters.prototype.assignStartingEntities = function(gameState)
{
	for (const ent of gameState.getOwnEntities().values())
	{
		// do not affect merchant ship immediately to trade as they may-be useful for transport
		if (ent.hasClasses(["Trader+!Ship"]))
			this.tradeManager.assignTrader(ent);

		const pos = ent.position();
		if (!pos)
		{
			// TODO should support recursive garrisoning. Make a warning for now
			if (ent.isGarrisonHolder() && ent.garrisoned().length)
			{
				aiWarn("Petra warning: support for garrisoned units inside garrisoned holders " +
					"not yet implemented");
			}
			continue;
		}

		// make sure we have not rejected small regions with units (TODO should probably also check with other non-gaia units)
		const gamepos = gameState.ai.accessibility.gamePosToMapPos(pos);
		const index = gamepos[0] + gamepos[1]*gameState.ai.accessibility.width;
		const land = gameState.ai.accessibility.landPassMap[index];
		if (land > 1 && !this.landRegions[land])
			this.landRegions[land] = true;
		const sea = gameState.ai.accessibility.navalPassMap[index];
		if (sea > 1 && !this.navalRegions[sea])
			this.navalRegions[sea] = true;

		// if garrisoned units inside, ungarrison them except if a ship in which case we will make a transport
		// when a construction will start (see createTransportIfNeeded)
		if (ent.isGarrisonHolder() && ent.garrisoned().length && !ent.hasClass("Ship"))
			for (const id of ent.garrisoned())
				ent.unload(id);

		const territorypos = this.territoryMap.gamePosToMapPos(pos);
		const territoryIndex = territorypos[0] + territorypos[1]*this.territoryMap.width;

		this.basesManager.assignEntity(gameState, ent, territoryIndex);
	}
};

/**
 * determine the main land Index (or water index if none)
 * as well as the list of allowed (land andf water) regions
 */
Headquarters.prototype.regionAnalysis = function(gameState)
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
		aiWarn("Petra error: it does not know how to interpret this map");
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
			this.landRegions[i] = true;
		else if (accessibility.regionType[i] === "land" && cellArea*accessibility.regionSize[i] > 320)
		{
			if (landIndex)
			{
				const sea = this.getSeaBetweenIndices(gameState, landIndex, i);
				if (sea && (accessibility.regionSize[i] > minLandSize || accessibility.regionSize[sea] > minWaterSize))
				{
					this.navalMap = true;
					this.landRegions[i] = true;
					this.navalRegions[sea] = true;
				}
			}
			else
			{
				const traject = accessibility.getTrajectToIndex(seaIndex, i);
				if (traject && traject.length === 2)
				{
					this.navalMap = true;
					this.landRegions[i] = true;
					this.navalRegions[seaIndex] = true;
				}
			}
		}
		else if (accessibility.regionType[i] === "water" && accessibility.regionSize[i] > minWaterSize)
		{
			this.navalMap = true;
			this.navalRegions[i] = true;
		}
		else if (accessibility.regionType[i] === "water" && cellArea*accessibility.regionSize[i] > 3600)
			this.navalRegions[i] = true;
	}

	if (this.Config.debug < 3)
		return true;
	for (const region in this.landRegions)
	{
		aiWarn(" >>> zone " + region + " taille " +
			cellArea * gameState.ai.accessibility.regionSize[region]);
	}
	aiWarn(" navalMap " + this.navalMap);
	aiWarn(" landRegions " + uneval(this.landRegions));
	aiWarn(" navalRegions " + uneval(this.navalRegions));
	return true;
};

/**
 * load units and buildings from the config files
 * TODO: change that to something dynamic
 */
Headquarters.prototype.structureAnalysis = function(gameState)
{
	const civref = gameState.playerData.civ;
	const civ = civref in this.Config.buildings ? civref : 'default';
	this.bAdvanced = [];
	for (const building of this.Config.buildings[civ])
		if (gameState.isTemplateAvailable(gameState.applyCiv(building)))
			this.bAdvanced.push(gameState.applyCiv(building));
};

/**
 * build our first base
 * if not enough resource, try first to do a dock
 */
Headquarters.prototype.buildFirstBase = function(gameState)
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
		if (!this.navalManager.docks.filter(filters.byClass("Dock")).hasEntities())
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
	if (!this.canBuild(gameState, templateName))
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
};

/**
 * set strategy if game without construction:
 *   - if one of our allies has a cc, affect a small fraction of our army for his defense, the rest will attack
 *   - otherwise all units will attack
 */
Headquarters.prototype.dispatchUnits = function(gameState)
{
	const allycc = gameState.getExclusiveAllyEntities().filter(filters.byClass("CivCentre"))
		.toEntityArray();
	if (allycc.length)
	{
		if (this.Config.debug > 1)
		{
			aiWarn(" We have allied cc " + allycc.length + " and " + gameState.getOwnUnits().length +
				" units ");
		}
		const units = gameState.getOwnUnits();
		let num = Math.max(Math.min(Math.round(0.08*(1+this.Config.personality.cooperative)*units.length), 20), 5);
		let num1 = Math.floor(num / 2);
		let num2 = num1;
		// first pass to affect ranged infantry
		units.filter(filters.byClasses(["Infantry+Ranged"])).forEach(ent => {
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
		units.filter(filters.byClasses(["Infantry+Melee"])).forEach(ent => {
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
		units.forEach(ent => {
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
};

/**
 * configure our first base expansion
 *   - if on a small island, favor fishing
 *   - count the available wood resource, and allow rushes only if enough (we should otherwise favor expansion)
 */
Headquarters.prototype.configFirstBase = function(gameState)
{
	if (!this.hasPotentialBase())
		return;

	this.firstBaseConfig = true;

	let startingSize = 0;
	const startingLand = [];
	for (const region in this.landRegions)
	{
		for (const base of this.baseManagers())
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
	if (this.Config.debug > 1)
		aiWarn("starting size " + startingSize + "(cut at 24000 for fish pushing)");
	if (startingSize < 25000)
	{
		this.saveSpace = true;
		this.Config.Economy.popForDock = Math.min(this.Config.Economy.popForDock, 16);
		const num = Math.max(this.Config.Economy.targetNumFishers, 2);
		for (const land of startingLand)
		{
			for (const sea of gameState.ai.accessibility.regionLinks[land])
				if (gameState.ai.HQ.navalRegions[sea])
					this.navalManager.updateFishingBoats(sea, num);
		}
		this.maxFields = 1;
		this.needCorral = true;
	}
	else if (startingSize < 60000)
		this.maxFields = 2;
	else
		this.maxFields = false;

	// - count the available food resource, and react accordingly
	let startingFood = gameState.getResources().food;
	startingFood += this.getTotalResourceLevel(gameState, ["food"], ["nearby", "medium", "faraway"]).food;

	if (startingFood < 800)
	{
		if (startingSize < 25000)
		{
			this.needFish = true;
			this.Config.Economy.popForDock = 1;
		}
		else
			this.needFarm = true;
	}
	// - count the available wood resource, and allow rushes only if enough (we should otherwise favor expansion)
	let startingWood = gameState.getResources().wood;
	startingWood += this.getTotalResourceLevel(gameState, ["wood"], ["nearby", "medium", "faraway"]).wood;

	if (this.Config.debug > 1)
	{
		aiWarn("startingWood: " + startingWood +
			" (cut at 8500 for no rush and 6000 for saveResources)");
	}
	if (startingWood < 6000)
	{
		this.saveResources = true;
		this.Config.Economy.popPhase2 = Math.floor(0.75 * this.Config.Economy.popPhase2);	// Switch to town phase sooner to be able to expand

		if (startingWood < 2000 && this.needFarm)
		{
			this.needCorral = true;
			this.needFarm = false;
		}
	}
	if (startingWood > 8500 && this.canBuildUnits)
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
		this.attackManager.setRushes(allowed);
	}

	// immediatly build a wood dropsite if possible.
	if (!gameState.getOwnEntitiesByClass("DropsiteWood", true).hasEntities())
	{
		const newDP = this.baseManagers()[0].findBestDropsiteAndLocation(gameState, "wood");
		if (newDP.quality > 40 && this.canBuild(gameState, newDP.templateName))
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
				{ "base": this.baseManagers()[0].ID }, newDP.pos));
		}
	}
	// and build immediately a corral if needed
	if (this.needCorral)
	{
		const template = gameState.applyCiv("structures/{civ}/corral");
		if (!gameState.getOwnEntitiesByClass("Corral", true).hasEntities() &&
			this.canBuild(gameState, template))
		{
			gameState.ai.queues.corral.addPlan(
				new ConstructionPlan(gameState, template, { "base": this.baseManagers()[0].ID }));
		}
	}
};
