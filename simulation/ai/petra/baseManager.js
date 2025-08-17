import * as filters from "simulation/ai/common-api/filters.js";
import { SquareVectorDistance, warn as aiWarn } from "simulation/ai/common-api/utils.js";
import { Config } from "simulation/ai/petra/config.js";
import * as difficulty from "simulation/ai/petra/difficultyLevel.js";
import { getBestBase, getBuiltEntity, getLandAccess, isFastMoving, isNotWorthBuilding } from
	"simulation/ai/petra/entityExtend.js";
import { createObstructionMap } from "simulation/ai/petra/mapModule.js";
import { ConstructionPlan } from "simulation/ai/petra/queueplanBuilding.js";
import { Worker } from "simulation/ai/petra/worker.js";

/**
 * Base Manager
 * Handles lower level economic stuffs.
 * Some tasks:
 *  -tasking workers: gathering/hunting/building/repairing?/scouting/plans.
 *  -giving feedback/estimates on GR
 *  -achieving building stuff plans (scouting/getting ressource/building) or other long-staying plans.
 *  -getting good spots for dropsites
 *  -managing dropsite use in the base
 *  -updating whatever needs updating, keeping track of stuffs (rebuilding needs…)
 */

export function BaseManager(gameState, basesManager)
{
	this.Config = basesManager.Config;
	this.ID = gameState.ai.uniqueIDs.bases++;
	this.basesManager = basesManager;

	// anchor building: seen as the main building of the base. Needs to have territorial influence
	this.anchor = undefined;
	this.anchorId = undefined;
	this.accessIndex = undefined;

	// Maximum distance (from any dropsite) to look for resources
	// 3 areas are used: from 0 to max/4, from max/4 to max/2 and from max/2 to max
	this.maxDistResourceSquare = 360*360;

	this.constructing = false;
	// Defenders to train in this cc when its construction is finished
	this.neededDefenders = this.Config.difficulty > difficulty.EASY ? 3 + 2*(this.Config.difficulty - 3) : 0;

	// vector for iterating, to check one use the HQ map.
	this.territoryIndices = [];

	this.timeNextIdleCheck = 0;
}


BaseManager.STATE_WITH_ANCHOR = "anchored";

/**
 * New base with a foundation anchor.
 */
BaseManager.STATE_UNCONSTRUCTED = "unconstructed";

/**
 * Captured base with an anchor.
 */
BaseManager.STATE_CAPTURED = "captured";

/**
 * Anchorless base, currently with dock.
 */
BaseManager.STATE_ANCHORLESS = "anchorless";

BaseManager.prototype.init = function(gameState, state)
{
	if (state === BaseManager.STATE_UNCONSTRUCTED)
		this.constructing = true;
	else if (state !== BaseManager.STATE_CAPTURED)
		this.neededDefenders = 0;
	this.workerObject = new Worker(this);
	// entitycollections
	this.units = gameState.getOwnUnits().filter(filters.byMetadata(PlayerID, "base", this.ID));
	this.workers = this.units.filter(filters.byMetadata(PlayerID, "role", Worker.ROLE_WORKER));
	this.buildings = gameState.getOwnStructures().filter(filters.byMetadata(PlayerID, "base", this.ID));
	this.mobileDropsites = this.units.filter(filters.isDropsite());

	this.units.registerUpdates();
	this.workers.registerUpdates();
	this.buildings.registerUpdates();
	this.mobileDropsites.registerUpdates();

	// array of entity IDs, with each being
	this.dropsites = {};
	this.dropsiteSupplies = {};
	this.gatherers = {};
	for (const res of Resources.GetCodes())
	{
		this.dropsiteSupplies[res] = { "nearby": [], "medium": [], "faraway": [] };
		this.gatherers[res] = { "nextCheck": 0, "used": 0, "lost": 0 };
	}
};

BaseManager.prototype.reset = function(gameState, state)
{
	if (state === BaseManager.STATE_UNCONSTRUCTED)
		this.constructing = true;
	else
		this.constructing = false;
	if (state !== BaseManager.STATE_CAPTURED || this.Config.difficulty < difficulty.MEDIUM)
		this.neededDefenders = 0;
	else
		this.neededDefenders = 3 + 2 * (this.Config.difficulty - 3);
};

BaseManager.prototype.assignEntity = function(gameState, ent)
{
	ent.setMetadata(PlayerID, "base", this.ID);
	this.units.updateEnt(ent);
	this.workers.updateEnt(ent);
	this.buildings.updateEnt(ent);
	if (ent.resourceDropsiteTypes() && !ent.hasClass("Unit"))
		this.assignResourceToDropsite(gameState, ent);
};

BaseManager.prototype.setAnchor = function(gameState, anchorEntity)
{
	if (!anchorEntity.hasClass("CivCentre"))
	{
		aiWarn("Error: Petra base " + this.ID + " has been assigned " + ent.templateName() +
			" as anchor.");
	}
	else
	{
		this.anchor = anchorEntity;
		this.anchorId = anchorEntity.id();
		this.anchor.setMetadata(PlayerID, "baseAnchor", true);
		this.basesManager.resetBaseCache();
	}
	anchorEntity.setMetadata(PlayerID, "base", this.ID);
	this.buildings.updateEnt(anchorEntity);
	this.accessIndex = getLandAccess(gameState, anchorEntity);
	return true;
};

/* we lost our anchor. Let's reassign our units and buildings */
BaseManager.prototype.anchorLost = function(gameState, ent)
{
	this.anchor = undefined;
	this.anchorId = undefined;
	this.neededDefenders = 0;
	this.basesManager.resetBaseCache();
};

