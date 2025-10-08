import * as filters from "simulation/ai/common-api/filters.js";
import { ResourcesManager } from "simulation/ai/common-api/resources.js";
import { SquareVectorDistance, aiWarn } from "simulation/ai/common-api/utils.js";
import { AttackManager } from "simulation/ai/petra/attackManager.js";
import { AttackPlan } from "simulation/ai/petra/attackPlan.js";
import { BasesManager } from "simulation/ai/petra/basesManager.js";
import { BuildManager } from "simulation/ai/petra/buildManager.js";
import { Config } from "simulation/ai/petra/config.js";
import { DefenseManager } from "simulation/ai/petra/defenseManager.js";
import * as difficulty from "simulation/ai/petra/difficultyLevel.js";
import { DiplomacyManager } from "simulation/ai/petra/diplomacyManager.js";
import { EmergencyManager } from "simulation/ai/petra/emergencyManager.js";
import { allowCapture, getAttackBonus, getLandAccess, getMaxStrength, isLineInsideEnemyTerritory,
	setSeaAccess } from "simulation/ai/petra/entityExtend.js";
import { GarrisonManager } from "simulation/ai/petra/garrisonManager.js";
import * as mapMask from "simulation/ai/petra/mapMask.js";
import { createBorderMap, createObstructionMap, createTerritoryMap } from
	"simulation/ai/petra/mapModule.js";
import { NavalManager } from "simulation/ai/petra/navalManager.js";
import { ConstructionPlan } from "simulation/ai/petra/queueplanBuilding.js";
import { TrainingPlan } from "simulation/ai/petra/queueplanTraining.js";
import { ResearchManager } from "simulation/ai/petra/researchManager.js";
import "simulation/ai/petra/startingStrategy.js";
import { TradeManager } from "simulation/ai/petra/tradeManager.js";
import { VictoryManager } from "simulation/ai/petra/victoryManager.js";
import { Worker } from "simulation/ai/petra/worker.js";

/**
 * Headquarters
 * Deal with high level logic for the AI. Most of the interesting stuff gets done here.
 * Some tasks:
 *  -defining RESS needs
 *  -BO decisions.
 *     > training workers
 *     > building stuff (though we'll send that to bases)
 *  -picking strategy (specific manager?)
 *  -diplomacy -> diplomacyManager
 *  -planning attacks -> attackManager
 *  -picking new CC locations.
 */

export function Headquarters(config)
{
	this.Config = config;
	this.phasing = 0;	// existing values: 0 means no, i > 0 means phasing towards phase i

	// Cache various quantities.
	this.turnCache = {};
	this.lastFailedGather = {};

	this.firstBaseConfig = false;

	// Workers configuration.
	this.targetNumWorkers = this.Config.Economy.targetNumWorkers;
	this.supportRatio = this.Config.Economy.supportRatio;

	this.fortStartTime = 180;	// Sentry towers, will start at fortStartTime + towerLapseTime.
	this.towerStartTime = 0;	// Stone towers, will start as soon as available (town phase).
	this.towerLapseTime = this.Config.Military.towerLapseTime;
	this.fortressStartTime = 0;	// Fortresses, will start as soon as available (city phase).
	this.fortressLapseTime = this.Config.Military.fortressLapseTime;
	this.extraTowers = Math.round(Math.min(this.Config.difficulty, 3) * this.Config.personality.defensive);
	this.extraFortresses = Math.round(Math.max(Math.min(this.Config.difficulty - 1, 2), 0) * this.Config.personality.defensive);

	this.basesManager = new BasesManager(this.Config);
	this.attackManager = new AttackManager(this.Config);
	this.buildManager = new BuildManager();
	this.defenseManager = new DefenseManager(this.Config);
	this.tradeManager = new TradeManager(this.Config);
	this.navalManager = new NavalManager(this.Config);
	this.researchManager = new ResearchManager(this.Config);
	this.diplomacyManager = new DiplomacyManager(this.Config);
	this.garrisonManager = new GarrisonManager(this.Config);
	this.victoryManager = new VictoryManager(this.Config);
	this.emergencyManager = new EmergencyManager(this.Config);

	this.capturableTargets = new Map();
	this.capturableTargetsTime = 0;
}

/** More initialisation for stuff that needs the gameState */
Headquarters.prototype.init = function(gameState, queues)
{
	this.territoryMap = createTerritoryMap(gameState);
	// create borderMap: flag cells on the border of the map
	// then this map will be completed with our frontier in updateTerritories
	this.borderMap = createBorderMap(gameState);
	// list of allowed regions
	this.landRegions = {};
	// try to determine if we have a water map
	this.navalMap = false;
	this.navalRegions = {};

	this.treasures = gameState.getEntities().filter(ent => ent.isTreasure());
	this.treasures.registerUpdates();
	this.currentPhase = gameState.currentPhase();
	this.decayingStructures = new Set();
	this.emergencyManager.init(gameState);
};

/**
 * initialization needed after deserialization (only called when deserialization)
 */
Headquarters.prototype.postinit = function(gameState)
{
	this.basesManager.postinit(gameState);
	this.updateTerritories(gameState);
};

/**
 * returns the sea index linking regions 1 and region 2 (supposed to be different land region)
 * otherwise return undefined
 * for the moment, only the case land-sea-land is supported
 */
Headquarters.prototype.getSeaBetweenIndices = function(gameState, index1, index2)
{
	const path = gameState.ai.accessibility.getTrajectToIndex(index1, index2);
	if (path && path.length == 3 && gameState.ai.accessibility.regionType[path[1]] == "water")
		return path[1];

	if (this.Config.debug > 1)
	{
		aiWarn("bad path from " + index1 + " to " + index2 + " ??? " + uneval(path));
		aiWarn(" regionLinks start " + uneval(gameState.ai.accessibility.regionLinks[index1]));
		aiWarn(" regionLinks end   " + uneval(gameState.ai.accessibility.regionLinks[index2]));
	}
	return undefined;
};

Headquarters.prototype.checkEvents = function(gameState, events)
{
	this.buildManager.checkEvents(gameState, events);

	if (events.TerritoriesChanged.length || events.DiplomacyChanged.length)
		this.updateTerritories(gameState);

	for (const evt of events.DiplomacyChanged)
	{
		if (evt.player != PlayerID && evt.otherPlayer != PlayerID)
			continue;
		// Reset the entities collections which depend on diplomacy
		gameState.resetOnDiplomacyChanged();
		break;
	}

	this.basesManager.checkEvents(gameState, events);

	for (const evt of events.ConstructionFinished)
	{
		if (evt.newentity == evt.entity)  // repaired building
			continue;
		const ent = gameState.getEntityById(evt.newentity);
		if (!ent || ent.owner() != PlayerID)
			continue;
		if (ent.hasClass("Market") && this.maxFields)
			this.maxFields = false;
	}

	for (const evt of events.OwnershipChanged)   // capture events
	{
		if (evt.to != PlayerID)
			continue;
		const ent = gameState.getEntityById(evt.entity);
		if (!ent)
			continue;
		if (!ent.hasClass("Unit"))
		{
			if (ent.decaying())
			{
				if (ent.isGarrisonHolder() && this.garrisonManager.addDecayingStructure(gameState, evt.entity, true))
					continue;
				if (!this.decayingStructures.has(evt.entity))
					this.decayingStructures.add(evt.entity);
			}
			continue;
		}

		ent.setMetadata(PlayerID, "role", undefined);
		ent.setMetadata(PlayerID, "subrole", undefined);
		ent.setMetadata(PlayerID, "plan", undefined);
		ent.setMetadata(PlayerID, "PartOfArmy", undefined);
		if (ent.hasClass("Trader"))
		{
			ent.setMetadata(PlayerID, "role", Worker.ROLE_TRADER);
			ent.setMetadata(PlayerID, "route", undefined);
		}
		if (ent.hasClass("Worker"))
		{
			ent.setMetadata(PlayerID, "role", Worker.ROLE_WORKER);
			ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_IDLE);
		}
		if (ent.hasClass("Ship"))
			setSeaAccess(gameState, ent);
		if (!ent.hasClasses(["Support", "Ship"]) && ent.attackTypes() !== undefined)
			ent.setMetadata(PlayerID, "plan", -1);
	}

	// deal with the different rally points of training units: the rally point is set when the training starts
	// for the time being, only autogarrison is used

	for (const evt of events.TrainingStarted)
	{
		const ent = gameState.getEntityById(evt.entity);
		if (!ent || !ent.isOwn(PlayerID))
			continue;

		if (!ent._entity.trainingQueue || !ent._entity.trainingQueue.length)
			continue;
		const metadata = ent._entity.trainingQueue[0].metadata;
		if (metadata && metadata.garrisonType)
			ent.setRallyPoint(ent, "garrison");  // trained units will autogarrison
		else
			ent.unsetRallyPoint();
	}

	for (const evt of events.TrainingFinished)
	{
		for (const entId of evt.entities)
		{
			const ent = gameState.getEntityById(entId);
			if (!ent || !ent.isOwn(PlayerID))
				continue;

			if (!ent.position())
			{
				// we are autogarrisoned, check that the holder is registered in the garrisonManager
				const holder = gameState.getEntityById(ent.garrisonHolderID());
				if (holder)
					this.garrisonManager.registerHolder(gameState, holder);
			}
			else if (ent.getMetadata(PlayerID, "garrisonType"))
			{
				// we were supposed to be autogarrisoned, but this has failed (may-be full)
				ent.setMetadata(PlayerID, "garrisonType", undefined);
			}

			// Check if this unit is no more needed in its attack plan
			// (happen when the training ends after the attack is started or aborted)
			const plan = ent.getMetadata(PlayerID, "plan");
			if (plan !== undefined && plan >= 0)
			{
				const attack = this.attackManager.getPlan(plan);
				if (!attack || attack.state !== AttackPlan.STATE_UNEXECUTED)
					ent.setMetadata(PlayerID, "plan", -1);
			}
		}
	}

	for (const evt of events.TerritoryDecayChanged)
	{
		const ent = gameState.getEntityById(evt.entity);
		if (!ent || !ent.isOwn(PlayerID) || ent.foundationProgress() !== undefined)
			continue;
		if (evt.to)
		{
			if (ent.isGarrisonHolder() && this.garrisonManager.addDecayingStructure(gameState, evt.entity))
				continue;
			if (!this.decayingStructures.has(evt.entity))
				this.decayingStructures.add(evt.entity);
		}
		else if (ent.isGarrisonHolder())
			this.garrisonManager.removeDecayingStructure(evt.entity);
	}

	// Then deals with decaying structures: destroy them if being lost to enemy (except in easier difficulties)
	if (this.Config.difficulty < difficulty.EASY)
		return;
	for (const entId of this.decayingStructures)
	{
		const ent = gameState.getEntityById(entId);
		if (ent && ent.decaying() && ent.isOwn(PlayerID))
		{
			const capture = ent.capturePoints();
			if (!capture)
				continue;
			const captureRatio = capture[PlayerID] / capture.reduce((a, b) => a + b);
			if (captureRatio < 0.50)
				continue;
			let decayToGaia = true;
			for (let i = 1; i < capture.length; ++i)
			{
				if (gameState.isPlayerAlly(i) || !capture[i])
					continue;
				decayToGaia = false;
				break;
			}
			if (decayToGaia)
				continue;
			let ratioMax = 0.7 + randFloat(0, 0.1);
			for (const evt of events.Attacked)
			{
				if (ent.id() != evt.target)
					continue;
				ratioMax = 0.85 + randFloat(0, 0.1);
				break;
			}
			if (captureRatio > ratioMax)
				continue;
			ent.destroy();
		}
		this.decayingStructures.delete(entId);
	}
};

