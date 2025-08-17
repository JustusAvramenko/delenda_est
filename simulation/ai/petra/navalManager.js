import * as filters from "simulation/ai/common-api/filters.js";
import { SquareVectorDistance, warn as aiWarn } from "simulation/ai/common-api/utils.js";
import { gatherTreasure, getLandAccess, getSeaAccess, isSiegeUnit, setSeaAccess } from
	"simulation/ai/petra/entityExtend.js";
import { ConstructionPlan } from "simulation/ai/petra/queueplanBuilding.js";
import { TrainingPlan } from "simulation/ai/petra/queueplanTraining.js";
import { TransportPlan } from "simulation/ai/petra/transportPlan.js";
import { Worker } from "simulation/ai/petra/worker.js";

/**
 * Naval Manager
 * Will deal with anything ships.
 * -Basically trade over water (with fleets and goals commissioned by the economy manager)
 * -Defense over water (commissioned by the defense manager)
 * -Transport of units over water (a few units).
 * -Scouting, ultimately.
 * Also deals with handling docks, making sure we have access and stuffs like that.
 */
export function NavalManager(Config)
{
	this.Config = Config;

	// ship subCollections. Also exist for land zones, idem, not caring.
	this.seaShips = [];
	this.seaTransportShips = [];
	this.seaWarShips = [];
	this.seaFishShips = [];

	// wanted NB per zone.
	this.wantedTransportShips = [];
	this.wantedWarShips = [];
	this.wantedFishShips = [];
	// needed NB per zone.
	this.neededTransportShips = [];
	this.neededWarShips = [];

	this.transportPlans = [];

	// shore-line regions where we can load and unload units
	this.landingZones = {};
}

/** More initialisation for stuff that needs the gameState */
NavalManager.prototype.init = function(gameState, deserializing)
{
	// docks
	this.docks = gameState.getOwnStructures().filter(filters.byClasses(["Dock", "Shipyard"]));
	this.docks.registerUpdates();

	this.ships = gameState.getOwnUnits().filter(filters.and(filters.byClass("Ship"),
		filters.not(filters.byMetadata(PlayerID, "role", Worker.ROLE_TRADER))));
	// note: those two can overlap (some transport ships are warships too and vice-versa).
	this.transportShips = this.ships.filter(filters.and(filters.byCanGarrison(),
		filters.not(filters.byClass("FishingBoat"))));
	this.warShips = this.ships.filter(filters.byClass("Warship"));
	this.fishShips = this.ships.filter(filters.byClass("FishingBoat"));

	this.ships.registerUpdates();
	this.transportShips.registerUpdates();
	this.warShips.registerUpdates();
	this.fishShips.registerUpdates();

	const availableFishes = {};
	for (const fish of gameState.getFishableSupplies().values())
	{
		const sea = this.getFishSea(gameState, fish);
		if (sea && availableFishes[sea])
			availableFishes[sea] += fish.resourceSupplyAmount();
		else if (sea)
			availableFishes[sea] = fish.resourceSupplyAmount();
	}

	for (let i = 0; i < gameState.ai.accessibility.regionSize.length; ++i)
	{
		if (!gameState.ai.HQ.navalRegions[i])
		{
			// push dummies
			this.seaShips.push(undefined);
			this.seaTransportShips.push(undefined);
			this.seaWarShips.push(undefined);
			this.seaFishShips.push(undefined);
			this.wantedTransportShips.push(0);
			this.wantedWarShips.push(0);
			this.wantedFishShips.push(0);
			this.neededTransportShips.push(0);
			this.neededWarShips.push(0);
		}
		else
		{
			let collec = this.ships.filter(filters.byMetadata(PlayerID, "sea", i));
			collec.registerUpdates();
			this.seaShips.push(collec);
			collec = this.transportShips.filter(filters.byMetadata(PlayerID, "sea", i));
			collec.registerUpdates();
			this.seaTransportShips.push(collec);
			collec = this.warShips.filter(filters.byMetadata(PlayerID, "sea", i));
			collec.registerUpdates();
			this.seaWarShips.push(collec);
			collec = this.fishShips.filter(filters.byMetadata(PlayerID, "sea", i));
			collec.registerUpdates();
			this.seaFishShips.push(collec);
			this.wantedTransportShips.push(0);
			this.wantedWarShips.push(0);
			if (availableFishes[i] && availableFishes[i] > 1000)
				this.wantedFishShips.push(this.Config.Economy.targetNumFishers);
			else
				this.wantedFishShips.push(0);
			this.neededTransportShips.push(0);
			this.neededWarShips.push(0);
		}
	}

	if (deserializing)
		return;

	// determination of the possible landing zones
	const width = gameState.getPassabilityMap().width;
	const length = width * gameState.getPassabilityMap().height;
	for (let i = 0; i < length; ++i)
	{
		const land = gameState.ai.accessibility.landPassMap[i];
		if (land < 2)
			continue;
		const naval = gameState.ai.accessibility.navalPassMap[i];
		if (naval < 2)
			continue;
		if (!this.landingZones[land])
			this.landingZones[land] = {};
		if (!this.landingZones[land][naval])
			this.landingZones[land][naval] = new Set();
		this.landingZones[land][naval].add(i);
	}
	// and keep only thoses with enough room around when possible
	for (const land in this.landingZones)
	{
		for (const sea in this.landingZones[land])
		{
			const landing = this.landingZones[land][sea];
			const nbaround = {};
			let nbcut = 0;
			for (const i of landing)
			{
				let nb = 0;
				if (landing.has(i-1))
					nb++;
				if (landing.has(i+1))
					nb++;
				if (landing.has(i+width))
					nb++;
				if (landing.has(i-width))
					nb++;
				nbaround[i] = nb;
				nbcut = Math.max(nb, nbcut);
			}
			nbcut = Math.min(2, nbcut);
			for (const i of landing)
			{
				if (nbaround[i] < nbcut)
					landing.delete(i);
			}
		}
	}

	// Assign our initial docks and ships
	for (const ship of this.ships.values())
		setSeaAccess(gameState, ship);
	for (const dock of this.docks.values())
		setSeaAccess(gameState, dock);
};