/** Set a building of an anchorless base */
BaseManager.prototype.setAnchorlessEntity = function(gameState, ent)
{
	if (!this.buildings.hasEntities())
	{
		if (!getBuiltEntity(gameState, ent).resourceDropsiteTypes())
		{
			aiWarn("Error: Petra base " + this.ID + " has been assigned " + ent.templateName() +
				" as origin.");
		}
		this.accessIndex = getLandAccess(gameState, ent);
	}
	else if (this.accessIndex !== getLandAccess(gameState, ent))
	{
		aiWarn(" Error: Petra base " + this.ID + " with access " + this.accessIndex +
			" has been assigned " + ent.templateName() + " with access" +
			getLandAccess(gameState, ent));
	}

	ent.setMetadata(PlayerID, "base", this.ID);
	this.buildings.updateEnt(ent);
	return true;
};

/**
 * Assign the resources around the dropsites of this basis in three areas according to distance, and sort them in each area.
 * Moving resources (animals) and buildable resources (fields) are treated elsewhere.
 */
BaseManager.prototype.assignResourceToDropsite = function(gameState, dropsite)
{
	if (this.dropsites[dropsite.id()])
	{
		if (this.Config.debug > 0)
			warn("assignResourceToDropsite: dropsite already in the list. Should never happen");
		return;
	}

	let accessIndex = this.accessIndex;
	const dropsitePos = dropsite.position();
	const dropsiteId = dropsite.id();
	this.dropsites[dropsiteId] = true;

	if (this.ID == this.basesManager.baselessBase().ID)
		accessIndex = getLandAccess(gameState, dropsite);

	const maxDistResourceSquare = this.maxDistResourceSquare;
	for (const type of dropsite.resourceDropsiteTypes())
	{
		const resources = gameState.getResourceSupplies(type);
		if (!resources.length)
			continue;

		const nearby = this.dropsiteSupplies[type].nearby;
		const medium = this.dropsiteSupplies[type].medium;
		const faraway = this.dropsiteSupplies[type].faraway;

		resources.forEach(function(supply)
		{
			if (!supply.position())
				return;
			// Moving resources and fields are treated differently.
			if (supply.hasClasses(["Animal", "Field"]))
				return;
			// quick accessibility check
			if (getLandAccess(gameState, supply) != accessIndex)
				return;

			const dist = SquareVectorDistance(supply.position(), dropsitePos);
			if (dist < maxDistResourceSquare)
			{
				if (dist < maxDistResourceSquare/16)        // distmax/4
					nearby.push({ "dropsite": dropsiteId, "id": supply.id(), "ent": supply, "dist": dist });
				else if (dist < maxDistResourceSquare/4)    // distmax/2
					medium.push({ "dropsite": dropsiteId, "id": supply.id(), "ent": supply, "dist": dist });
				else
					faraway.push({ "dropsite": dropsiteId, "id": supply.id(), "ent": supply, "dist": dist });
			}
		});

		nearby.sort((r1, r2) => r1.dist - r2.dist);
		medium.sort((r1, r2) => r1.dist - r2.dist);
		faraway.sort((r1, r2) => r1.dist - r2.dist);

		/*
		let debug = false;
		if (debug)
		{
			faraway.forEach(function(res){
				Engine.PostCommand(PlayerID,{"type": "set-shading-color", "entities": [res.ent.id()], "rgb": [2,0,0]});
			});
			medium.forEach(function(res){
				Engine.PostCommand(PlayerID,{"type": "set-shading-color", "entities": [res.ent.id()], "rgb": [0,2,0]});
			});
			nearby.forEach(function(res){
				Engine.PostCommand(PlayerID,{"type": "set-shading-color", "entities": [res.ent.id()], "rgb": [0,0,2]});
			});
		}
		*/
	}

	// Allows all allies to use this dropsite except if base anchor to be sure to keep
	// a minimum of resources for this base
	Engine.PostCommand(PlayerID, {
		"type": "set-dropsite-sharing",
		"entities": [dropsiteId],
		"shared": dropsiteId != this.anchorId
	});
};

BaseManager.prototype.removeFromAssignedDropsite = function(ent)
{
	for (const type in this.dropsiteSupplies)
		for (const proxim in this.dropsiteSupplies[type])
		{
			const resourcesList = this.dropsiteSupplies[type][proxim];
			for (let i = 0; i < resourcesList.length; ++i)
				if (resourcesList[i].id === ent.id())
					resourcesList.splice(i--, 1);
		}
};

// completely remove the dropsite resources from our list.
BaseManager.prototype.removeDropsite = function(gameState, ent)
{
	if (!ent.id())
		return;

	const removeSupply = function(entId, supply){
		for (let i = 0; i < supply.length; ++i)
		{
			// exhausted resource, remove it from this list
			if (!supply[i].ent || !gameState.getEntityById(supply[i].id))
				supply.splice(i--, 1);
			// resource assigned to the removed dropsite, remove it
			else if (supply[i].dropsite == entId)
				supply.splice(i--, 1);
		}
	};

	for (const type in this.dropsiteSupplies)
	{
		removeSupply(ent.id(), this.dropsiteSupplies[type].nearby);
		removeSupply(ent.id(), this.dropsiteSupplies[type].medium);
		removeSupply(ent.id(), this.dropsiteSupplies[type].faraway);
	}

	this.dropsites[ent.id()] = undefined;
};

/**
 * @return {Object} - The position of the best place to build a new dropsite for the specified resource,
 *			its quality and its template name.
 */