Headquarters.prototype.handleNewBase = function(gameState)
{
	if (!this.firstBaseConfig)
		// This is our first base, let us configure our starting resources.
		this.configFirstBase(gameState);
	else
	{
		// Let us hope this new base will fix our possible resource shortage.
		this.saveResources = undefined;
		this.saveSpace = undefined;
		this.maxFields = false;
	}
};

/** Ensure that all requirements are met when phasing up*/
Headquarters.prototype.checkPhaseRequirements = function(gameState, queues)
{
	if (gameState.getNumberOfPhases() == this.currentPhase)
		return;

	const requirements = gameState.getPhaseEntityRequirements(this.currentPhase + 1);
	let plan;
	let queue;
	for (const entityReq of requirements)
	{
		// Village requirements are met elsewhere by constructing more houses
		if (entityReq.class == "Village" || entityReq.class == "NotField")
			continue;
		if (gameState.getOwnEntitiesByClass(entityReq.class, true).length >= entityReq.count)
			continue;
		switch (entityReq.class)
		{
		case "Town":
			if (!queues.economicBuilding.hasQueuedUnits() &&
			    !queues.militaryBuilding.hasQueuedUnits())
			{
				if (!gameState.getOwnEntitiesByClass("Market", true).hasEntities() &&
				    this.canBuild(gameState, "structures/{civ}/market"))
				{
					plan = new ConstructionPlan(gameState, "structures/{civ}/market", { "phaseUp": true });
					queue = "economicBuilding";
					break;
				}
				if (!gameState.getOwnEntitiesByClass("Temple", true).hasEntities() &&
				    this.canBuild(gameState, "structures/{civ}/temple"))
				{
					plan = new ConstructionPlan(gameState, "structures/{civ}/temple", { "phaseUp": true });
					queue = "economicBuilding";
					break;
				}
				if (!gameState.getOwnEntitiesByClass("Forge", true).hasEntities() &&
				    this.canBuild(gameState, "structures/{civ}/forge"))
				{
					plan = new ConstructionPlan(gameState, "structures/{civ}/forge", { "phaseUp": true });
					queue = "militaryBuilding";
					break;
				}
			}
			break;
		default:
			// All classes not dealt with inside vanilla game.
			// We put them for the time being on the economic queue, except if wonder
			queue = entityReq.class == "Wonder" ? "wonder" : "economicBuilding";
			if (!queues[queue].hasQueuedUnits())
			{
				const structure = this.buildManager.findStructureWithClass(gameState, [entityReq.class]);
				if (structure && this.canBuild(gameState, structure))
					plan = new ConstructionPlan(gameState, structure, { "phaseUp": true });
			}
		}

		if (plan)
		{
			if (queue == "wonder")
			{
				gameState.ai.queueManager.changePriority("majorTech", 400, { "phaseUp": true });
				plan.queueToReset = "majorTech";
			}
			else
			{
				gameState.ai.queueManager.changePriority(queue, 1000, { "phaseUp": true });
				plan.queueToReset = queue;
			}
			queues[queue].addPlan(plan);
			return;
		}
	}
};

/** Called by any "phase" research plan once it's started */
Headquarters.prototype.OnPhaseUp = function(gameState, phase)
{
};

/** This code trains citizen workers, trying to keep close to a ratio of worker/soldiers */
Headquarters.prototype.trainMoreWorkers = function(gameState, queues)
{
	// default template
	const requirementsDef = [ ["costsResource", 1, "food"] ];
	const classesDef = ["Support+Worker"];
	const templateDef = this.findBestTrainableUnit(gameState, classesDef, requirementsDef);

	// counting the workers that aren't part of a plan
	let numberOfWorkers = 0;   // all workers
	let numberOfSupports = 0;  // only support workers (i.e. non fighting)
	gameState.getOwnUnits().forEach(ent => {
		if (ent.getMetadata(PlayerID, "role") === Worker.ROLE_WORKER && ent.getMetadata(PlayerID, "plan") === undefined)
		{
			++numberOfWorkers;
			if (ent.hasClass("Support"))
				++numberOfSupports;
		}
	});
	let numberInTraining = 0;
	gameState.getOwnTrainingFacilities().forEach(function(ent) {
		for (const item of ent.trainingQueue())
		{
			numberInTraining += item.count;
			if (item.metadata && item.metadata.role && item.metadata.role === Worker.ROLE_WORKER &&
			    item.metadata.plan === undefined)
			{
				numberOfWorkers += item.count;
				if (item.metadata.support)
					numberOfSupports += item.count;
			}
		}
	});

	// Anticipate the optimal batch size when this queue will start
	// and adapt the batch size of the first and second queued workers to the present population
	// to ease a possible recovery if our population was drastically reduced by an attack
	// (need to go up to second queued as it is accounted in queueManager)
	const size = numberOfWorkers < 12 ? 1 : Math.min(5, Math.ceil(numberOfWorkers / 10));
	if (queues.villager.plans[0])
	{
		queues.villager.plans[0].number = Math.min(queues.villager.plans[0].number, size);
		if (queues.villager.plans[1])
			queues.villager.plans[1].number = Math.min(queues.villager.plans[1].number, size);
	}
	if (queues.citizenSoldier.plans[0])
	{
		queues.citizenSoldier.plans[0].number = Math.min(queues.citizenSoldier.plans[0].number, size);
		if (queues.citizenSoldier.plans[1])
			queues.citizenSoldier.plans[1].number = Math.min(queues.citizenSoldier.plans[1].number, size);
	}

	const numberOfQueuedSupports = queues.villager.countQueuedUnits();
	const numberOfQueuedSoldiers = queues.citizenSoldier.countQueuedUnits();
	const numberQueued = numberOfQueuedSupports + numberOfQueuedSoldiers;
	const numberTotal = numberOfWorkers + numberQueued;

	if (this.saveResources && numberTotal > this.Config.Economy.popPhase2 + 10)
		return;
	if (numberTotal > this.targetNumWorkers || (numberTotal >= this.Config.Economy.popPhase2 &&
		this.currentPhase == 1 && !gameState.isResearching(gameState.getPhaseName(2))))
		return;
	if (numberQueued > 50 || (numberOfQueuedSupports > 20 && numberOfQueuedSoldiers > 20) || numberInTraining > 15)
		return;

	// Choose whether we want soldiers or support units: when full pop, we aim at targetNumWorkers workers
	// with supportRatio fraction of support units. But we want to have more support (less cost) at startup.
	// So we take: supportRatio*targetNumWorkers*(1 - exp(-alfa*currentWorkers/supportRatio/targetNumWorkers))
	// This gives back supportRatio*targetNumWorkers when currentWorkers >> supportRatio*targetNumWorkers
	// and gives a ratio alfa at startup.

	let supportRatio = this.supportRatio;
	let alpha = 0.85;
	if (!gameState.isTemplateAvailable(gameState.applyCiv("structures/{civ}/field")))
		supportRatio = Math.min(this.supportRatio, 0.1);
	if (this.attackManager.rushNumber < this.attackManager.maxRushes ||
		this.attackManager.upcomingAttacks[AttackPlan.TYPE_RUSH].length)
	{
		alpha = 0.7;
	}
	if (gameState.isCeasefireActive())
		alpha += (1 - alpha) * Math.min(Math.max(gameState.ceasefireTimeRemaining - 120, 0), 180) / 180;
	const supportMax = supportRatio * this.targetNumWorkers;
	const supportNum = supportMax * (1 - Math.exp(-alpha*numberTotal/supportMax));

	let template;
	if (!templateDef || numberOfSupports + numberOfQueuedSupports > supportNum)
	{
		let requirements;
		if (numberTotal < 45)
			requirements = [ ["speed", 0.5], ["costsResource", 0.5, "stone"], ["costsResource", 0.5, "metal"] ];
		else
			requirements = [ ["strength", 1] ];

		const classes = [["CitizenSoldier", "Infantry"]];
		// We want at least 33% ranged and 33% melee.
		classes[0].push(pickRandom(["Ranged", "Melee", "Infantry"]));

		template = this.findBestTrainableUnit(gameState, classes, requirements);
	}

	// If the template variable is empty, the default unit (Support unit) will be used
	// base "0" means automatic choice of base
	if (!template && templateDef)
		queues.villager.addPlan(new TrainingPlan(gameState, templateDef, { "role": Worker.ROLE_WORKER, "base": 0, "support": true }, size, size));
	else if (template)
		queues.citizenSoldier.addPlan(new TrainingPlan(gameState, template, { "role": Worker.ROLE_WORKER, "base": 0 }, size, size));
};

/** picks the best template based on parameters and classes */
Headquarters.prototype.findBestTrainableUnit = function(gameState, classes, requirements)
{
	let units;
	if (classes.indexOf("Hero") != -1)
		units = gameState.findTrainableUnits(classes, []);
	// We do not want siege tower as AI does not know how to use it nor hero when not explicitely specified.
	else
		units = gameState.findTrainableUnits(classes, ["Hero", "SiegeTower"]);

	if (!units.length)
		return undefined;

	const parameters = requirements.slice();
	const remainingResources = this.getTotalResourceLevel(gameState);    // resources (estimation) still gatherable in our territory
	const availableResources = gameState.ai.queueManager.getAvailableResources(gameState); // available (gathered) resources
	for (const type in remainingResources)
	{
		if (availableResources[type] > 800)
			continue;
		if (remainingResources[type] > 800)
			continue;
		const costsResource = remainingResources[type] > 400 ? 0.6 : 0.2;
		let toAdd = true;
		for (const param of parameters)
		{
			if (param[0] != "costsResource" || param[2] != type)
				continue;
			param[1] = Math.min(param[1], costsResource);
			toAdd = false;
			break;
		}
		if (toAdd)
			parameters.push(["costsResource", costsResource, type]);
	}

	units.sort((a, b) => {
		const aCost = 1 + a[1].costSum();
		const bCost = 1 + b[1].costSum();
		let aValue = 0.1;
		let bValue = 0.1;
		for (const param of parameters)
		{
			if (param[0] == "strength")
			{
				aValue += getMaxStrength(a[1], gameState.ai.Config.debug, gameState.ai.Config.DamageTypeImportance) * param[1];
				bValue += getMaxStrength(b[1], gameState.ai.Config.debug, gameState.ai.Config.DamageTypeImportance) * param[1];
			}
			else if (param[0] == "siegeStrength")
			{
				aValue += getMaxStrength(a[1], gameState.ai.Config.debug, gameState.ai.Config.DamageTypeImportance, "Structure") * param[1];
				bValue += getMaxStrength(b[1], gameState.ai.Config.debug, gameState.ai.Config.DamageTypeImportance, "Structure") * param[1];
			}
			else if (param[0] == "speed")
			{
				aValue += a[1].walkSpeed() * param[1];
				bValue += b[1].walkSpeed() * param[1];
			}
			else if (param[0] == "costsResource")
			{
				// requires a third parameter which is the resource
				if (a[1].cost()[param[2]])
					aValue *= param[1];
				if (b[1].cost()[param[2]])
					bValue *= param[1];
			}
			else if (param[0] == "canGather")
			{
				// checking against wood, could be anything else really.
				if (a[1].resourceGatherRates() && a[1].resourceGatherRates()["wood.tree"])
					aValue *= param[1];
				if (b[1].resourceGatherRates() && b[1].resourceGatherRates()["wood.tree"])
					bValue *= param[1];
			}
			else
				aiWarn(" trainMoreUnits avec non prevu " + uneval(param));
		}
		return -aValue/aCost + bValue/bCost;
	});
	return units[0][0];
};