NavalManager.prototype.updateFishingBoats = function(sea, num)
{
	if (this.wantedFishShips[sea])
		this.wantedFishShips[sea] = num;
};

NavalManager.prototype.resetFishingBoats = function(gameState, sea)
{
	if (sea !== undefined)
		this.wantedFishShips[sea] = 0;
	else
		this.wantedFishShips.fill(0);
};

/** Get the sea, cache it if not yet done and check if in opensea */
NavalManager.prototype.getFishSea = function(gameState, fish)
{
	let sea = fish.getMetadata(PlayerID, "sea");
	if (sea)
		return sea;
	const ntry = 4;
	const around = [[-0.7, 0.7], [0, 1], [0.7, 0.7], [1, 0], [0.7, -0.7], [0, -1], [-0.7, -0.7], [-1, 0]];
	const pos = gameState.ai.accessibility.gamePosToMapPos(fish.position());
	const width = gameState.ai.accessibility.width;
	const k = pos[0] + pos[1]*width;
	sea = gameState.ai.accessibility.navalPassMap[k];
	fish.setMetadata(PlayerID, "sea", sea);
	const radius = 120 / gameState.ai.accessibility.cellSize / ntry;
	if (around.every(a => {
		for (let t = 0; t < ntry; ++t)
		{
			const i = pos[0] + Math.round(a[0]*radius*(ntry-t));
			const j = pos[1] + Math.round(a[1]*radius*(ntry-t));
			if (i < 0 || i >= width || j < 0 || j >= width)
				continue;
			if (gameState.ai.accessibility.landPassMap[i + j*width] === 1)
			{
				const navalPass = gameState.ai.accessibility.navalPassMap[i + j*width];
				if (navalPass == sea)
					return true;
				else if (navalPass == 1)  // we could be outside the map
					continue;
			}
			return false;
		}
		return true;
	}))
		fish.setMetadata(PlayerID, "opensea", true);
	return sea;
};