BaseManager.prototype.findBestDropsiteAndLocation = function(gameState, resource)
{
	let bestResult = {
		"quality": 0,
		"pos": [0, 0]
	};
	for (const templateName of gameState.ai.HQ.buildManager.findStructuresByFilter(gameState,
		filters.isDropsite(resource)))
	{
		const dp = this.findBestDropsiteLocation(gameState, resource, templateName);
		if (dp.quality < bestResult.quality)
			continue;
		bestResult = dp;
		bestResult.templateName = templateName;
	}
	return bestResult;
};

/**
 * Returns the position of the best place to build a new dropsite for the specified resource and dropsite template.
 */
BaseManager.prototype.findBestDropsiteLocation = function(gameState, resource, templateName)
{
	const template = gameState.getTemplate(gameState.applyCiv(templateName));

	// CCs and Docks are handled elsewhere.
	if (template.hasClasses(["CivCentre", "Dock"]))
		return { "quality": 0, "pos": [0, 0] };

	let halfSize = 0;
	if (template.get("Footprint/Square"))
		halfSize = Math.max(+template.get("Footprint/Square/@depth"), +template.get("Footprint/Square/@width")) / 2;
	else if (template.get("Footprint/Circle"))
		halfSize = +template.get("Footprint/Circle/@radius");

	// This builds a map. The procedure is fairly simple. It adds the resource maps
	//	(which are dynamically updated and are made so that they will facilitate DP placement)
	// Then checks for a good spot in the territory. If none, and town/city phase, checks outside
	// The AI will currently not build a CC if it wouldn't connect with an existing CC.

	const obstructions = createObstructionMap(gameState, this.accessIndex, template);

	const dpEnts = gameState.getOwnStructures().filter(filters.isDropsite(resource)).toEntityArray();

	// Foundations don't have the dropsite properties yet, so treat them separately.
	for (const foundation of gameState.getOwnFoundations().toEntityArray())
		if (getBuiltEntity(gameState, foundation).isResourceDropsite(resource))
			dpEnts.push(foundation);

	let bestIdx;
	let bestVal = 0;
	const radius = Math.ceil(template.obstructionRadius().max / obstructions.cellSize);

	const territoryMap = gameState.ai.HQ.territoryMap;
	const width = territoryMap.width;
	const cellSize = territoryMap.cellSize;

	const droppableResources = template.resourceDropsiteTypes();

	for (const j of this.territoryIndices)
	{
		const i = territoryMap.getNonObstructedTile(j, radius, obstructions);
		if (i < 0)  // no room around
			continue;

		// We add 3 times the needed resource and once others that can be dropped here.
		let total = 2 * gameState.sharedScript.resourceMaps[resource].map[j];
		for (const res in gameState.sharedScript.resourceMaps)
			if (droppableResources.indexOf(res) != -1)
				total += gameState.sharedScript.resourceMaps[res].map[j];

		total *= 0.7;   // Just a normalisation factor as the locateMap is limited to 255
		if (total <= bestVal)
			continue;

		const pos = [cellSize * (j%width+0.5), cellSize * (Math.floor(j/width)+0.5)];

		for (const dp of dpEnts)
		{
			const dpPos = dp.position();
			if (!dpPos)
				continue;
			const dist = SquareVectorDistance(dpPos, pos);
			if (dist < 3600)
			{
				total = 0;
				break;
			}
			else if (dist < 6400)
				total *= (Math.sqrt(dist)-60)/20;
		}
		if (total <= bestVal)
			continue;

		if (gameState.ai.HQ.isDangerousLocation(gameState, pos, halfSize))
			continue;
		bestVal = total;
		bestIdx = i;
	}

	if (this.Config.debug > 2)
		warn(" for dropsite best is " + bestVal);

	if (bestVal <= 0)
		return { "quality": bestVal, "pos": [0, 0] };

	const x = (bestIdx % obstructions.width + 0.5) * obstructions.cellSize;
	const z = (Math.floor(bestIdx / obstructions.width) + 0.5) * obstructions.cellSize;
	return { "quality": bestVal, "pos": [x, z] };
};

BaseManager.prototype.getResourceLevel = function(gameState, type, distances = ["nearby", "medium", "faraway"])
{
	let count = 0;
	const check = {};
	for (const proxim of distances)
		for (const supply of this.dropsiteSupplies[type][proxim])
		{
			if (check[supply.id])    // avoid double counting as same resource can appear several time
				continue;
			check[supply.id] = true;
			count += supply.ent.resourceSupplyAmount();
		}
	return count;
};