/**
 * returns an entity collection of workers through BaseManager.pickBuilders
 * TODO: when same accessIndex, sort by distance
 */
Headquarters.prototype.bulkPickWorkers = function(gameState, baseRef, number)
{
	return this.basesManager.bulkPickWorkers(gameState, baseRef, number);
};

Headquarters.prototype.getTotalResourceLevel = function(gameState, resources, proximity)
{
	return this.basesManager.getTotalResourceLevel(gameState, resources, proximity);
};

/**
 * Returns the current gather rate
 * This is not per-se exact, it performs a few adjustments ad-hoc to account for travel distance, stuffs like that.
 */
Headquarters.prototype.GetCurrentGatherRates = function(gameState)
{
	return this.basesManager.GetCurrentGatherRates(gameState);
};

/**
 * Returns the wanted gather rate.
 */
Headquarters.prototype.GetWantedGatherRates = function(gameState)
{
	if (!this.turnCache.wantedRates)
		this.turnCache.wantedRates = gameState.ai.queueManager.wantedGatherRates(gameState);

	return this.turnCache.wantedRates;
};

/**
 * Pick the resource which most needs another worker
 * How this works:
 * We get the rates we would want to have to be able to deal with our plans
 * We get our current rates
 * We compare; we pick the one where the discrepancy is highest.
 * Need to balance long-term needs and possible short-term needs.
 */
Headquarters.prototype.pickMostNeededResources = function(gameState, allowedResources = [])
{
	const wantedRates = this.GetWantedGatherRates(gameState);
	const currentRates = this.GetCurrentGatherRates(gameState);
	if (!allowedResources.length)
		allowedResources = Resources.GetCodes();

	const needed = [];
	for (const res of allowedResources)
		needed.push({ "type": res, "wanted": wantedRates[res], "current": currentRates[res] });

	needed.sort((a, b) => {
		if (a.current < a.wanted && b.current < b.wanted)
		{
			if (a.current && b.current)
				return b.wanted / b.current - a.wanted / a.current;
			if (a.current)
				return 1;
			if (b.current)
				return -1;
			return b.wanted - a.wanted;
		}
		if (a.current < a.wanted || a.wanted && !b.wanted)
			return -1;
		if (b.current < b.wanted || b.wanted && !a.wanted)
			return 1;
		return a.current - a.wanted - b.current + b.wanted;
	});
	return needed;
};

/**
 * Returns the best position to build a new Civil Center
 * Whose primary function would be to reach new resources of type "resource".
 */
Headquarters.prototype.findEconomicCCLocation = function(gameState, template, resource, proximity, fromStrategic)
{
	// This builds a map. The procedure is fairly simple. It adds the resource maps
	//	(which are dynamically updated and are made so that they will facilitate DP placement)
	// Then look for a good spot.

	Engine.ProfileStart("findEconomicCCLocation");

	// obstruction map
	const obstructions = createObstructionMap(gameState, 0, template);
	let halfSize = 0;
	if (template.get("Footprint/Square"))
		halfSize = Math.max(+template.get("Footprint/Square/@depth"), +template.get("Footprint/Square/@width")) / 2;
	else if (template.get("Footprint/Circle"))
		halfSize = +template.get("Footprint/Circle/@radius");

	const ccEnts = gameState.updatingGlobalCollection("allCCs", filters.byClass("CivCentre"));
	const dpEnts = gameState.getOwnDropsites().filter(
		filters.not(filters.byClasses(["CivCentre", "Unit"])));
	const ccList = [];
	for (const cc of ccEnts.values())
		ccList.push({ "ent": cc, "pos": cc.position(), "ally": gameState.isPlayerAlly(cc.owner()) });
	const dpList = [];
	for (const dp of dpEnts.values())
		dpList.push({ "ent": dp, "pos": dp.position(), "territory": this.territoryMap.getOwner(dp.position()) });

	let bestIdx;
	let bestVal;
	let radius = Math.ceil(template.obstructionRadius().max / obstructions.cellSize);
	let scale = 250 * 250;
	let proxyAccess;
	const nbShips = this.navalManager.transportShips.length;
	if (proximity)	// this is our first base
	{
		// if our first base, ensure room around
		radius = Math.ceil((template.obstructionRadius().max + 8) / obstructions.cellSize);
		// scale is the typical scale at which we want to find a location for our first base
		// look for bigger scale if we start from a ship (access < 2) or from a small island
		const cellArea = gameState.getPassabilityMap().cellSize * gameState.getPassabilityMap().cellSize;
		proxyAccess = gameState.ai.accessibility.getAccessValue(proximity);
		if (proxyAccess < 2 || cellArea*gameState.ai.accessibility.regionSize[proxyAccess] < 24000)
			scale = 400 * 400;
	}

	const width = this.territoryMap.width;
	const cellSize = this.territoryMap.cellSize;

	// DistanceSquare cuts to other ccs (bigger or no cuts on inaccessible ccs to allow colonizing other islands).
	const reduce = (template.hasClass("Colony") ? 30 : 0) + 30 * this.Config.personality.defensive;
	const nearbyRejected = Math.square(120);			// Reject if too near from any cc
	const nearbyAllyRejected = Math.square(200);		// Reject if too near from an allied cc
	const nearbyAllyDisfavored = Math.square(250);		// Disfavor if quite near an allied cc
	const maxAccessRejected = Math.square(410);		// Reject if too far from an accessible ally cc
	const maxAccessDisfavored = Math.square(360 - reduce);	// Disfavor if quite far from an accessible ally cc
	const maxNoAccessDisfavored = Math.square(500);		// Disfavor if quite far from an inaccessible ally cc

	let cut = 60;
	if (fromStrategic || proximity)  // be less restrictive
		cut = 30;

	for (let j = 0; j < this.territoryMap.length; ++j)
	{
		if (this.territoryMap.getOwnerIndex(j) != 0)
			continue;
		// With enough room around to build the cc
		const i = this.territoryMap.getNonObstructedTile(j, radius, obstructions);
		if (i < 0)
			continue;
		// We require that it is accessible
		const index = gameState.ai.accessibility.landPassMap[i];
		if (!this.landRegions[index])
			continue;
		if (proxyAccess && nbShips == 0 && proxyAccess != index)
			continue;

		let norm = 0.5;   // TODO adjust it, knowing that we will sum 5 maps
		// Checking distance to other cc
		const pos = [cellSize * (j%width+0.5), cellSize * (Math.floor(j/width)+0.5)];
		// We will be more tolerant for cc around our oversea docks
		let oversea = false;

		if (proximity)	// This is our first cc, let's do it near our units
			norm /= 1 + SquareVectorDistance(proximity, pos) / scale;
		else
		{
			let minDist = Math.min();
			let accessible = false;

			for (const cc of ccList)
			{
				const dist = SquareVectorDistance(cc.pos, pos);
				if (dist < nearbyRejected)
				{
					norm = 0;
					break;
				}
				if (!cc.ally)
					continue;
				if (dist < nearbyAllyRejected)
				{
					norm = 0;
					break;
				}
				if (dist < nearbyAllyDisfavored)
					norm *= 0.5;

				if (dist < minDist)
					minDist = dist;
				accessible = accessible || index == getLandAccess(gameState, cc.ent);
			}
			if (norm == 0)
				continue;

			if (accessible && minDist > maxAccessRejected)
				continue;

			if (minDist > maxAccessDisfavored)     // Disfavor if quite far from any allied cc
			{
				if (!accessible)
				{
					if (minDist > maxNoAccessDisfavored)
						norm *= 0.5;
					else
						norm *= 0.8;
				}
				else
					norm *= 0.5;
			}

			// Not near any of our dropsite, except for oversea docks
			oversea = !accessible && dpList.some(dp => getLandAccess(gameState, dp.ent) == index);
			if (!oversea)
			{
				for (const dp of dpList)
				{
					const dist = SquareVectorDistance(dp.pos, pos);
					if (dist < 3600)
					{
						norm = 0;
						break;
					}
					else if (dist < 6400)
						norm *= 0.5;
				}
			}
			if (norm == 0)
				continue;
		}

		if (this.borderMap.map[j] & mapMask.fullBorder)	// disfavor the borders of the map
			norm *= 0.5;

		let val = 2 * gameState.sharedScript.ccResourceMaps[resource].map[j];
		for (const res in gameState.sharedScript.resourceMaps)
			if (res != "food")
				val += gameState.sharedScript.ccResourceMaps[res].map[j];
		val *= norm;

		// If oversea, be just above threshold to be accepted if nothing else
		if (oversea)
			val = Math.max(val, cut + 0.1);

		if (bestVal !== undefined && val < bestVal)
			continue;
		if (this.isDangerousLocation(gameState, pos, halfSize))
			continue;
		bestVal = val;
		bestIdx = i;
	}

	Engine.ProfileStop();

	if (bestVal === undefined)
		return false;
	if (this.Config.debug > 1)
		aiWarn("we have found a base for " + resource + " with best (cut=" + cut + ") = " + bestVal);
	// not good enough.
	if (bestVal < cut)
		return false;

	const x = (bestIdx % obstructions.width + 0.5) * obstructions.cellSize;
	const z = (Math.floor(bestIdx / obstructions.width) + 0.5) * obstructions.cellSize;

	// Define a minimal number of wanted ships in the seas reaching this new base
	const indexIdx = gameState.ai.accessibility.landPassMap[bestIdx];
	for (const base of this.baseManagers())
	{
		if (!base.anchor || base.accessIndex == indexIdx)
			continue;
		const sea = this.getSeaBetweenIndices(gameState, base.accessIndex, indexIdx);
		if (sea !== undefined)
			this.navalManager.setMinimalTransportShips(gameState, sea, 1);
	}

	return [x, z];
};

/**
 * Returns the best position to build a new Civil Center
 * Whose primary function would be to assure territorial continuity with our allies
 */