/** check if we can safely fish at the fish position */
NavalManager.prototype.canFishSafely = function(gameState, fish)
{
	if (fish.getMetadata(PlayerID, "opensea"))
		return true;
	const ntry = 2;
	const around = [[-0.7, 0.7], [0, 1], [0.7, 0.7], [1, 0], [0.7, -0.7], [0, -1], [-0.7, -0.7], [-1, 0]];
	const territoryMap = gameState.ai.HQ.territoryMap;
	const width = territoryMap.width;
	const radius = 120 / territoryMap.cellSize / ntry;
	const pos = territoryMap.gamePosToMapPos(fish.position());
	return around.every(a => {
		for (let t = 0; t < ntry; ++t)
		{
			const i = pos[0] + Math.round(a[0]*radius*(ntry-t));
			const j = pos[1] + Math.round(a[1]*radius*(ntry-t));
			if (i < 0 || i >= width || j < 0 || j >= width)
				continue;
			const owner = territoryMap.getOwnerIndex(i + j*width);
			if (owner != 0 && gameState.isPlayerEnemy(owner))
				return false;
		}
		return true;
	});
};

/** get the list of seas (or lands) around this region not connected by a dock */
NavalManager.prototype.getUnconnectedSeas = function(gameState, region)
{
	const seas = gameState.ai.accessibility.regionLinks[region].slice();
	this.docks.forEach(dock => {
		if (!dock.hasClass("Dock") || getLandAccess(gameState, dock) != region)
			return;
		const i = seas.indexOf(getSeaAccess(gameState, dock));
		if (i != -1)
			seas.splice(i, 1);
	});
	return seas;
};

NavalManager.prototype.checkEvents = function(gameState, queues, events)
{
	for (const evt of events.Create)
	{
		if (!evt.entity)
			continue;
		const ent = gameState.getEntityById(evt.entity);
		if (ent && ent.isOwn(PlayerID) && ent.foundationProgress() !== undefined && ent.hasClasses(["Dock", "Shipyard"]))
			setSeaAccess(gameState, ent);
	}

	for (const evt of events.TrainingFinished)
	{
		if (!evt.entities)
			continue;
		for (const entId of evt.entities)
		{
			const ent = gameState.getEntityById(entId);
			if (!ent || !ent.hasClass("Ship") || !ent.isOwn(PlayerID))
				continue;
			setSeaAccess(gameState, ent);
		}
	}

	for (const evt of events.Destroy)
	{
		if (!evt.entityObj || evt.entityObj.owner() !== PlayerID || !evt.metadata || !evt.metadata[PlayerID])
			continue;
		if (!evt.entityObj.hasClass("Ship") || !evt.metadata[PlayerID].transporter)
			continue;
		const plan = this.getPlan(evt.metadata[PlayerID].transporter);
		if (!plan)
			continue;

		const shipId = evt.entityObj.id();
		if (this.Config.debug > 1)
		{
			aiWarn("one ship " + shipId + " from plan " + plan.ID + " destroyed during " +
				plan.state);
		}
		if (plan.state === TransportPlan.BOARDING)
		{
			// just reset the units onBoard metadata and wait for a new ship to be assigned to this plan
			plan.units.forEach(ent => {
				if (ent.getMetadata(PlayerID, "onBoard") == "onBoard" && ent.position() ||
				    ent.getMetadata(PlayerID, "onBoard") == shipId)
					ent.setMetadata(PlayerID, "onBoard", undefined);
			});
			plan.needTransportShips = !plan.transportShips.hasEntities();
		}
		else if (plan.state === TransportPlan.SAILING)
		{
			const endIndex = plan.endIndex;
			for (const ent of plan.units.values())
			{
				if (!ent.position())  // unit from another ship of this plan ... do nothing
					continue;
				const access = getLandAccess(gameState, ent);
				const endPos = ent.getMetadata(PlayerID, "endPos");
				ent.setMetadata(PlayerID, "transport", undefined);
				ent.setMetadata(PlayerID, "onBoard", undefined);
				ent.setMetadata(PlayerID, "endPos", undefined);
				// nothing else to do if access = endIndex as already at destination
				// otherwise, we should require another transport
				// TODO if attacking and no more ships available, remove the units from the attack
				// to avoid delaying it too much
				if (access != endIndex)
					this.requireTransport(gameState, ent, access, endIndex, endPos);
			}
		}
	}

	for (const evt of events.OwnershipChanged)	// capture events
	{
		if (evt.to !== PlayerID)
			continue;
		const ent = gameState.getEntityById(evt.entity);
		if (ent && ent.hasClasses(["Dock", "Shipyard"]))
			setSeaAccess(gameState, ent);
	}
};