/** check our resource levels and react accordingly */
BaseManager.prototype.checkResourceLevels = function(gameState, queues)
{
	for (const type of Resources.GetCodes())
	{
		if (type == "food")
		{
			const prox = ["nearby"];
			if (gameState.currentPhase() < 2)
				prox.push("medium");
			if (gameState.ai.HQ.canBuild(gameState, "structures/{civ}/field"))	// let's see if we need to add new farms.
			{
				const count = this.getResourceLevel(gameState, type, prox);  // animals are not accounted
				const numFarms = gameState.getOwnStructures().filter(filters.byClass("Field"))
					.length;  // including foundations
				const numQueue = queues.field.countQueuedUnits();

				// TODO  if not yet farms, add a check on time used/lost and build granary if needed
				if (numFarms + numQueue == 0)	// starting game, rely on fruits as long as we have enough of them
				{
					if (count < 600)
					{
						queues.field.addPlan(new ConstructionPlan(gameState,
							"structures/{civ}/field", { "favoredBase": this.ID }));
						gameState.ai.HQ.needFarm = true;
					}
				}
				else if (!gameState.ai.HQ.maxFields || numFarms + numQueue < gameState.ai.HQ.maxFields)
				{
					const numFound = gameState.getOwnFoundations().filter(filters.byClass("Field"))
						.length;
					let goal = this.Config.Economy.provisionFields;
					if (gameState.ai.HQ.saveResources || gameState.ai.HQ.saveSpace || count > 300 || numFarms > 5)
						goal = Math.max(goal-1, 1);
					if (numFound + numQueue < goal)
					{
						queues.field.addPlan(new ConstructionPlan(gameState,
							"structures/{civ}/field", { "favoredBase": this.ID }));
					}
				}
				else if (gameState.ai.HQ.needCorral &&
					!gameState.getOwnEntitiesByClass("Corral", true).hasEntities() &&
					!queues.corral.hasQueuedUnits() &&
					gameState.ai.HQ.canBuild(gameState, "structures/{civ}/corral"))
				{
					queues.corral.addPlan(new ConstructionPlan(gameState,
						"structures/{civ}/corral", { "favoredBase": this.ID }));
				}
				continue;
			}
			if (!gameState.getOwnEntitiesByClass("Corral", true).hasEntities() &&
			    !queues.corral.hasQueuedUnits() && gameState.ai.HQ.canBuild(gameState, "structures/{civ}/corral"))
			{
				const count = this.getResourceLevel(gameState, type, prox);  // animals are not accounted
				if (count < 900)
				{
					queues.corral.addPlan(new ConstructionPlan(gameState,
						"structures/{civ}/corral", { "favoredBase": this.ID }));
					gameState.ai.HQ.needCorral = true;
				}
			}
			continue;
		}
		// Non food stuff
		if (!gameState.sharedScript.resourceMaps[type] || queues.dropsites.hasQueuedUnits() ||
			gameState.getOwnFoundations().filter(filters.byClass("Storehouse")).hasEntities())
		{
			this.gatherers[type].nextCheck = gameState.ai.playedTurn;
			this.gatherers[type].used = 0;
			this.gatherers[type].lost = 0;
			continue;
		}
		if (gameState.ai.playedTurn < this.gatherers[type].nextCheck)
			continue;
		for (const ent of this.gatherersByType(gameState, type).values())
		{
			if (ent.unitAIState() == "INDIVIDUAL.GATHER.GATHERING")
				++this.gatherers[type].used;
			else if (ent.unitAIState() == "INDIVIDUAL.GATHER.RETURNINGRESOURCE.APPROACHING")
				++this.gatherers[type].lost;
		}
		// TODO  add also a test on remaining resources.
		const total = this.gatherers[type].used + this.gatherers[type].lost;
		if (total > 150 || total > 60 && type != "wood")
		{
			const ratio = this.gatherers[type].lost / total;
			if (ratio > 0.15)
			{
				const newDP = this.findBestDropsiteAndLocation(gameState, type);
				if (newDP.quality > 50 && gameState.ai.HQ.canBuild(gameState, newDP.templateName))
				{
					queues.dropsites.addPlan(new ConstructionPlan(gameState, newDP.templateName,
						{ "base": this.ID, "type": type }, newDP.pos));
				}
				else if (!gameState.getOwnFoundations().filter(filters.byClass("CivCentre"))
					.hasEntities() &&
					!queues.civilCentre.hasQueuedUnits())
				{
					// No good dropsite, try to build a new base if no base already planned,
					// and if not possible, be less strict on dropsite quality.
					if ((!gameState.ai.HQ.canExpand || !gameState.ai.HQ.buildNewBase(gameState, queues, type)) &&
						newDP.quality > Math.min(25, 50*0.15/ratio) &&
						gameState.ai.HQ.canBuild(gameState, newDP.templateName))
					{
						queues.dropsites.addPlan(new ConstructionPlan(gameState,
							newDP.templateName, { "base": this.ID, "type": type },
							newDP.pos));
					}
				}
			}
			this.gatherers[type].nextCheck = gameState.ai.playedTurn + 20;
			this.gatherers[type].used = 0;
			this.gatherers[type].lost = 0;
		}
		else if (total == 0)
			this.gatherers[type].nextCheck = gameState.ai.playedTurn + 10;
	}

};

/** Adds the estimated gather rates from this base to the currentRates */
BaseManager.prototype.addGatherRates = function(gameState, currentRates)
{
	for (const res in currentRates)
	{
		// I calculate the exact gathering rate for each unit.
		// I must then lower that to account for travel time.
		// Given that the faster you gather, the more travel time matters,
		// I use some logarithms.
		// TODO: this should take into account for unit speed and/or distance to target

		this.gatherersByType(gameState, res).forEach(ent => {
			if (ent.isIdle() || !ent.position())
				return;
			const gRate = ent.currentGatherRate();
			if (gRate)
				currentRates[res] += Math.log(1+gRate)/1.1;
		});
		if (res == "food")
		{
			this.workersBySubrole(gameState, Worker.SUBROLE_HUNTER).forEach(ent => {
				if (ent.isIdle() || !ent.position())
					return;
				const gRate = ent.currentGatherRate();
				if (gRate)
					currentRates[res] += Math.log(1+gRate)/1.1;
			});
			this.workersBySubrole(gameState, Worker.SUBROLE_FISHER).forEach(ent => {
				if (ent.isIdle() || !ent.position())
					return;
				const gRate = ent.currentGatherRate();
				if (gRate)
					currentRates[res] += Math.log(1+gRate)/1.1;
			});
		}
	}
};

BaseManager.prototype.assignRolelessUnits = function(gameState, roleless)
{
	if (!roleless)
		roleless = this.units.filter(filters.not(filters.byHasMetadata(PlayerID, "role"))).values();

	for (const ent of roleless)
	{
		if (ent.hasClasses(["Worker", "CitizenSoldier", "FishingBoat"]))
			ent.setMetadata(PlayerID, "role", Worker.ROLE_WORKER);
		else if (ent.hasClass("Support") && ent.hasClass("Elephant"))
			ent.setMetadata(PlayerID, "role", Worker.ROLE_WORKER);
	}
};