Headquarters.prototype.findStrategicCCLocation = function(gameState, template)
{
	// This builds a map. The procedure is fairly simple.
	// We minimize the Sum((dist - 300)^2) where the sum is on the three nearest allied CC
	// with the constraints that all CC have dist > 200 and at least one have dist < 400
	// This needs at least 2 CC. Otherwise, go back to economic CC.

	const ccEnts = gameState.updatingGlobalCollection("allCCs", filters.byClass("CivCentre"));
	const ccList = [];
	let numAllyCC = 0;
	for (const cc of ccEnts.values())
	{
		const ally = gameState.isPlayerAlly(cc.owner());
		ccList.push({ "pos": cc.position(), "ally": ally });
		if (ally)
			++numAllyCC;
	}
	if (numAllyCC < 2)
		return this.findEconomicCCLocation(gameState, template, "wood", undefined, true);

	Engine.ProfileStart("findStrategicCCLocation");

	// obstruction map
	const obstructions = createObstructionMap(gameState, 0, template);
	let halfSize = 0;
	if (template.get("Footprint/Square"))
		halfSize = Math.max(+template.get("Footprint/Square/@depth"), +template.get("Footprint/Square/@width")) / 2;
	else if (template.get("Footprint/Circle"))
		halfSize = +template.get("Footprint/Circle/@radius");

	let bestIdx;
	let bestVal;
	const radius = Math.ceil(template.obstructionRadius().max / obstructions.cellSize);

	const width = this.territoryMap.width;
	const cellSize = this.territoryMap.cellSize;
	let currentVal, delta;
	let distcc0, distcc1, distcc2;
	const favoredDistance = (template.hasClass("Colony") ? 220 : 280) - 40 * this.Config.personality.defensive;

	for (let j = 0; j < this.territoryMap.length; ++j)
	{
		if (this.territoryMap.getOwnerIndex(j) != 0)
			continue;
		// with enough room around to build the cc
		const i = this.territoryMap.getNonObstructedTile(j, radius, obstructions);
		if (i < 0)
			continue;
		// we require that it is accessible
		const index = gameState.ai.accessibility.landPassMap[i];
		if (!this.landRegions[index])
			continue;

		// checking distances to other cc
		const pos = [cellSize * (j%width+0.5), cellSize * (Math.floor(j/width)+0.5)];
		let minDist = Math.min();
		distcc0 = undefined;

		for (const cc of ccList)
		{
			const dist = SquareVectorDistance(cc.pos, pos);
			if (dist < 14000)    // Reject if too near from any cc
			{
				minDist = 0;
				break;
			}
			if (!cc.ally)
				continue;
			if (dist < 62000)    // Reject if quite near from ally cc
			{
				minDist = 0;
				break;
			}
			if (dist < minDist)
				minDist = dist;

			if (!distcc0 || dist < distcc0)
			{
				distcc2 = distcc1;
				distcc1 = distcc0;
				distcc0 = dist;
			}
			else if (!distcc1 || dist < distcc1)
			{
				distcc2 = distcc1;
				distcc1 = dist;
			}
			else if (!distcc2 || dist < distcc2)
				distcc2 = dist;
		}
		if (minDist < 1 || minDist > 170000 && !this.navalMap)
			continue;

		delta = Math.sqrt(distcc0) - favoredDistance;
		currentVal = delta*delta;
		delta = Math.sqrt(distcc1) - favoredDistance;
		currentVal += delta*delta;
		if (distcc2)
		{
			delta = Math.sqrt(distcc2) - favoredDistance;
			currentVal += delta*delta;
		}
		// disfavor border of the map
		if (this.borderMap.map[j] & mapMask.fullBorder)
			currentVal += 10000;

		if (bestVal !== undefined && currentVal > bestVal)
			continue;
		if (this.isDangerousLocation(gameState, pos, halfSize))
			continue;
		bestVal = currentVal;
		bestIdx = i;
	}

	if (this.Config.debug > 1)
		aiWarn("We've found a strategic base with bestVal = " + bestVal);

	Engine.ProfileStop();

	if (bestVal === undefined)
		return undefined;

	const x = (bestIdx % obstructions.width + 0.5) * obstructions.cellSize;
	const z = (Math.floor(bestIdx / obstructions.width) + 0.5) * obstructions.cellSize;

	// Define a minimal number of wanted ships in the seas reaching this new base
	const indexIdx = gameState.ai.accessibility.landPassMap[bestIdx];
	for (const base of this.baseManagers())
	{
		if (!base.anchor || base.accessIndex == indexIdx)
			continue;
		const sea = this.getSeaBetweenIndices(gameState, base.accessIndex, indexIdx);
		if (sea !== undefined)
			this.navalManager.setMinimalTransportShips(gameState, sea, 1);
	}

	return [x, z];
};

/**
 * Returns the best position to build a new market: if the allies already have a market, build it as far as possible
 * from it, although not in our border to be able to defend it easily. If no allied market, our second market will
 * follow the same logic.
 * To do so, we suppose that the gain/distance is an increasing function of distance and look for the max distance
 * for performance reasons.
 */
Headquarters.prototype.findMarketLocation = function(gameState, template)
{
	let markets = gameState.updatingCollection("diplo-ExclusiveAllyMarkets", filters.byClass("Trade"),
		gameState.getExclusiveAllyEntities()).toEntityArray();
	if (!markets.length)
		markets = gameState.updatingCollection("OwnMarkets", filters.byClass("Trade"), gameState.getOwnStructures()).toEntityArray();

	if (!markets.length)	// this is the first market. For the time being, place it arbitrarily by the ConstructionPlan
		return [-1, -1, -1, 0];

	// No need for more than one market when we cannot trade.
	if (!Resources.GetTradableCodes().length)
		return false;

	// obstruction map
	const obstructions = createObstructionMap(gameState, 0, template);
	let halfSize = 0;
	if (template.get("Footprint/Square"))
		halfSize = Math.max(+template.get("Footprint/Square/@depth"), +template.get("Footprint/Square/@width")) / 2;
	else if (template.get("Footprint/Circle"))
		halfSize = +template.get("Footprint/Circle/@radius");

	let bestIdx;
	let bestJdx;
	let bestVal;
	let bestDistSq;
	let bestGainMult;
	const radius = Math.ceil(template.obstructionRadius().max / obstructions.cellSize);
	const isNavalMarket = template.hasClasses(["Naval+Trade"]);

	const width = this.territoryMap.width;
	const cellSize = this.territoryMap.cellSize;

	const traderTemplatesGains = gameState.getTraderTemplatesGains();

	for (let j = 0; j < this.territoryMap.length; ++j)
	{
		// do not try on the narrow border of our territory
		if (this.borderMap.map[j] & mapMask.narrowFrontier)
			continue;
		if (this.baseAtIndex(j) == 0)   // only in our territory
			continue;
		// with enough room around to build the market
		const i = this.territoryMap.getNonObstructedTile(j, radius, obstructions);
		if (i < 0)
			continue;
		const index = gameState.ai.accessibility.landPassMap[i];
		if (!this.landRegions[index])
			continue;
		const pos = [cellSize * (j%width+0.5), cellSize * (Math.floor(j/width)+0.5)];
		// checking distances to other markets
		let maxVal = 0;
		let maxDistSq;
		let maxGainMult;
		let gainMultiplier;
		for (const market of markets)
		{
			if (isNavalMarket && template.hasClasses(["Naval+Trade"]))
			{
				if (getSeaAccess(gameState, market) != gameState.ai.accessibility.getAccessValue(pos, true))
					continue;
				gainMultiplier = traderTemplatesGains.navalGainMultiplier;
			}
			else if (getLandAccess(gameState, market) == index &&
				!isLineInsideEnemyTerritory(gameState, market.position(), pos))
				gainMultiplier = traderTemplatesGains.landGainMultiplier;
			else
				continue;
			if (!gainMultiplier)
				continue;
			const distSq = SquareVectorDistance(market.position(), pos);
			if (gainMultiplier * distSq > maxVal)
			{
				maxVal = gainMultiplier * distSq;
				maxDistSq = distSq;
				maxGainMult = gainMultiplier;
			}
		}
		if (maxVal == 0)
			continue;
		if (bestVal !== undefined && maxVal < bestVal)
			continue;
		if (this.isDangerousLocation(gameState, pos, halfSize))
			continue;
		bestVal = maxVal;
		bestDistSq = maxDistSq;
		bestGainMult = maxGainMult;
		bestIdx = i;
		bestJdx = j;
	}

	if (this.Config.debug > 1)
		aiWarn("We found a market position with bestVal = " + bestVal);

	if (bestVal === undefined)  // no constraints. For the time being, place it arbitrarily by the ConstructionPlan
		return [-1, -1, -1, 0];
	const expectedGain = Math.round(bestGainMult * TradeGain(bestDistSq, gameState.sharedScript.mapSize));
	if (this.Config.debug > 1)
		aiWarn("this would give a trading gain of " + expectedGain);
	// Do not keep it if gain is too small, except if this is our first Market.
	let idx;
	if (expectedGain < this.tradeManager.minimalGain)
	{
		if (template.hasClass("Market") &&
		    !gameState.getOwnEntitiesByClass("Market", true).hasEntities())
			idx = -1; // Needed by queueplanBuilding manager to keep that Market.
		else
			return false;
	}
	else
		idx = this.baseAtIndex(bestJdx);

	const x = (bestIdx % obstructions.width + 0.5) * obstructions.cellSize;
	const z = (Math.floor(bestIdx / obstructions.width) + 0.5) * obstructions.cellSize;
	return [x, z, idx, expectedGain];
};

/**
 * Returns the best position to build defensive buildings (fortress and towers)
 * Whose primary function is to defend our borders
 */
Headquarters.prototype.findDefensiveLocation = function(gameState, template)
{
	// We take the point in our territory which is the nearest to any enemy cc
	// but requiring a minimal distance with our other defensive structures
	// and not in range of any enemy defensive structure to avoid building under fire.

	const ownStructures = gameState.getOwnStructures().filter(filters.byClasses(["Fortress", "Tower"]))
		.toEntityArray();
	let enemyStructures = gameState.getEnemyStructures().filter(filters.not(filters.byOwner(0)))
		.filter(filters.byClasses(["CivCentre", "Fortress", "Tower"]));
	if (!enemyStructures.hasEntities())	// we may be in cease fire mode, build defense against neutrals
	{
		enemyStructures = gameState.getNeutralStructures().filter(filters.not(filters.byOwner(0)))
			.filter(filters.byClasses(["CivCentre", "Fortress", "Tower"]));
		if (!enemyStructures.hasEntities() && !gameState.getAlliedVictory())
		{
			enemyStructures = gameState.getAllyStructures().filter(
				filters.not(filters.byOwner(PlayerID))).filter(
				filters.byClasses(["CivCentre", "Fortress", "Tower"]));
		}
		if (!enemyStructures.hasEntities())
			return undefined;
	}
	enemyStructures = enemyStructures.toEntityArray();

	let wonderMode = gameState.getVictoryConditions().has("wonder");
	let wonderDistmin;
	let wonders;
	if (wonderMode)
	{
		wonders = gameState.getOwnStructures().filter(filters.byClass("Wonder")).toEntityArray();
		wonderMode = wonders.length != 0;
		if (wonderMode)
			wonderDistmin = (50 + wonders[0].footprintRadius()) * (50 + wonders[0].footprintRadius());
	}

	// obstruction map
	const obstructions = createObstructionMap(gameState, 0, template);
	let halfSize = 0;
	if (template.get("Footprint/Square"))
		halfSize = Math.max(+template.get("Footprint/Square/@depth"), +template.get("Footprint/Square/@width")) / 2;
	else if (template.get("Footprint/Circle"))
		halfSize = +template.get("Footprint/Circle/@radius");

	let bestIdx;
	let bestJdx;
	let bestVal;
	const width = this.territoryMap.width;
	const cellSize = this.territoryMap.cellSize;

	const isTower = template.hasClass("Tower");
	const isFortress = template.hasClass("Fortress");
	let radius;
	if (isFortress)
		radius = Math.floor((template.obstructionRadius().max + 8) / obstructions.cellSize);
	else
		radius = Math.ceil(template.obstructionRadius().max / obstructions.cellSize);

	for (let j = 0; j < this.territoryMap.length; ++j)
	{
		if (!wonderMode)
		{
			// do not try if well inside or outside territory
			if (!(this.borderMap.map[j] & mapMask.fullFrontier))
				continue;
			if (this.borderMap.map[j] & mapMask.largeFrontier && isTower)
				continue;
		}
		if (this.baseAtIndex(j) == 0)   // inaccessible cell
			continue;
		// with enough room around to build the cc
		const i = this.territoryMap.getNonObstructedTile(j, radius, obstructions);
		if (i < 0)
			continue;

		const pos = [cellSize * (j%width+0.5), cellSize * (Math.floor(j/width)+0.5)];
		// checking distances to other structures
		let minDist = Math.min();

		let dista = 0;
		if (wonderMode)
		{
			dista = SquareVectorDistance(wonders[0].position(), pos);
			if (dista < wonderDistmin)
				continue;
			dista *= 200;   // empirical factor (TODO should depend on map size) to stay near the wonder
		}

		for (const str of enemyStructures)
		{
			if (str.foundationProgress() !== undefined)
				continue;
			const strPos = str.position();
			if (!strPos)
				continue;
			const dist = SquareVectorDistance(strPos, pos);
			if (dist < 6400) // TODO check on true attack range instead of this 80×80
			{
				minDist = -1;
				break;
			}
			if (str.hasClass("CivCentre") && dist + dista < minDist)
				minDist = dist + dista;
		}
		if (minDist < 0)
			continue;

		const cutDist = 900;  // 30×30 TODO maybe increase it
		for (const str of ownStructures)
		{
			const strPos = str.position();
			if (!strPos)
				continue;
			if (SquareVectorDistance(strPos, pos) < cutDist)
			{
				minDist = -1;
				break;
			}
		}
		if (minDist < 0 || minDist == Math.min())
			continue;
		if (bestVal !== undefined && minDist > bestVal)
			continue;
		if (this.isDangerousLocation(gameState, pos, halfSize))
			continue;
		bestVal = minDist;
		bestIdx = i;
		bestJdx = j;
	}

	if (bestVal === undefined)
		return undefined;

	const x = (bestIdx % obstructions.width + 0.5) * obstructions.cellSize;
	const z = (Math.floor(bestIdx / obstructions.width) + 0.5) * obstructions.cellSize;
	return [x, z, this.baseAtIndex(bestJdx)];
};