NavalManager.prototype.getPlan = function(ID)
{
	for (const plan of this.transportPlans)
		if (plan.ID === ID)
			return plan;
	return undefined;
};

NavalManager.prototype.addPlan = function(plan)
{
	this.transportPlans.push(plan);
};

/**
 * complete already existing plan or create a new one for this requirement
 * (many units can then call this separately and end up in the same plan)
 * TODO  check garrison classes
 */
NavalManager.prototype.requireTransport = function(gameState, ent, startIndex, endIndex, endPos)
{
	if (!ent.canGarrison())
		return false;

	if (ent.getMetadata(PlayerID, "transport") !== undefined)
	{
		if (this.Config.debug > 0)
		{
			aiWarn("Petra naval manager error: unit " + ent.id() +
				" has already required a transport");
		}
		return false;
	}

	const plans = [];
	for (const plan of this.transportPlans)
	{
		if (plan.startIndex != startIndex || plan.endIndex != endIndex ||
			plan.state !== TransportPlan.BOARDING)
		{
			continue;
		}
		// Limit the number of siege units per transport to avoid problems when ungarrisoning
		if (isSiegeUnit(ent) && plan.units.filter(unit => isSiegeUnit(unit)).length > 3)
			continue;
		plans.push(plan);
	}

	if (plans.length)
	{
		plans.sort(plan => plan.units.length);
		plans[0].addUnit(ent, endPos);
		return true;
	}

	const plan = new TransportPlan(gameState, [ent], startIndex, endIndex, endPos);
	if (plan.failed)
	{
		if (this.Config.debug > 1)
			aiWarn(">>>> transport plan aborted <<<<");
		return false;
	}
	plan.init(gameState);
	this.transportPlans.push(plan);
	return true;
};

/** split a transport plan in two, moving all entities not yet affected to a ship in the new plan */
NavalManager.prototype.splitTransport = function(gameState, plan)
{
	if (this.Config.debug > 1)
		aiWarn(">>>> split of transport plan started <<<<");
	const newplan = new TransportPlan(gameState, [], plan.startIndex, plan.endIndex, plan.endPos);
	if (newplan.failed)
	{
		if (this.Config.debug > 1)
			aiWarn(">>>> split of transport plan aborted <<<<");
		return false;
	}
	newplan.init(gameState);

	for (const ent of plan.needSplit)
	{
		if (ent.getMetadata(PlayerID, "onBoard"))	// Should never happen.
			continue;
		newplan.addUnit(ent, ent.getMetadata(PlayerID, "endPos"));
		plan.units.updateEnt(ent);
	}

	if (newplan.units.length)
		this.transportPlans.push(newplan);
	return newplan.units.length != 0;
};

/**
 * create a transport from a garrisoned ship to a land location
 * needed at start game when starting with a garrisoned ship
 */
NavalManager.prototype.createTransportIfNeeded = function(gameState, fromPos, toPos, toAccess)
{
	const fromAccess = gameState.ai.accessibility.getAccessValue(fromPos);
	if (fromAccess !== 1)
		return;
	if (toAccess < 2)
		return;

	for (const ship of this.ships.values())
	{
		if (!ship.isGarrisonHolder() || !ship.garrisoned().length)
			continue;
		if (ship.getMetadata(PlayerID, "transporter") !== undefined)
			continue;
		const units = [];
		for (const entId of ship.garrisoned())
			units.push(gameState.getEntityById(entId));
		// TODO check that the garrisoned units have not another purpose
		const plan = new TransportPlan(gameState, units, fromAccess, toAccess, toPos, ship);
		if (plan.failed)
			continue;
		plan.init(gameState);
		this.transportPlans.push(plan);
	}
};

// set minimal number of needed ships when a new event (new base or new attack plan)
NavalManager.prototype.setMinimalTransportShips = function(gameState, sea, number)
{
	if (!sea)
		return;
	if (this.wantedTransportShips[sea] < number)
		this.wantedTransportShips[sea] = number;
};