/**
 * If the numbers of workers on the resources is unbalanced then set some of workers to idle so
 * they can be reassigned by reassignIdleWorkers.
 * TODO: actually this probably should be in the HQ.
 */
BaseManager.prototype.setWorkersIdleByPriority = function(gameState)
{
	this.timeNextIdleCheck = gameState.ai.elapsedTime + 8;
	// change resource only towards one which is more needed, and if changing will not change this order
	let nb = 1;    // no more than 1 change per turn (otherwise we should update the rates)
	const mostNeeded = gameState.ai.HQ.pickMostNeededResources(gameState);
	let sumWanted = 0;
	let sumCurrent = 0;
	for (const need of mostNeeded)
	{
		sumWanted += need.wanted;
		sumCurrent += need.current;
	}
	let scale = 1;
	if (sumWanted > 0)
		scale = sumCurrent / sumWanted;

	for (let i = mostNeeded.length-1; i > 0; --i)
	{
		const lessNeed = mostNeeded[i];
		for (let j = 0; j < i; ++j)
		{
			const moreNeed = mostNeeded[j];
			const lastFailed = gameState.ai.HQ.lastFailedGather[moreNeed.type];
			if (lastFailed && gameState.ai.elapsedTime - lastFailed < 20)
				continue;
			// Ensure that the most wanted resource is not exhausted
			if (moreNeed.type != "food" && this.basesManager.isResourceExhausted(moreNeed.type))
			{
				if (lessNeed.type != "food" && this.basesManager.isResourceExhausted(lessNeed.type))
					continue;

				// And if so, move the gatherer to the less wanted one.
				nb = this.switchGatherer(gameState, moreNeed.type, lessNeed.type, nb);
				if (nb == 0)
					return;
			}

			// If we assume a mean rate of 0.5 per gatherer, this diff should be > 1
			// but we require a bit more to avoid too frequent changes
			if (scale*moreNeed.wanted - moreNeed.current - scale*lessNeed.wanted + lessNeed.current > 1.5 ||
			    lessNeed.type != "food" && this.basesManager.isResourceExhausted(lessNeed.type))
			{
				nb = this.switchGatherer(gameState, lessNeed.type, moreNeed.type, nb);
				if (nb == 0)
					return;
			}
		}
	}
};

/**
 * Switch some gatherers (limited to number) from resource "from" to resource "to"
 * and return remaining number of possible switches.
 * Prefer FemaleCitizen for food and CitizenSoldier for other resources.
 */
BaseManager.prototype.switchGatherer = function(gameState, from, to, number)
{
	let num = number;
	let only;
	const gatherers = this.gatherersByType(gameState, from);
	if (from == "food" && gatherers.filter(filters.byClass("CitizenSoldier")).hasEntities())
		only = "CitizenSoldier";
	else if (to == "food" && gatherers.filter(filters.byClass("FemaleCitizen")).hasEntities())
		only = "FemaleCitizen";

	for (const ent of gatherers.values())
	{
		if (num == 0)
			return num;
		if (!ent.canGather(to))
			continue;
		if (only && !ent.hasClass(only))
			continue;
		--num;
		ent.stopMoving();
		ent.setMetadata(PlayerID, "gather-type", to);
		this.basesManager.AddTCResGatherer(to);
	}
	return num;
};

BaseManager.prototype.reassignIdleWorkers = function(gameState, idleWorkers)
{
	// Search for idle workers, and tell them to gather resources based on demand
	if (!idleWorkers)
	{
		const filter = filters.byMetadata(PlayerID, "subrole", Worker.SUBROLE_IDLE);
		idleWorkers = gameState.updatingCollection("idle-workers-base-" + this.ID, filter, this.workers).values();
	}

	for (const ent of idleWorkers)
	{
		// Check that the worker isn't garrisoned
		if (!ent.position())
			continue;
		// Support elephant can only be builders
		if (ent.hasClass("Support") && ent.hasClass("Elephant"))
		{
			ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_IDLE);
			continue;
		}

		if (ent.hasClass("Worker"))
		{
			// Just emergency repairing here. It is better managed in assignToFoundations
			if (ent.isBuilder() && this.anchor && this.anchor.needsRepair() &&
				gameState.getOwnEntitiesByMetadata("target-foundation", this.anchor.id()).length < 2)
				ent.repair(this.anchor);
			else if (ent.isGatherer())
			{
				const mostNeeded = gameState.ai.HQ.pickMostNeededResources(gameState);
				for (const needed of mostNeeded)
				{
					if (!ent.canGather(needed.type))
						continue;
					const lastFailed = gameState.ai.HQ.lastFailedGather[needed.type];
					if (lastFailed && gameState.ai.elapsedTime - lastFailed < 20)
						continue;
					if (needed.type != "food" && this.basesManager.isResourceExhausted(needed.type))
						continue;
					ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_GATHERER);
					ent.setMetadata(PlayerID, "gather-type", needed.type);
					this.basesManager.AddTCResGatherer(needed.type);
					break;
				}
			}
		}
		else if (isFastMoving(ent) && ent.canGather("food") && ent.canAttackClass("Animal"))
			ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_HUNTER);
		else if (ent.hasClass("FishingBoat"))
			ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_FISHER);
	}
};

BaseManager.prototype.workersBySubrole = function(gameState, subrole)
{
	return gameState.updatingCollection("subrole-" + subrole +"-base-" + this.ID,
		filters.byMetadata(PlayerID, "subrole", subrole), this.workers);
};