Headquarters.prototype.buildTemple = function(gameState, queues)
{
	// at least one market (which have the same queue) should be build before any temple
	if (queues.economicBuilding.hasQueuedUnits() ||
		gameState.getOwnEntitiesByClass("Temple", true).hasEntities() ||
		!gameState.getOwnEntitiesByClass("Market", true).hasEntities())
		return;
	// Try to build a temple earlier if in regicide to recruit healer guards
	if (this.currentPhase < 3 && !gameState.getVictoryConditions().has("regicide"))
		return;

	let templateName = "structures/{civ}/temple";
	if (this.canBuild(gameState, "structures/{civ}/temple_vesta"))
		templateName = "structures/{civ}/temple_vesta";
	else if (!this.canBuild(gameState, templateName))
		return;
	queues.economicBuilding.addPlan(new ConstructionPlan(gameState, templateName));
};

Headquarters.prototype.buildMarket = function(gameState, queues)
{
	if (gameState.getOwnEntitiesByClass("Market", true).hasEntities() ||
		!this.canBuild(gameState, "structures/{civ}/market"))
		return;

	if (queues.economicBuilding.hasQueuedUnitsWithClass("Market"))
	{
		if (!queues.economicBuilding.paused)
		{
			// Put available resources in this market
			const queueManager = gameState.ai.queueManager;
			const cost = queues.economicBuilding.plans[0].getCost();
			queueManager.setAccounts(gameState, cost, "economicBuilding");
			if (!queueManager.canAfford("economicBuilding", cost))
			{
				for (const q in queueManager.queues)
				{
					if (q == "economicBuilding")
						continue;
					queueManager.transferAccounts(cost, q, "economicBuilding");
					if (queueManager.canAfford("economicBuilding", cost))
						break;
				}
			}
		}
		return;
	}

	gameState.ai.queueManager.changePriority("economicBuilding", 3 * this.Config.priorities.economicBuilding);
	const plan = new ConstructionPlan(gameState, "structures/{civ}/market");
	plan.queueToReset = "economicBuilding";
	queues.economicBuilding.addPlan(plan);
};

/** Build a Granary */
Headquarters.prototype.buildGranary = function(gameState, queues)
{
	// Only build one granary for the time being ("DropsiteFood" does not refer to CCs)
	if (gameState.getOwnEntitiesByClass("Granary", true).hasEntities())
		return;
	// Wait to have at least one dropsite and house before the Granary
	if (!gameState.getOwnEntitiesByClass("Storehouse", true).hasEntities())
		return;
	if (!gameState.getOwnEntitiesByClass("House", true).hasEntities())
		return;
	if (queues.economicBuilding.hasQueuedUnitsWithClass("DropsiteFood"))
		return;
	if (!this.canBuild(gameState, "structures/{civ}/granary"))
		return;

	queues.economicBuilding.addPlan(new ConstructionPlan(gameState, "structures/{civ}/granary"));
};

/**
 * Try to build a wonder when required
 * force = true when called from the victoryManager in case of Wonder victory condition.
 */
Headquarters.prototype.buildWonder = function(gameState, queues, force = false)
{
	if (queues.wonder && queues.wonder.hasQueuedUnits() ||
	    gameState.getOwnEntitiesByClass("Wonder", true).hasEntities() ||
	    !this.canBuild(gameState, "structures/{civ}/wonder"))
		return;

	if (!force)
	{
		const template = gameState.getTemplate(gameState.applyCiv("structures/{civ}/wonder"));
		// Check that we have enough resources to start thinking to build a wonder
		const cost = template.cost();
		const resources = gameState.getResources();
		let highLevel = 0;
		let lowLevel = 0;
		for (const res in cost)
		{
			if (resources[res] && resources[res] > 0.7 * cost[res])
				++highLevel;
			else if (!resources[res] || resources[res] < 0.3 * cost[res])
				++lowLevel;
		}
		if (highLevel == 0 || lowLevel > 1)
			return;
	}

	queues.wonder.addPlan(new ConstructionPlan(gameState, "structures/{civ}/wonder"));
};

/** Build a corral, and train animals there */
Headquarters.prototype.manageCorral = function(gameState, queues)
{
	if (queues.corral.hasQueuedUnits())
		return;

	const nCorral = gameState.getOwnEntitiesByClass("Corral", true).length;
	if (!nCorral || !gameState.isTemplateAvailable(gameState.applyCiv("structures/{civ}/field")) &&
	                nCorral < this.currentPhase && gameState.getPopulation() > 30 * nCorral)
	{
		if (this.canBuild(gameState, "structures/{civ}/corral"))
		{
			queues.corral.addPlan(new ConstructionPlan(gameState, "structures/{civ}/corral"));
			return;
		}
		if (!nCorral)
			return;
	}

	// And train some animals
	const civ = gameState.getPlayerCiv();
	for (const corral of gameState.getOwnEntitiesByClass("Corral", true).values())
	{
		if (corral.foundationProgress() !== undefined)
			continue;
		const trainables = corral.trainableEntities(civ);
		for (const trainable of trainables)
		{
			if (gameState.isTemplateDisabled(trainable))
				continue;
			const template = gameState.getTemplate(trainable);
			if (!template || !template.isHuntable())
				continue;
			let count = gameState.countEntitiesByType(trainable, true);
			for (const item of corral.trainingQueue())
				count += item.count;
			if (count > nCorral)
				continue;
			queues.corral.addPlan(new TrainingPlan(gameState, trainable, { "trainer": corral.id() }));
			return;
		}
	}
};

/**
 * build more houses if needed.
 * kinda ugly, lots of special cases to both build enough houses but not tooo many…
 */
Headquarters.prototype.buildMoreHouses = function(gameState, queues)
{
	let houseTemplateString = "structures/{civ}/apartment";
	if (!gameState.isTemplateAvailable(gameState.applyCiv(houseTemplateString)) ||
		!this.canBuild(gameState, houseTemplateString))
	{
		houseTemplateString = "structures/{civ}/house";
		if (!gameState.isTemplateAvailable(gameState.applyCiv(houseTemplateString)))
			return;
	}
	if (gameState.getPopulationMax() <= gameState.getPopulationLimit())
		return;

	const numPlanned = queues.house.length();
	if (numPlanned < 3 || numPlanned < 5 && gameState.getPopulation() > 80)
	{
		const plan = new ConstructionPlan(gameState, houseTemplateString);
		// change the starting condition according to the situation.
		plan.goRequirement = "houseNeeded";
		queues.house.addPlan(plan);
	}

	if (numPlanned > 0 && this.phasing && gameState.getPhaseEntityRequirements(this.phasing).length)
	{
		const houseTemplateName = gameState.applyCiv(houseTemplateString);
		const houseTemplate = gameState.getTemplate(houseTemplateName);

		let needed = 0;
		for (const entityReq of gameState.getPhaseEntityRequirements(this.phasing))
		{
			if (!houseTemplate.hasClass(entityReq.class))
				continue;

			const count = gameState.getOwnStructures().filter(filters.byClass(entityReq.class))
				.length;
			if (count < entityReq.count && this.buildManager.isUnbuildable(gameState, houseTemplateName))
			{
				if (this.Config.debug > 1)
					aiWarn("no room to place a house ... try to be less restrictive");
				this.buildManager.setBuildable(houseTemplateName);
				this.requireHouses = true;
			}
			needed = Math.max(needed, entityReq.count - count);
		}

		const houseQueue = queues.house.plans;
		for (let i = 0; i < numPlanned; ++i)
			if (houseQueue[i].isGo(gameState))
				--needed;
			else if (needed > 0)
			{
				houseQueue[i].goRequirement = undefined;
				--needed;
			}
	}

	if (this.requireHouses)
	{
		const houseTemplate = gameState.getTemplate(gameState.applyCiv(houseTemplateString));
		if (!this.phasing || gameState.getPhaseEntityRequirements(this.phasing).every(req =>
			!houseTemplate.hasClass(req.class) ||
			gameState.getOwnStructures().filter(filters.byClass(req.class)).length >= req.count))
		{
			this.requireHouses = undefined;
		}
	}

	// When population limit too tight
	//    - if no room to build, try to improve with technology
	//    - otherwise increase temporarily the priority of houses
	const house = gameState.applyCiv(houseTemplateString);
	const HouseNb = gameState.getOwnFoundations().filter(filters.byClass("House")).length;
	const popBonus = gameState.getTemplate(house).getPopulationBonus();
	const freeSlots = gameState.getPopulationLimit() + HouseNb*popBonus - this.getAccountedPopulation(gameState);
	let priority;
	if (freeSlots < 5)
	{
		if (this.buildManager.isUnbuildable(gameState, house))
		{
			if (this.Config.debug > 1)
				aiWarn("no room to place a house ... try to improve with technology");
			this.researchManager.researchPopulationBonus(gameState, queues);
		}
		else
			priority = 2 * this.Config.priorities.house;
	}
	else
		priority = this.Config.priorities.house;

	if (priority && priority != gameState.ai.queueManager.getPriority("house"))
		gameState.ai.queueManager.changePriority("house", priority);
};

/** Checks the status of the territory expansion. If no new economic bases created, build some strategic ones. */
Headquarters.prototype.checkBaseExpansion = function(gameState, queues)
{
	if (queues.civilCentre.hasQueuedUnits())
		return;
	// First build one cc if all have been destroyed
	if (!this.hasPotentialBase())
	{
		this.buildFirstBase(gameState);
		return;
	}
	// Then expand if we have not enough room available for buildings
	if (this.buildManager.numberMissingRoom(gameState) > 1)
	{
		if (this.Config.debug > 2)
			aiWarn("try to build a new base because not enough room to build ");
		this.buildNewBase(gameState, queues);
		return;
	}
	// If we've already planned to phase up, wait a bit before trying to expand
	if (this.phasing)
		return;
	// Finally expand if we have lots of units (threshold depending on the aggressivity value)
	const activeBases = this.numActiveBases();
	const numUnits = gameState.getOwnUnits().length;
	const numvar = 10 * (1 - this.Config.personality.aggressive);
	if (numUnits > activeBases * (65 + numvar + (10 + numvar)*(activeBases-1)) || this.saveResources && numUnits > 50)
	{
		if (this.Config.debug > 2)
		{
			aiWarn("try to build a new base because of population " + numUnits + " for " +
				activeBases + " CCs");
		}
		this.buildNewBase(gameState, queues);
	}
};