// bumps up the number of ships we want if we need more.
NavalManager.prototype.checkLevels = function(gameState, queues)
{
	if (queues.ships.hasQueuedUnits())
		return;

	for (let sea = 0; sea < this.neededTransportShips.length; sea++)
		this.neededTransportShips[sea] = 0;

	for (const plan of this.transportPlans)
	{
		if (!plan.needTransportShips || plan.units.length < 2)
			continue;
		const sea = plan.sea;
		if (gameState.countOwnQueuedEntitiesWithMetadata("sea", sea) > 0 ||
			this.seaTransportShips[sea].length < this.wantedTransportShips[sea])
			continue;
		++this.neededTransportShips[sea];
		if (this.wantedTransportShips[sea] === 0 || this.seaTransportShips[sea].length < plan.transportShips.length + 2)
		{
			++this.wantedTransportShips[sea];
			return;
		}
	}

	for (let sea = 0; sea < this.neededTransportShips.length; sea++)
		if (this.neededTransportShips[sea] > 2)
			++this.wantedTransportShips[sea];
};

NavalManager.prototype.maintainFleet = function(gameState, queues)
{
	if (queues.ships.hasQueuedUnits())
		return;
	if (!this.docks.filter(filters.isBuilt()).hasEntities())
		return;
	// check if we have enough transport ships per region.
	for (let sea = 0; sea < this.seaShips.length; ++sea)
	{
		if (this.seaShips[sea] === undefined)
			continue;
		if (gameState.countOwnQueuedEntitiesWithMetadata("sea", sea) > 0)
			continue;

		if (this.seaTransportShips[sea].length < this.wantedTransportShips[sea])
		{
			const template = this.getBestShip(gameState, sea, "transport");
			if (template)
			{
				queues.ships.addPlan(new TrainingPlan(gameState, template, { "sea": sea }, 1, 1));
				continue;
			}
		}


		if (this.seaFishShips[sea].length < this.wantedFishShips[sea])
		{
			const template = this.getBestShip(gameState, sea, "fishing");
			if (template)
			{
				queues.ships.addPlan(new TrainingPlan(gameState, template,
					{ "base": 0, "role": Worker.ROLE_WORKER, "sea": sea }, 1, 1));
				continue;
			}
		}
	}
};

/** assigns free ships to plans that need some */
NavalManager.prototype.assignShipsToPlans = function(gameState)
{
	for (const plan of this.transportPlans)
		if (plan.needTransportShips)
			plan.assignShip(gameState);
};

/** Return true if this ship is likeky (un)garrisoning units */
NavalManager.prototype.isShipBoarding = function(ship)
{
	if (!ship.position())
		return false;
	const plan = this.getPlan(ship.getMetadata(PlayerID, "transporter"));
	if (!plan || !plan.boardingPos[ship.id()])
		return false;
	return SquareVectorDistance(plan.boardingPos[ship.id()], ship.position()) < plan.boardingRange;
};

/** let blocking ships move apart from active ships (waiting for a better pathfinder)
 * TODO Ships entity collections are currently in two parts as the trader ships are dealt with
 * in the tradeManager. That should be modified to avoid dupplicating all the code here.
 */