BaseManager.prototype.gatherersByType = function(gameState, type)
{
	return gameState.updatingCollection("workers-gathering-" + type +"-base-" +
		this.ID, filters.byMetadata(PlayerID, "gather-type", type),
	this.workersBySubrole(gameState, Worker.SUBROLE_GATHERER));
};

/**
 * returns an entity collection of workers.
 * They are idled immediatly and their subrole set to idle.
 */
BaseManager.prototype.pickBuilders = function(gameState, workers, number)
{
	const availableWorkers = this.workers.filter(ent => {
		if (!ent.position() || !ent.isBuilder())
			return false;
		if (ent.getMetadata(PlayerID, "plan") == -2 || ent.getMetadata(PlayerID, "plan") == -3)
			return false;
		if (ent.getMetadata(PlayerID, "transport"))
			return false;
		return true;
	}).toEntityArray();
	availableWorkers.sort((a, b) => {
		let vala = 0;
		let valb = 0;
		if (a.getMetadata(PlayerID, "subrole") === Worker.SUBROLE_BUILDER)
			vala = 100;
		if (b.getMetadata(PlayerID, "subrole") === Worker.SUBROLE_BUILDER)
			valb = 100;
		if (a.getMetadata(PlayerID, "subrole") === Worker.SUBROLE_IDLE)
			vala = -50;
		if (b.getMetadata(PlayerID, "subrole") === Worker.SUBROLE_IDLE)
			valb = -50;
		if (a.getMetadata(PlayerID, "plan") === undefined)
			vala = -20;
		if (b.getMetadata(PlayerID, "plan") === undefined)
			valb = -20;
		return vala - valb;
	});
	const needed = Math.min(number, availableWorkers.length - 3);
	for (let i = 0; i < needed; ++i)
	{
		availableWorkers[i].stopMoving();
		availableWorkers[i].setMetadata(PlayerID, "subrole", Worker.SUBROLE_IDLE);
		workers.addEnt(availableWorkers[i]);
	}
	return;
};

/**
 * If we have some foundations, and we don't have enough builder-workers,
 * try reassigning some other workers who are nearby
 * AI tries to use builders sensibly, not completely stopping its econ.
 */