Headquarters.prototype.buildNewBase = function(gameState, queues, resource)
{
	if (this.hasPotentialBase() && this.currentPhase == 1 && !gameState.isResearching(gameState.getPhaseName(2)))
		return false;
	if (gameState.getOwnFoundations().filter(filters.byClass("CivCentre")).hasEntities() || queues.civilCentre.hasQueuedUnits())
		return false;

	let template;
	// We require at least one of this civ civCentre as they may allow specific units or techs
	let hasOwnCC = false;
	for (const ent of gameState.updatingGlobalCollection("allCCs", filters.byClass("CivCentre")).values())
	{
		if (ent.owner() != PlayerID || ent.templateName() != gameState.applyCiv("structures/{civ}/civil_centre"))
			continue;
		hasOwnCC = true;
		break;
	}
	if (hasOwnCC && this.canBuild(gameState, "structures/{civ}/military_colony"))
		template = "structures/{civ}/military_colony";
	else if (this.canBuild(gameState, "structures/{civ}/civil_centre"))
		template = "structures/{civ}/civil_centre";
	else if (!hasOwnCC && this.canBuild(gameState, "structures/{civ}/military_colony"))
		template = "structures/{civ}/military_colony";
	else
		return false;

	// base "-1" means new base.
	if (this.Config.debug > 1)
		aiWarn("new base " + gameState.applyCiv(template) + " planned with resource " + resource);
	queues.civilCentre.addPlan(new ConstructionPlan(gameState, template, { "base": -1, "resource": resource }));
	return true;
};

/** Deals with building fortresses and towers along our border with enemies. */
Headquarters.prototype.buildDefenses = function(gameState, queues)
{
	if (this.saveResources && !this.canBarter || queues.defenseBuilding.hasQueuedUnits())
		return;

	if (!this.saveResources && (this.currentPhase > 2 || gameState.isResearching(gameState.getPhaseName(3))))
	{
		// Try to build fortresses.
		if (this.canBuild(gameState, "structures/{civ}/fortress"))
		{
			const numFortresses = gameState.getOwnEntitiesByClass("Fortress", true).length;
			if ((!numFortresses || gameState.ai.elapsedTime > (1 + 0.10 * numFortresses) * this.fortressLapseTime + this.fortressStartTime) &&
				numFortresses < this.numActiveBases() + 1 + this.extraFortresses &&
				numFortresses < Math.floor(gameState.getPopulation() / 25) &&
				gameState.getOwnFoundationsByClass("Fortress").length < 2)
			{
				this.fortressStartTime = gameState.ai.elapsedTime;
				if (!numFortresses)
					gameState.ai.queueManager.changePriority("defenseBuilding", 2 * this.Config.priorities.defenseBuilding);
				const plan = new ConstructionPlan(gameState, "structures/{civ}/fortress");
				plan.queueToReset = "defenseBuilding";
				queues.defenseBuilding.addPlan(plan);
				return;
			}
		}
	}

	if (this.Config.Military.numSentryTowers && this.currentPhase < 2 && this.canBuild(gameState, "structures/{civ}/sentry_tower"))
	{
		// Count all towers + wall towers.
		const numTowers = gameState.getOwnEntitiesByClass("Tower", true).length + gameState.getOwnEntitiesByClass("WallTower", true).length;
		const towerLapseTime = this.saveResources ? (1 + 0.5 * numTowers) * this.towerLapseTime : this.towerLapseTime;
		if (numTowers < this.Config.Military.numSentryTowers && gameState.ai.elapsedTime > towerLapseTime + this.fortStartTime)
		{
			this.fortStartTime = gameState.ai.elapsedTime;
			queues.defenseBuilding.addPlan(new ConstructionPlan(gameState, "structures/{civ}/sentry_tower"));
		}
		return;
	}

	if (this.currentPhase < 2 || !this.canBuild(gameState, "structures/{civ}/defense_tower"))
		return;

	const numTowers = gameState.getOwnEntitiesByClass("StoneTower", true).length;
	const towerLapseTime = this.saveResources ? (1 + numTowers) * this.towerLapseTime : this.towerLapseTime;
	if ((!numTowers || gameState.ai.elapsedTime > (1 + 0.1 * numTowers) * towerLapseTime + this.towerStartTime) &&
		numTowers < 2 * this.numActiveBases() + 3 + this.extraTowers &&
		numTowers < Math.floor(gameState.getPopulation() / 8) &&
		gameState.getOwnFoundationsByClass("Tower").length < 3)
	{
		this.towerStartTime = gameState.ai.elapsedTime;
		if (numTowers > 2 * this.numActiveBases() + 3)
			gameState.ai.queueManager.changePriority("defenseBuilding", Math.round(0.7 * this.Config.priorities.defenseBuilding));
		const plan = new ConstructionPlan(gameState, "structures/{civ}/defense_tower");
		plan.queueToReset = "defenseBuilding";
		queues.defenseBuilding.addPlan(plan);
	}
};

Headquarters.prototype.buildForge = function(gameState, queues)
{
	if (this.getAccountedPopulation(gameState) < this.Config.Military.popForForge ||
		queues.militaryBuilding.hasQueuedUnits() || gameState.getOwnEntitiesByClass("Forge", true).length)
		return;
	// Build a Market before the Forge.
	if (!gameState.getOwnEntitiesByClass("Market", true).hasEntities())
		return;

	if (this.canBuild(gameState, "structures/{civ}/forge"))
		queues.militaryBuilding.addPlan(new ConstructionPlan(gameState, "structures/{civ}/forge"));
};

/**
 * Deals with constructing military buildings (e.g. barracks, stable).
 * They are mostly defined by Config.js. This is unreliable since changes could be done easily.
 */
Headquarters.prototype.constructTrainingBuildings = function(gameState, queues)
{
	if (this.saveResources && !this.canBarter || queues.militaryBuilding.hasQueuedUnits())
		return;

	const numBarracks = gameState.getOwnEntitiesByClass("Barracks", true).length;
	if (this.saveResources && numBarracks != 0)
		return;

	const barracksTemplate = this.canBuild(gameState, "structures/{civ}/barracks") ? "structures/{civ}/barracks" : undefined;

	const rangeTemplate = this.canBuild(gameState, "structures/{civ}/range") ? "structures/{civ}/range" : undefined;
	const numRanges = gameState.getOwnEntitiesByClass("Range", true).length;

	const stableTemplate = this.canBuild(gameState, "structures/{civ}/stable") ? "structures/{civ}/stable" : undefined;
	const numStables = gameState.getOwnEntitiesByClass("Stable", true).length;

	if (this.getAccountedPopulation(gameState) > this.Config.Military.popForBarracks1 ||
	    this.phasing == 2 && gameState.getOwnStructures().filter(filters.byClass("Village")).length < 5)
	{
		// First barracks/range and stable.
		if (numBarracks + numRanges == 0)
		{
			const template = barracksTemplate || rangeTemplate;
			if (template)
			{
				gameState.ai.queueManager.changePriority("militaryBuilding", 2 * this.Config.priorities.militaryBuilding);
				const plan = new ConstructionPlan(gameState, template, { "militaryBase": true });
				plan.queueToReset = "militaryBuilding";
				queues.militaryBuilding.addPlan(plan);
				return;
			}
		}
		if (numStables == 0 && stableTemplate)
		{
			queues.militaryBuilding.addPlan(new ConstructionPlan(gameState, stableTemplate, { "militaryBase": true }));
			return;
		}

		// Second barracks/range and stable.
		if (numBarracks + numRanges == 1 && this.getAccountedPopulation(gameState) > this.Config.Military.popForBarracks2)
		{
			const template = numBarracks == 0 ? (barracksTemplate || rangeTemplate) : (rangeTemplate || barracksTemplate);
			if (template)
			{
				queues.militaryBuilding.addPlan(new ConstructionPlan(gameState, template, { "militaryBase": true }));
				return;
			}
		}
		if (numStables == 1 && stableTemplate && this.getAccountedPopulation(gameState) > this.Config.Military.popForBarracks2)
		{
			queues.militaryBuilding.addPlan(new ConstructionPlan(gameState, stableTemplate, { "militaryBase": true }));
			return;
		}

		// Third barracks/range and stable, if needed.
		if (numBarracks + numRanges + numStables == 2 && this.getAccountedPopulation(gameState) > this.Config.Military.popForBarracks2 + 30)
		{
			const template = barracksTemplate || stableTemplate || rangeTemplate;
			if (template)
			{
				queues.militaryBuilding.addPlan(new ConstructionPlan(gameState, template, { "militaryBase": true }));
				return;
			}
		}
	}

	if (this.saveResources)
		return;

	if (this.currentPhase < 3)
		return;

	if (this.canBuild(gameState, "structures/{civ}/elephant_stable") && !gameState.getOwnEntitiesByClass("ElephantStable", true).hasEntities())
	{
		queues.militaryBuilding.addPlan(new ConstructionPlan(gameState, "structures/{civ}/elephant_stable", { "militaryBase": true }));
		return;
	}

	if (this.canBuild(gameState, "structures/{civ}/arsenal") && !gameState.getOwnEntitiesByClass("Arsenal", true).hasEntities())
	{
		queues.militaryBuilding.addPlan(new ConstructionPlan(gameState, "structures/{civ}/arsenal", { "militaryBase": true }));
		return;
	}

	if (this.getAccountedPopulation(gameState) < 80 || !this.bAdvanced.length)
		return;

	// Build advanced military buildings
	let nAdvanced = 0;
	for (const advanced of this.bAdvanced)
		nAdvanced += gameState.countEntitiesAndQueuedByType(advanced, true);

	if (!nAdvanced || nAdvanced < this.bAdvanced.length && this.getAccountedPopulation(gameState) > 110)
	{
		for (const advanced of this.bAdvanced)
		{
			if (gameState.countEntitiesAndQueuedByType(advanced, true) > 0 || !this.canBuild(gameState, advanced))
				continue;
			const template = gameState.getTemplate(advanced);
			if (!template)
				continue;
			const civ = gameState.getPlayerCiv();
			if (template.hasDefensiveFire() || template.trainableEntities(civ))
				queues.militaryBuilding.addPlan(new ConstructionPlan(gameState, advanced, { "militaryBase": true }));
			else	// not a military building, but still use this queue
				queues.militaryBuilding.addPlan(new ConstructionPlan(gameState, advanced));
			return;
		}
	}
};

/**
 *  Find base nearest to ennemies for military buildings.
 */