NavalManager.prototype.moveApart = function(gameState)
{
	const blockedShips = [];
	const blockedIds = [];

	for (const ship of this.ships.values())
	{
		const shipPosition = ship.position();
		if (!shipPosition)
			continue;
		if (ship.getMetadata(PlayerID, "transporter") !== undefined && this.isShipBoarding(ship))
			continue;

		const unitAIState = ship.unitAIState();
		if (ship.getMetadata(PlayerID, "transporter") !== undefined ||
		    unitAIState == "INDIVIDUAL.GATHER.APPROACHING" ||
		    unitAIState == "INDIVIDUAL.GATHER.RETURNINGRESOURCE.APPROACHING")
		{
			const previousPosition = ship.getMetadata(PlayerID, "previousPosition");
			if (!previousPosition || previousPosition[0] != shipPosition[0] ||
			                         previousPosition[1] != shipPosition[1])
			{
				ship.setMetadata(PlayerID, "previousPosition", shipPosition);
				ship.setMetadata(PlayerID, "turnPreviousPosition", gameState.ai.playedTurn);
				continue;
			}
			// New transport ships receive boarding commands only on the following turn.
			if (gameState.ai.playedTurn < ship.getMetadata(PlayerID, "turnPreviousPosition") + 2)
				continue;
			ship.moveToRange(shipPosition[0] + randFloat(-1, 1), shipPosition[1] + randFloat(-1, 1), 30, 35);
			blockedShips.push(ship);
			blockedIds.push(ship.id());
		}
		else if (ship.isIdle())
		{
			const previousIdlePosition = ship.getMetadata(PlayerID, "previousIdlePosition");
			if (!previousIdlePosition || previousIdlePosition[0] != shipPosition[0] ||
			                             previousIdlePosition[1] != shipPosition[1])
			{
				ship.setMetadata(PlayerID, "previousIdlePosition", shipPosition);
				ship.setMetadata(PlayerID, "stationnary", undefined);
				continue;
			}
			if (ship.getMetadata(PlayerID, "stationnary"))
				continue;
			ship.setMetadata(PlayerID, "stationnary", true);
			// Check if there are some treasure around
			if (gatherTreasure(gameState, ship, true))
				continue;
			// Do not stay idle near a dock to not disturb other ships
			const sea = ship.getMetadata(PlayerID, "sea");
			for (const dock of
				gameState.getAllyStructures().filter(filters.byClass("Dock")).values())
			{
				if (getSeaAccess(gameState, dock) != sea)
					continue;
				if (SquareVectorDistance(shipPosition, dock.position()) > 4900)
					continue;
				ship.moveToRange(dock.position()[0], dock.position()[1], 70, 75);
			}

		}
	}

	for (const ship of gameState.ai.HQ.tradeManager.traders.filter(filters.byClass("Ship")).values())
	{
		const shipPosition = ship.position();
		if (!shipPosition)
			continue;
		const role = ship.getMetadata(PlayerID, "role");
		if (role === undefined || role !== Worker.ROLE_TRADER)	// already accounted before
			continue;

		const unitAIState = ship.unitAIState();
		if (unitAIState == "INDIVIDUAL.TRADE.APPROACHINGMARKET")
		{
			const previousPosition = ship.getMetadata(PlayerID, "previousPosition");
			if (!previousPosition || previousPosition[0] != shipPosition[0] ||
			                         previousPosition[1] != shipPosition[1])
			{
				ship.setMetadata(PlayerID, "previousPosition", shipPosition);
				ship.setMetadata(PlayerID, "turnPreviousPosition", gameState.ai.playedTurn);
				continue;
			}
			// New transport ships receives boarding commands only on the following turn.
			if (gameState.ai.playedTurn < ship.getMetadata(PlayerID, "turnPreviousPosition") + 2)
				continue;
			ship.moveToRange(shipPosition[0] + randFloat(-1, 1), shipPosition[1] + randFloat(-1, 1), 30, 35);
			blockedShips.push(ship);
			blockedIds.push(ship.id());
		}
		else if (ship.isIdle())
		{
			const previousIdlePosition = ship.getMetadata(PlayerID, "previousIdlePosition");
			if (!previousIdlePosition || previousIdlePosition[0] != shipPosition[0] ||
			                             previousIdlePosition[1] != shipPosition[1])
			{
				ship.setMetadata(PlayerID, "previousIdlePosition", shipPosition);
				ship.setMetadata(PlayerID, "stationnary", undefined);
				continue;
			}
			if (ship.getMetadata(PlayerID, "stationnary"))
				continue;
			ship.setMetadata(PlayerID, "stationnary", true);
			// Check if there are some treasure around
			if (gatherTreasure(gameState, ship, true))
				continue;
			// Do not stay idle near a dock to not disturb other ships
			const sea = ship.getMetadata(PlayerID, "sea");
			for (const dock of gameState.getAllyStructures().filter(filters.byClass("Dock")).values())
			{
				if (getSeaAccess(gameState, dock) != sea)
					continue;
				if (SquareVectorDistance(shipPosition, dock.position()) > 4900)
					continue;
				ship.moveToRange(dock.position()[0], dock.position()[1], 70, 75);
			}
		}
	}

	for (const ship of blockedShips)
	{
		const shipPosition = ship.position();
		const sea = ship.getMetadata(PlayerID, "sea");
		for (const blockingShip of this.seaShips[sea].values())
		{
			if (blockedIds.indexOf(blockingShip.id()) != -1 || !blockingShip.position())
				continue;
			const distSquare = SquareVectorDistance(shipPosition, blockingShip.position());
			const unitAIState = blockingShip.unitAIState();
			if (blockingShip.getMetadata(PlayerID, "transporter") === undefined &&
			    unitAIState != "INDIVIDUAL.GATHER.APPROACHING" &&
			    unitAIState != "INDIVIDUAL.GATHER.RETURNINGRESOURCE.APPROACHING")
			{
				if (distSquare < 1600)
					blockingShip.moveToRange(shipPosition[0], shipPosition[1], 40, 45);
			}
			else if (distSquare < 900)
				blockingShip.moveToRange(shipPosition[0], shipPosition[1], 30, 35);
		}

		for (const blockingShip of
			gameState.ai.HQ.tradeManager.traders.filter(filters.byClass("Ship")).values())
		{
			if (blockingShip.getMetadata(PlayerID, "sea") != sea)
				continue;
			if (blockedIds.indexOf(blockingShip.id()) != -1 || !blockingShip.position())
				continue;
			const role = blockingShip.getMetadata(PlayerID, "role");
			if (role === undefined || role !== Worker.ROLE_TRADER)	// already accounted before
				continue;
			const distSquare = SquareVectorDistance(shipPosition, blockingShip.position());
			const unitAIState = blockingShip.unitAIState();
			if (unitAIState != "INDIVIDUAL.TRADE.APPROACHINGMARKET")
			{
				if (distSquare < 1600)
					blockingShip.moveToRange(shipPosition[0], shipPosition[1], 40, 45);
			}
			else if (distSquare < 900)
				blockingShip.moveToRange(shipPosition[0], shipPosition[1], 30, 35);
		}
	}
};