BaseManager.prototype.assignToFoundations = function(gameState, noRepair)
{
	let foundations = this.buildings.filter(filters.and(filters.isFoundation(),
		filters.not(filters.byClass("Field"))));

	const damagedBuildings = this.buildings.filter(ent => ent.foundationProgress() === undefined && ent.needsRepair());

	// Check if nothing to build
	if (!foundations.length && !damagedBuildings.length)
		return;

	const workers = this.workers.filter(ent => ent.isBuilder());
	const builderWorkers = this.workersBySubrole(gameState, Worker.SUBROLE_BUILDER);
	const idleBuilderWorkers = builderWorkers.filter(filters.isIdle());

	// if we're constructing and we have the foundations to our base anchor, only try building that.
	if (this.constructing && foundations.filter(filters.byMetadata(PlayerID, "baseAnchor", true))
		.hasEntities())
	{
		foundations = foundations.filter(filters.byMetadata(PlayerID, "baseAnchor", true));
		const tID = foundations.toEntityArray()[0].id();
		workers.forEach(ent => {
			const target = ent.getMetadata(PlayerID, "target-foundation");
			if (target && target != tID)
			{
				ent.stopMoving();
				ent.setMetadata(PlayerID, "target-foundation", tID);
			}
		});
	}

	if (workers.length < 3)
	{
		const fromOtherBase = this.basesManager.bulkPickWorkers(gameState, this, 2);
		if (fromOtherBase)
		{
			const baseID = this.ID;
			fromOtherBase.forEach(worker => {
				worker.setMetadata(PlayerID, "base", baseID);
				worker.setMetadata(PlayerID, "subrole", Worker.SUBROLE_BUILDER);
				workers.updateEnt(worker);
				builderWorkers.updateEnt(worker);
				idleBuilderWorkers.updateEnt(worker);
			});
		}
	}

	let builderTot = builderWorkers.length - idleBuilderWorkers.length;

	// Make the limit on number of builders depends on the available resources
	const availableResources = gameState.ai.queueManager.getAvailableResources(gameState);
	let builderRatio = 1;
	for (const res of Resources.GetCodes())
	{
		if (availableResources[res] < 200)
		{
			builderRatio = 0.2;
			break;
		}
		else if (availableResources[res] < 1000)
			builderRatio = Math.min(builderRatio, availableResources[res] / 1000);
	}

	for (const target of foundations.values())
	{
		if (target.hasClass("Field"))
			continue; // we do not build fields

		if (gameState.ai.HQ.isNearInvadingArmy(target.position()))
			if (!target.hasClasses(["CivCentre", "Wall"]) &&
			    (!target.hasClass("Wonder") || !gameState.getVictoryConditions().has("wonder")))
				continue;

		// if our territory has shrinked since this foundation was positioned, do not build it
		if (isNotWorthBuilding(gameState, target))
			continue;

		let assigned = gameState.getOwnEntitiesByMetadata("target-foundation", target.id()).length;
		let maxTotalBuilders = Math.ceil(workers.length * builderRatio);
		if (maxTotalBuilders < 2 && workers.length > 1)
			maxTotalBuilders = 2;
		if (target.hasClass("House") && gameState.getPopulationLimit() < gameState.getPopulation() + 5 &&
		    gameState.getPopulationLimit() < gameState.getPopulationMax())
			maxTotalBuilders += 2;
		let targetNB = 2;
		if (target.hasClasses(["Fortress", "Wonder"]) ||
		    target.getMetadata(PlayerID, "phaseUp") == true)
			targetNB = 7;
		else if (target.hasClasses(["Barracks", "Range", "Stable", "Tower", "Market"]))
			targetNB = 4;
		else if (target.hasClasses(["House", "DropsiteWood"]))
			targetNB = 3;

		if (target.getMetadata(PlayerID, "baseAnchor") == true ||
		    target.hasClass("Wonder") && gameState.getVictoryConditions().has("wonder"))
		{
			targetNB = 15;
			maxTotalBuilders = Math.max(maxTotalBuilders, 15);
		}

		if (!this.basesManager.hasActiveBase())
		{
			targetNB = workers.length;
			maxTotalBuilders = targetNB;
		}

		if (assigned >= targetNB)
			continue;
		idleBuilderWorkers.forEach(function(ent) {
			if (ent.getMetadata(PlayerID, "target-foundation") !== undefined)
				return;
			if (assigned >= targetNB || !ent.position() ||
				SquareVectorDistance(ent.position(), target.position()) > 40000)
			{
				return;
			}
			++assigned;
			++builderTot;
			ent.setMetadata(PlayerID, "target-foundation", target.id());
		});
		if (assigned >= targetNB || builderTot >= maxTotalBuilders)
			continue;
		const nonBuilderWorkers = workers.filter(function(ent) {
			if (ent.getMetadata(PlayerID, "subrole") === Worker.SUBROLE_BUILDER)
				return false;
			if (!ent.position())
				return false;
			if (ent.getMetadata(PlayerID, "plan") == -2 || ent.getMetadata(PlayerID, "plan") == -3)
				return false;
			if (ent.getMetadata(PlayerID, "transport"))
				return false;
			return true;
		}).toEntityArray();
		const time = target.buildTime();
		nonBuilderWorkers.sort((workerA, workerB) => {
			let coeffA = SquareVectorDistance(target.position(), workerA.position());
			// elephant moves slowly, so when far away they are only useful if build time is long
			if (workerA.hasClass("Elephant"))
				coeffA *= 0.5 * (1 + Math.sqrt(coeffA)/5/time);
			else if (workerA.getMetadata(PlayerID, "gather-type") == "food")
				coeffA *= 3;
			let coeffB = SquareVectorDistance(target.position(), workerB.position());
			if (workerB.hasClass("Elephant"))
				coeffB *= 0.5 * (1 + Math.sqrt(coeffB)/5/time);
			else if (workerB.getMetadata(PlayerID, "gather-type") == "food")
				coeffB *= 3;
			return coeffA - coeffB;
		});
		let current = 0;
		const nonBuilderTot = nonBuilderWorkers.length;
		while (assigned < targetNB && builderTot < maxTotalBuilders && current < nonBuilderTot)
		{
			++assigned;
			++builderTot;
			const ent = nonBuilderWorkers[current++];
			ent.stopMoving();
			ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_BUILDER);
			ent.setMetadata(PlayerID, "target-foundation", target.id());
		}
	}

	for (const target of damagedBuildings.values())
	{
		// Don't repair if we're still under attack, unless it's a vital (civcentre or wall) building
		// that's being destroyed.
		if (gameState.ai.HQ.isNearInvadingArmy(target.position()))
		{
			if (target.healthLevel() > 0.5 ||
			    !target.hasClasses(["CivCentre", "Wall"]) &&
			    (!target.hasClass("Wonder") || !gameState.getVictoryConditions().has("wonder")))
				continue;
		}
		else if (noRepair && !target.hasClass("CivCentre"))
			continue;

		if (target.decaying())
			continue;

		let assigned = gameState.getOwnEntitiesByMetadata("target-foundation", target.id()).length;
		let maxTotalBuilders = Math.ceil(workers.length * builderRatio);
		let targetNB = 1;
		if (target.hasClasses(["Fortress", "Wonder"]))
			targetNB = 3;
		if (target.getMetadata(PlayerID, "baseAnchor") == true ||
		    target.hasClass("Wonder") && gameState.getVictoryConditions().has("wonder"))
		{
			maxTotalBuilders = Math.ceil(workers.length * Math.max(0.3, builderRatio));
			targetNB = 5;
			if (target.healthLevel() < 0.3)
			{
				maxTotalBuilders = Math.ceil(workers.length * Math.max(0.6, builderRatio));
				targetNB = 7;
			}

		}

		if (assigned >= targetNB)
			continue;
		idleBuilderWorkers.forEach(function(ent) {
			if (ent.getMetadata(PlayerID, "target-foundation") !== undefined)
				return;
			if (assigned >= targetNB || !ent.position() ||
			    SquareVectorDistance(ent.position(), target.position()) > 40000)
				return;
			++assigned;
			++builderTot;
			ent.setMetadata(PlayerID, "target-foundation", target.id());
		});
		if (assigned >= targetNB || builderTot >= maxTotalBuilders)
			continue;
		const nonBuilderWorkers = workers.filter(function(ent) {
			if (ent.getMetadata(PlayerID, "subrole") === Worker.SUBROLE_BUILDER)
				return false;
			if (!ent.position())
				return false;
			if (ent.getMetadata(PlayerID, "plan") == -2 || ent.getMetadata(PlayerID, "plan") == -3)
				return false;
			if (ent.getMetadata(PlayerID, "transport"))
				return false;
			return true;
		});
		const num = Math.min(nonBuilderWorkers.length, targetNB-assigned);
		const nearestNonBuilders = nonBuilderWorkers.filterNearest(target.position(), num);

		nearestNonBuilders.forEach(function(ent) {
			++assigned;
			++builderTot;
			ent.stopMoving();
			ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_BUILDER);
			ent.setMetadata(PlayerID, "target-foundation", target.id());
		});
	}
};