Headquarters.prototype.findBestBaseForMilitary = function(gameState)
{
	const ccEnts = gameState.updatingGlobalCollection("allCCs", filters.byClass("CivCentre")).toEntityArray();
	let bestBase;
	let enemyFound = false;
	let distMin = Math.min();
	for (const cce of ccEnts)
	{
		if (gameState.isPlayerAlly(cce.owner()))
			continue;
		if (enemyFound && !gameState.isPlayerEnemy(cce.owner()))
			continue;
		const access = getLandAccess(gameState, cce);
		const isEnemy = gameState.isPlayerEnemy(cce.owner());
		for (const cc of ccEnts)
		{
			if (cc.owner() != PlayerID)
				continue;
			if (getLandAccess(gameState, cc) != access)
				continue;
			const dist = SquareVectorDistance(cc.position(), cce.position());
			if (!enemyFound && isEnemy)
				enemyFound = true;
			else if (dist > distMin)
				continue;
			bestBase = cc.getMetadata(PlayerID, "base");
			distMin = dist;
		}
	}
	return bestBase;
};

/**
 * train with highest priority ranged infantry in the nearest civil center from a given set of positions
 * and garrison them there for defense
 */
Headquarters.prototype.trainEmergencyUnits = function(gameState, positions)
{
	if (gameState.ai.queues.emergency.hasQueuedUnits())
		return false;

	const civ = gameState.getPlayerCiv();
	// find nearest base anchor
	const distcut = 20000;
	let nearestAnchor;
	let distmin;
	for (const pos of positions)
	{
		const access = gameState.ai.accessibility.getAccessValue(pos);
		// check nearest base anchor
		for (const base of this.baseManagers())
		{
			if (!base.anchor || !base.anchor.position())
				continue;
			if (getLandAccess(gameState, base.anchor) != access)
				continue;
			if (!base.anchor.trainableEntities(civ))	// base still in construction
				continue;
			const queue = base.anchor._entity.trainingQueue;
			if (queue)
			{
				let time = 0;
				for (const item of queue)
					if (item.progress > 0 || item.metadata && item.metadata.garrisonType)
						time += item.timeRemaining;
				if (time/1000 > 5)
					continue;
			}
			const dist = SquareVectorDistance(base.anchor.position(), pos);
			if (nearestAnchor && dist > distmin)
				continue;
			distmin = dist;
			nearestAnchor = base.anchor;
		}
	}
	if (!nearestAnchor || distmin > distcut)
		return false;

	// We will choose randomly ranged and melee units, except when garrisonHolder is full
	// in which case we prefer melee units
	let numGarrisoned = this.garrisonManager.numberOfGarrisonedSlots(nearestAnchor);
	if (nearestAnchor._entity.trainingQueue)
	{
		for (const item of nearestAnchor._entity.trainingQueue)
		{
			if (item.metadata && item.metadata.garrisonType)
				numGarrisoned += item.count;
			else if (!item.progress && (!item.metadata || !item.metadata.trainer))
				nearestAnchor.stopProduction(item.id);
		}
	}
	const autogarrison = numGarrisoned < nearestAnchor.garrisonMax() &&
	                   nearestAnchor.hitpoints() > nearestAnchor.garrisonEjectHealth() * nearestAnchor.maxHitpoints();
	const rangedWanted = randBool() && autogarrison;

	const total = gameState.getResources();
	let templateFound;
	const trainables = nearestAnchor.trainableEntities(civ);
	const garrisonArrowClasses = nearestAnchor.getGarrisonArrowClasses();
	for (const trainable of trainables)
	{
		if (gameState.isTemplateDisabled(trainable))
			continue;
		const template = gameState.getTemplate(trainable);
		if (!template || !template.hasClasses(["Infantry+CitizenSoldier"]))
			continue;
		if (autogarrison && !template.hasClasses(garrisonArrowClasses))
			continue;
		if (!total.canAfford(new ResourcesManager(template.cost())))
			continue;
		templateFound = [trainable, template];
		if (template.hasClass("Ranged") == rangedWanted)
			break;
	}
	if (!templateFound)
		return false;

	// Check first if we can afford it without touching the other accounts
	// and if not, take some of other accounted resources
	// TODO sort the queues to be substracted
	const queueManager = gameState.ai.queueManager;
	const cost = new ResourcesManager(templateFound[1].cost());
	queueManager.setAccounts(gameState, cost, "emergency");
	if (!queueManager.canAfford("emergency", cost))
	{
		for (const q in queueManager.queues)
		{
			if (q == "emergency")
				continue;
			queueManager.transferAccounts(cost, q, "emergency");
			if (queueManager.canAfford("emergency", cost))
				break;
		}
	}
	const metadata = { "role": Worker.ROLE_WORKER, "base": nearestAnchor.getMetadata(PlayerID, "base"), "plan": -1, "trainer": nearestAnchor.id() };
	if (autogarrison)
		metadata.garrisonType = GarrisonManager.TYPE_PROTECTION;
	gameState.ai.queues.emergency.addPlan(new TrainingPlan(gameState, templateFound[0], metadata, 1, 1));
	return true;
};

Headquarters.prototype.canBuild = function(gameState, structure)
{
	const type = gameState.applyCiv(structure);
	if (this.buildManager.isUnbuildable(gameState, type))
		return false;

	if (gameState.isTemplateDisabled(type))
	{
		this.buildManager.setUnbuildable(gameState, type, Infinity, "disabled");
		return false;
	}

	const template = gameState.getTemplate(type);
	if (!template)
	{
		this.buildManager.setUnbuildable(gameState, type, Infinity, "notemplate");
		return false;
	}

	if (!template.available(gameState))
	{
		this.buildManager.setUnbuildable(gameState, type, 30, "requirements");
		return false;
	}

	if (!this.buildManager.hasBuilder(type))
	{
		this.buildManager.setUnbuildable(gameState, type, 120, "nobuilder");
		return false;
	}

	if (!this.hasActiveBase())
	{
		// if no base, check that we can build outside our territory
		const buildTerritories = template.buildTerritories();
		if (buildTerritories && (!buildTerritories.length || buildTerritories.length == 1 && buildTerritories[0] == "own"))
		{
			this.buildManager.setUnbuildable(gameState, type, 180, "room");
			return false;
		}
	}

	// build limits
	const limits = gameState.getEntityLimits();
	const category = template.buildCategory();
	if (category && limits[category] !== undefined && gameState.getEntityCounts()[category] >= limits[category])
	{
		this.buildManager.setUnbuildable(gameState, type, 90, "limit");
		return false;
	}

	return true;
};

Headquarters.prototype.updateTerritories = function(gameState)
{
	const around = [ [-0.7, 0.7], [0, 1], [0.7, 0.7], [1, 0], [0.7, -0.7], [0, -1], [-0.7, -0.7], [-1, 0] ];
	const alliedVictory = gameState.getAlliedVictory();
	const passabilityMap = gameState.getPassabilityMap();
	const width = this.territoryMap.width;
	const cellSize = this.territoryMap.cellSize;
	const insideSmall = Math.round(45 / cellSize);
	const insideLarge = Math.round(80 / cellSize);	// should be about the range of towers
	let expansion = 0;

	for (let j = 0; j < this.territoryMap.length; ++j)
	{
		if (this.borderMap.map[j] & mapMask.outside)
			continue;
		if (this.borderMap.map[j] & mapMask.fullFrontier)
			this.borderMap.map[j] &= ~mapMask.fullFrontier;	// reset the frontier

		if (this.territoryMap.getOwnerIndex(j) != PlayerID)
			this.basesManager.removeBaseFromTerritoryIndex(j);
		else
		{
			// Update the frontier
			const ix = j%width;
			const iz = Math.floor(j/width);
			let onFrontier = false;
			for (const a of around)
			{
				let jx = ix + Math.round(insideSmall*a[0]);
				if (jx < 0 || jx >= width)
					continue;
				let jz = iz + Math.round(insideSmall*a[1]);
				if (jz < 0 || jz >= width)
					continue;
				if (this.borderMap.map[jx+width*jz] & mapMask.outside)
					continue;
				let territoryOwner = this.territoryMap.getOwnerIndex(jx+width*jz);
				if (territoryOwner != PlayerID && !(alliedVictory && gameState.isPlayerAlly(territoryOwner)))
				{
					this.borderMap.map[j] |= mapMask.narrowFrontier;
					break;
				}
				jx = ix + Math.round(insideLarge*a[0]);
				if (jx < 0 || jx >= width)
					continue;
				jz = iz + Math.round(insideLarge*a[1]);
				if (jz < 0 || jz >= width)
					continue;
				if (this.borderMap.map[jx+width*jz] & mapMask.outside)
					continue;
				territoryOwner = this.territoryMap.getOwnerIndex(jx+width*jz);
				if (territoryOwner != PlayerID && !(alliedVictory && gameState.isPlayerAlly(territoryOwner)))
					onFrontier = true;
			}
			if (onFrontier && !(this.borderMap.map[j] & mapMask.narrowFrontier))
				this.borderMap.map[j] |= mapMask.largeFrontier;

			if (this.basesManager.addTerritoryIndexToBase(gameState, j, passabilityMap))
				expansion++;
		}
	}

	if (!expansion)
		return;
	// We've increased our territory, so we may have some new room to build
	this.buildManager.resetMissingRoom(gameState);
	// And if sufficient expansion, check if building a new market would improve our present trade routes
	const cellArea = this.territoryMap.cellSize * this.territoryMap.cellSize;
	if (expansion * cellArea > 960)
		this.tradeManager.routeProspection = true;
};

/**
 * returns the base corresponding to baseID
 */
Headquarters.prototype.getBaseByID = function(baseID)
{
	return this.basesManager.getBaseByID(baseID);
};

/**
 * returns the number of bases with a cc
 * ActiveBases includes only those with a built cc
 * PotentialBases includes also those with a cc in construction
 */
Headquarters.prototype.numActiveBases = function()
{
	return this.basesManager.numActiveBases();
};

Headquarters.prototype.hasActiveBase = function()
{
	return this.basesManager.hasActiveBase();
};

Headquarters.prototype.numPotentialBases = function()
{
	return this.basesManager.numPotentialBases();
};

Headquarters.prototype.hasPotentialBase = function()
{
	return this.basesManager.hasPotentialBase();
};

Headquarters.prototype.isDangerousLocation = function(gameState, pos, radius)
{
	return this.isNearInvadingArmy(pos) || this.isUnderEnemyFire(gameState, pos, radius);
};

/** Check that the chosen position is not too near from an invading army */
Headquarters.prototype.isNearInvadingArmy = function(pos)
{
	for (const army of this.defenseManager.armies)
		if (army.foePosition && SquareVectorDistance(army.foePosition, pos) < 12000)
			return true;
	return false;
};

Headquarters.prototype.isUnderEnemyFire = function(gameState, pos, radius = 0)
{
	if (!this.turnCache.firingStructures)
	{
		this.turnCache.firingStructures = gameState.updatingCollection("diplo-FiringStructures",
			filters.hasDefensiveFire(), gameState.getEnemyStructures());
	}
	for (const ent of this.turnCache.firingStructures.values())
	{
		const range = radius + ent.attackRange("Ranged").max;
		if (SquareVectorDistance(ent.position(), pos) < range*range)
			return true;
	}
	return false;
};