NavalManager.prototype.buildNavalStructures = function(gameState, queues)
{
	if (!gameState.ai.HQ.navalMap || !gameState.ai.HQ.hasPotentialBase())
		return;

	if (gameState.ai.HQ.getAccountedPopulation(gameState) > this.Config.Economy.popForDock)
	{
		if (queues.dock.countQueuedUnitsWithClass("Dock") === 0 &&
			!gameState.getOwnStructures().filter(filters.and(filters.byClass("Dock"),
				filters.isFoundation())).hasEntities() &&
			gameState.ai.HQ.canBuild(gameState, "structures/{civ}/dock"))
		{
			let dockStarted = false;
			for (const base of gameState.ai.HQ.baseManagers())
			{
				if (dockStarted)
					break;
				if (!base.anchor || base.constructing)
					continue;
				const remaining = this.getUnconnectedSeas(gameState, base.accessIndex);
				for (const sea of remaining)
				{
					if (!gameState.ai.HQ.navalRegions[sea])
						continue;
					const wantedLand = {};
					wantedLand[base.accessIndex] = true;
					queues.dock.addPlan(new ConstructionPlan(gameState, "structures/{civ}/dock",
						{ "land": wantedLand, "sea": sea }));
					dockStarted = true;
					break;
				}
			}
		}
	}

	if (gameState.currentPhase() < 2 || gameState.ai.HQ.getAccountedPopulation(gameState) < this.Config.Economy.popPhase2 + 15 ||
	    queues.militaryBuilding.hasQueuedUnits())
		return;
	if (!this.docks.filter(filters.byClass("Dock")).hasEntities() ||
		this.docks.filter(filters.byClass("Shipyard")).hasEntities())
	{
		return;
	}
	// Use in priority resources to build a Market.
	if (!gameState.getOwnEntitiesByClass("Market", true).hasEntities() &&
	    gameState.ai.HQ.canBuild(gameState, "structures/{civ}/market"))
		return;
	let template;
	if (gameState.ai.HQ.canBuild(gameState, "structures/{civ}/super_dock"))
		template = "structures/{civ}/super_dock";
	else if (gameState.ai.HQ.canBuild(gameState, "structures/{civ}/shipyard"))
		template = "structures/{civ}/shipyard";
	else
		return;
	const wantedLand = {};
	for (const base of gameState.ai.HQ.baseManagers())
		if (base.anchor)
			wantedLand[base.accessIndex] = true;
	const sea = this.docks.toEntityArray()[0].getMetadata(PlayerID, "sea");
	queues.militaryBuilding.addPlan(
		new ConstructionPlan(gameState, template, { "land": wantedLand, "sea": sea }));
};