/** Return false when the base is not active (no workers on it) */
BaseManager.prototype.update = function(gameState, queues, events)
{
	if (this.ID == this.basesManager.baselessBase().ID)
	{
		// if some active base, reassigns the workers/buildings
		// otherwise look for anything useful to do, i.e. treasures to gather
		if (this.basesManager.hasActiveBase())
		{
			for (const ent of this.units.values())
			{
				const bestBase = getBestBase(gameState, ent);
				if (bestBase.ID != this.ID)
					bestBase.assignEntity(gameState, ent);
			}
			for (const ent of this.buildings.values())
			{
				const bestBase = getBestBase(gameState, ent);
				if (!bestBase)
				{
					if (ent.hasClass("Dock"))
					{
						aiWarn("Petra: dock in 'noBase' baseManager. It may be useful to " +
							"do an anchorless base for " + ent.templateName());
					}
					continue;
				}
				if (ent.resourceDropsiteTypes())
					this.removeDropsite(gameState, ent);
				bestBase.assignEntity(gameState, ent);
			}
		}
		else if (gameState.ai.HQ.canBuildUnits)
		{
			this.assignToFoundations(gameState);
			if (gameState.ai.elapsedTime > this.timeNextIdleCheck)
				this.setWorkersIdleByPriority(gameState);
			this.assignRolelessUnits(gameState);
			this.reassignIdleWorkers(gameState);
			for (const ent of this.workers.values())
				this.workerObject.update(gameState, ent);
			for (const ent of this.mobileDropsites.values())
				this.workerObject.moveToGatherer(gameState, ent, false);
		}
		return false;
	}

	if (!this.anchor)   // This anchor has been destroyed, but the base may still be usable
	{
		if (!this.buildings.hasEntities())
		{
			// Reassign all remaining entities to its nearest base
			for (const ent of this.units.values())
			{
				const base = getBestBase(gameState, ent, false, this.ID);
				base.assignEntity(gameState, ent);
			}
			return false;
		}
		// If we have a base with anchor on the same land, reassign everything to it
		let reassignedBase;
		for (const ent of this.buildings.values())
		{
			if (!ent.position())
				continue;
			const base = getBestBase(gameState, ent);
			if (base.anchor)
				reassignedBase = base;
			break;
		}

		if (reassignedBase)
		{
			for (const ent of this.units.values())
				reassignedBase.assignEntity(gameState, ent);
			for (const ent of this.buildings.values())
			{
				if (ent.resourceDropsiteTypes())
					this.removeDropsite(gameState, ent);
				reassignedBase.assignEntity(gameState, ent);
			}
			return false;
		}

		this.assignToFoundations(gameState);
		if (gameState.ai.elapsedTime > this.timeNextIdleCheck)
			this.setWorkersIdleByPriority(gameState);
		this.assignRolelessUnits(gameState);
		this.reassignIdleWorkers(gameState);
		for (const ent of this.workers.values())
			this.workerObject.update(gameState, ent);
		for (const ent of this.mobileDropsites.values())
			this.workerObject.moveToGatherer(gameState, ent, false);
		return true;
	}

	Engine.ProfileStart("Base update - base " + this.ID);

	this.checkResourceLevels(gameState, queues);
	this.assignToFoundations(gameState);

	if (this.constructing)
	{
		const owner = gameState.ai.HQ.territoryMap.getOwner(this.anchor.position());
		if (owner != 0 && !gameState.isPlayerAlly(owner))
		{
			// we're in enemy territory. If we're too close from the enemy, destroy us.
			const ccEnts = gameState.updatingGlobalCollection("allCCs",
				filters.byClass("CivCentre"));
			for (const cc of ccEnts.values())
			{
				if (cc.owner() != owner)
					continue;
				if (SquareVectorDistance(cc.position(), this.anchor.position()) > 8000)
					continue;
				this.anchor.destroy();
				this.basesManager.resetBaseCache();
				break;
			}
		}
	}
	else if (this.neededDefenders && gameState.ai.HQ.trainEmergencyUnits(gameState, [this.anchor.position()]))
		--this.neededDefenders;

	if (gameState.ai.elapsedTime > this.timeNextIdleCheck &&
	   (gameState.currentPhase() > 1 || gameState.ai.HQ.phasing == 2))
		this.setWorkersIdleByPriority(gameState);

	this.assignRolelessUnits(gameState);
	this.reassignIdleWorkers(gameState);
	// check if workers can find something useful to do
	for (const ent of this.workers.values())
		this.workerObject.update(gameState, ent);
	for (const ent of this.mobileDropsites.values())
		this.workerObject.moveToGatherer(gameState, ent, false);

	Engine.ProfileStop();
	return true;
};

BaseManager.prototype.AddTCGatherer = function(supplyID)
{
	return this.basesManager.AddTCGatherer(supplyID);
};

BaseManager.prototype.RemoveTCGatherer = function(supplyID)
{
	this.basesManager.RemoveTCGatherer(supplyID);
};

BaseManager.prototype.GetTCGatherer = function(supplyID)
{
	return this.basesManager.GetTCGatherer(supplyID);
};

BaseManager.prototype.Serialize = function()
{
	return {
		"ID": this.ID,
		"anchorId": this.anchorId,
		"accessIndex": this.accessIndex,
		"maxDistResourceSquare": this.maxDistResourceSquare,
		"constructing": this.constructing,
		"gatherers": this.gatherers,
		"neededDefenders": this.neededDefenders,
		"territoryIndices": this.territoryIndices,
		"timeNextIdleCheck": this.timeNextIdleCheck
	};
};

BaseManager.prototype.Deserialize = function(gameState, data)
{
	for (const key in data)
		this[key] = data[key];

	this.anchor = this.anchorId !== undefined ? gameState.getEntityById(this.anchorId) : undefined;
};