/** Compute the capture strength of all units attacking a capturable target */
Headquarters.prototype.updateCaptureStrength = function(gameState)
{
	this.capturableTargets.clear();
	for (const ent of gameState.getOwnUnits().values())
	{
		if (!ent.canCapture())
			continue;
		const state = ent.unitAIState();
		if (!state || !state.split(".")[1] || state.split(".")[1] != "COMBAT")
			continue;
		const orderData = ent.unitAIOrderData();
		if (!orderData || !orderData.length || !orderData[0].target)
			continue;
		const targetId = orderData[0].target;
		const target = gameState.getEntityById(targetId);
		if (!target || !target.isCapturable() || !ent.canCapture(target))
			continue;
		if (!this.capturableTargets.has(targetId))
			this.capturableTargets.set(targetId, {
				"strength": ent.captureStrength() * getAttackBonus(ent, target, "Capture"),
				"ents": new Set([ent.id()])
			});
		else
		{
			const capturableTarget = this.capturableTargets.get(target.id());
			capturableTarget.strength += ent.captureStrength() * getAttackBonus(ent, target, "Capture");
			capturableTarget.ents.add(ent.id());
		}
	}

	for (const [targetId, capturableTarget] of this.capturableTargets)
	{
		const target = gameState.getEntityById(targetId);
		let shouldCapture;
		for (const entId of capturableTarget.ents)
		{
			const ent = gameState.getEntityById(entId);
			if (shouldCapture === undefined)
				shouldCapture = allowCapture(gameState, ent, target);
			const orderData = ent.unitAIOrderData();
			if (!orderData || !orderData.length || !orderData[0].attackType)
				continue;
			if ((orderData[0].attackType == "Capture") !== shouldCapture)
				ent.attack(targetId, shouldCapture);
		}
	}

	this.capturableTargetsTime = gameState.ai.elapsedTime;
};

/**
 * Check if a structure in blinking territory should/can be defended (currently if it has some attacking armies around)
 */
Headquarters.prototype.isDefendable = function(ent)
{
	if (!this.turnCache.numAround)
		this.turnCache.numAround = {};
	if (this.turnCache.numAround[ent.id()] === undefined)
		this.turnCache.numAround[ent.id()] = this.attackManager.numAttackingUnitsAround(ent.position(), 130);
	return +this.turnCache.numAround[ent.id()] > 8;
};

/**
 * Get the number of population already accounted for
 */
Headquarters.prototype.getAccountedPopulation = function(gameState)
{
	if (this.turnCache.accountedPopulation == undefined)
	{
		let pop = gameState.getPopulation();
		for (const ent of gameState.getOwnTrainingFacilities().values())
		{
			for (const item of ent.trainingQueue())
			{
				if (!item.unitTemplate)
					continue;
				const unitPop = gameState.getTemplate(item.unitTemplate).get("Cost/Population");
				if (unitPop)
					pop += item.count * unitPop;
			}
		}
		this.turnCache.accountedPopulation = pop;
	}
	return this.turnCache.accountedPopulation;
};

/**
 * Get the number of workers already accounted for
 */
Headquarters.prototype.getAccountedWorkers = function(gameState)
{
	if (this.turnCache.accountedWorkers == undefined)
	{
		let workers = gameState.getOwnEntitiesByRole(Worker.ROLE_WORKER, true).length;
		for (const ent of gameState.getOwnTrainingFacilities().values())
		{
			for (const item of ent.trainingQueue())
			{
				if (!item.metadata || !item.metadata.role || item.metadata.role !== Worker.ROLE_WORKER)
					continue;
				workers += item.count;
			}
		}
		this.turnCache.accountedWorkers = workers;
	}
	return this.turnCache.accountedWorkers;
};

Headquarters.prototype.baseManagers = function()
{
	return this.basesManager.baseManagers;
};

/**
 * @param {number} territoryIndex - The index to get the map for.
 * @return {number} - The ID of the base at the given territory index.
 */
Headquarters.prototype.baseAtIndex = function(territoryIndex)
{
	return this.basesManager.baseAtIndex(territoryIndex);
};

/**
 * Some functions are run every turn
 * Others once in a while
 */
Headquarters.prototype.update = function(gameState, queues, events)
{
	Engine.ProfileStart("Headquarters update");
	this.emergencyManager.update(gameState);
	this.turnCache = {};
	this.territoryMap = createTerritoryMap(gameState);
	this.canBarter = gameState.getOwnEntitiesByClass("Market", true).filter(filters.isBuilt())
		.hasEntities();
	// TODO find a better way to update
	if (this.currentPhase != gameState.currentPhase())
	{
		if (this.Config.debug > 0)
			aiWarn(" civ " + gameState.getPlayerCiv() + " has phasedUp from " + this.currentPhase +
				" to " + gameState.currentPhase() + " at time " + gameState.ai.elapsedTime +
				" phasing " + this.phasing);
		this.currentPhase = gameState.currentPhase();

		// In principle, this.phasing should be already reset to 0 when starting the research
		// but this does not work in case of an autoResearch tech
		if (this.phasing)
			this.phasing = 0;
	}

	/*
	if (this.Config.debug > 1)
	{
		gameState.getOwnUnits().forEach (function (ent) {
			if (!ent.position())
				return;
			dumpEntity(ent);
		});
	}
	*/

	this.checkEvents(gameState, events);
	this.navalManager.checkEvents(gameState, queues, events);

	if (this.phasing)
		this.checkPhaseRequirements(gameState, queues);
	else
		this.researchManager.checkPhase(gameState, queues);

	if (this.hasActiveBase())
	{
		if (gameState.ai.playedTurn % 4 == 0)
			this.trainMoreWorkers(gameState, queues);

		if (gameState.ai.playedTurn % 4 == 1)
			this.buildMoreHouses(gameState, queues);

		if ((!this.saveResources || this.canBarter) && gameState.ai.playedTurn % 4 == 2)
			this.buildGranary(gameState, queues);

		if (this.needCorral && gameState.ai.playedTurn % 4 == 3)
			this.manageCorral(gameState, queues);

		if (gameState.ai.playedTurn % 5 == 1)
			this.researchManager.update(gameState, queues);
	}

	if (!this.hasPotentialBase() ||
	    this.canExpand && gameState.ai.playedTurn % 10 == 7 && this.currentPhase > 1)
		this.checkBaseExpansion(gameState, queues);

	if (this.currentPhase > 1 && gameState.ai.playedTurn % 3 == 0)
	{
		if (!this.canBarter)
			this.buildMarket(gameState, queues);

		if (!this.saveResources)
		{
			this.buildForge(gameState, queues);
			this.buildTemple(gameState, queues);
		}

		if (gameState.ai.playedTurn % 30 == 0 &&
		    gameState.getPopulation() > 0.9 * gameState.getPopulationMax())
			this.buildWonder(gameState, queues, false);
	}

	this.tradeManager.update(gameState, events, queues);

	this.garrisonManager.update(gameState, events);
	this.defenseManager.update(gameState, events);

	if (gameState.ai.playedTurn % 3 == 0)
	{
		this.constructTrainingBuildings(gameState, queues);
		if (this.Config.difficulty > difficulty.SANDBOX)
			this.buildDefenses(gameState, queues);
	}

	this.basesManager.update(gameState, queues, events);

	this.navalManager.update(gameState, queues, events);

	if (this.Config.difficulty > difficulty.SANDBOX && (this.hasActiveBase() || !this.canBuildUnits))
		this.attackManager.update(gameState, queues, events);

	this.diplomacyManager.update(gameState, events);

	this.victoryManager.update(gameState, events, queues);

	// We update the capture strength at the end as it can change attack orders
	if (gameState.ai.elapsedTime - this.capturableTargetsTime > 3)
		this.updateCaptureStrength(gameState);

	Engine.ProfileStop();
};

Headquarters.prototype.Serialize = function()
{
	const properties = {
		"phasing": this.phasing,
		"lastFailedGather": this.lastFailedGather,
		"firstBaseConfig": this.firstBaseConfig,
		"supportRatio": this.supportRatio,
		"targetNumWorkers": this.targetNumWorkers,
		"fortStartTime": this.fortStartTime,
		"towerStartTime": this.towerStartTime,
		"fortressStartTime": this.fortressStartTime,
		"bAdvanced": this.bAdvanced,
		"saveResources": this.saveResources,
		"saveSpace": this.saveSpace,
		"needCorral": this.needCorral,
		"needFarm": this.needFarm,
		"needFish": this.needFish,
		"maxFields": this.maxFields,
		"canExpand": this.canExpand,
		"canBuildUnits": this.canBuildUnits,
		"navalMap": this.navalMap,
		"landRegions": this.landRegions,
		"navalRegions": this.navalRegions,
		"decayingStructures": this.decayingStructures,
		"capturableTargets": this.capturableTargets,
		"capturableTargetsTime": this.capturableTargetsTime
	};

	if (this.Config.debug == -100)
	{
		aiWarn(" HQ serialization ---------------------");
		aiWarn(" properties " + uneval(properties));
		aiWarn(" basesManager " + uneval(this.basesManager.Serialize()));
		aiWarn(" attackManager " + uneval(this.attackManager.Serialize()));
		aiWarn(" buildManager " + uneval(this.buildManager.Serialize()));
		aiWarn(" defenseManager " + uneval(this.defenseManager.Serialize()));
		aiWarn(" tradeManager " + uneval(this.tradeManager.Serialize()));
		aiWarn(" navalManager " + uneval(this.navalManager.Serialize()));
		aiWarn(" researchManager " + uneval(this.researchManager.Serialize()));
		aiWarn(" diplomacyManager " + uneval(this.diplomacyManager.Serialize()));
		aiWarn(" garrisonManager " + uneval(this.garrisonManager.Serialize()));
		aiWarn(" victoryManager " + uneval(this.victoryManager.Serialize()));
		aiWarn(" emergencyManager " + uneval(this.emergencyManager.Serialize()));
	}

	return {
		"properties": properties,

		"basesManager": this.basesManager.Serialize(),
		"attackManager": this.attackManager.Serialize(),
		"buildManager": this.buildManager.Serialize(),
		"defenseManager": this.defenseManager.Serialize(),
		"tradeManager": this.tradeManager.Serialize(),
		"navalManager": this.navalManager.Serialize(),
		"researchManager": this.researchManager.Serialize(),
		"diplomacyManager": this.diplomacyManager.Serialize(),
		"garrisonManager": this.garrisonManager.Serialize(),
		"victoryManager": this.victoryManager.Serialize(),
		"emergencyManager": this.emergencyManager.Serialize(),
	};
};

Headquarters.prototype.Deserialize = function(gameState, data)
{
	for (const key in data.properties)
		this[key] = data.properties[key];


	this.basesManager = new BasesManager(this.Config);
	this.basesManager.init(gameState);
	this.basesManager.Deserialize(gameState, data.basesManager);

	this.navalManager = new NavalManager(this.Config);
	this.navalManager.init(gameState, true);
	this.navalManager.Deserialize(gameState, data.navalManager);

	this.attackManager = new AttackManager(this.Config);
	this.attackManager.Deserialize(gameState, data.attackManager);
	this.attackManager.init(gameState);
	this.attackManager.Deserialize(gameState, data.attackManager);

	this.buildManager = new BuildManager();
	this.buildManager.Deserialize(data.buildManager);

	this.defenseManager = new DefenseManager(this.Config);
	this.defenseManager.Deserialize(gameState, data.defenseManager);

	this.tradeManager = new TradeManager(this.Config);
	this.tradeManager.init(gameState);
	this.tradeManager.Deserialize(gameState, data.tradeManager);

	this.researchManager = new ResearchManager(this.Config);
	this.researchManager.Deserialize(data.researchManager);

	this.diplomacyManager = new DiplomacyManager(this.Config);
	this.diplomacyManager.Deserialize(data.diplomacyManager);

	this.garrisonManager = new GarrisonManager(this.Config);
	this.garrisonManager.Deserialize(data.garrisonManager);

	this.victoryManager = new VictoryManager(this.Config);
	this.victoryManager.Deserialize(data.victoryManager);

	this.emergencyManager = new EmergencyManager(this.Config);
	this.emergencyManager.Deserialize(data.emergencyManager);
};