/** goal can be either attack (choose ship with best arrowCount) or transport (choose ship with best capacity) */
NavalManager.prototype.getBestShip = function(gameState, sea, goal)
{
	const civ = gameState.getPlayerCiv();
	const trainableShips = [];
	gameState.getOwnTrainingFacilities().filter(filters.byMetadata(PlayerID, "sea", sea)).forEach(
		function(ent) {
			const trainables = ent.trainableEntities(civ);
			for (const trainable of trainables)
			{
				if (gameState.isTemplateDisabled(trainable))
					continue;
				const template = gameState.getTemplate(trainable);
				if (template && template.hasClass("Ship") && trainableShips.indexOf(trainable) === -1)
					trainableShips.push(trainable);
			}
		});

	let best = 0;
	let bestShip;
	const limits = gameState.getEntityLimits();
	const current = gameState.getEntityCounts();
	for (const trainable of trainableShips)
	{
		const template = gameState.getTemplate(trainable);
		if (!template.available(gameState))
			continue;

		const category = template.trainingCategory();
		if (category && limits[category] && current[category] >= limits[category])
			continue;

		const arrows = +(template.getDefaultArrow() || 0);
		if (goal === "attack")    // choose the maximum default arrows
		{
			if (best > arrows)
				continue;
			best = arrows;
		}
		else if (goal === "transport")   // choose the maximum capacity, with a bonus if arrows or if siege transport
		{
			let capacity = +(template.garrisonMax() || 0);
			if (capacity < 2)
				continue;
			capacity += 10*arrows;
			if (MatchesClassList(template.garrisonableClasses(), "Siege"))
				capacity += 50;
			if (best > capacity)
				continue;
			best = capacity;
		}
		else if (goal === "fishing")
			if (!template.hasClass("FishingBoat"))
				continue;
		bestShip = trainable;
	}
	return bestShip;
};

NavalManager.prototype.update = function(gameState, queues, events)
{
	Engine.ProfileStart("Naval Manager update");

	// close previous transport plans if finished
	for (let i = 0; i < this.transportPlans.length; ++i)
	{
		const remaining = this.transportPlans[i].update(gameState);
		if (remaining)
			continue;
		if (this.Config.debug > 1)
			aiWarn("no more units on transport plan " + this.transportPlans[i].ID);
		this.transportPlans[i].releaseAll();
		this.transportPlans.splice(i--, 1);
	}
	// assign free ships to plans which need them
	this.assignShipsToPlans(gameState);

	// and require for more ships/structures if needed
	if (gameState.ai.playedTurn % 3 === 0)
	{
		this.checkLevels(gameState, queues);
		this.maintainFleet(gameState, queues);
		this.buildNavalStructures(gameState, queues);
	}
	// let inactive ships move apart from active ones (waiting for a better pathfinder)
	this.moveApart(gameState);

	Engine.ProfileStop();
};

NavalManager.prototype.Serialize = function()
{
	const properties = {
		"wantedTransportShips": this.wantedTransportShips,
		"wantedWarShips": this.wantedWarShips,
		"wantedFishShips": this.wantedFishShips,
		"neededTransportShips": this.neededTransportShips,
		"neededWarShips": this.neededWarShips,
		"landingZones": this.landingZones
	};

	const transports = {};
	for (const plan in this.transportPlans)
		transports[plan] = this.transportPlans[plan].Serialize();

	return { "properties": properties, "transports": transports };
};

NavalManager.prototype.Deserialize = function(gameState, data)
{
	for (const key in data.properties)
		this[key] = data.properties[key];

	this.transportPlans = [];
	for (const i in data.transports)
	{
		const dataPlan = data.transports[i];
		const plan = new TransportPlan(gameState, [], dataPlan.startIndex, dataPlan.endIndex, dataPlan.endPos);
		plan.Deserialize(dataPlan);
		plan.init(gameState);
		this.transportPlans.push(plan);
	}
};
