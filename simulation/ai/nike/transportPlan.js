import * as filters from "simulation/ai/common-api/filters.js";
import { SquareVectorDistance, VectorDistance, aiWarn } from "simulation/ai/common-api/utils.js";
import { getLandAccess } from "simulation/ai/nike/entityExtend.js";
import { Worker } from "simulation/ai/nike/worker.js";

/**
 * Describes a transport plan
 * Constructor assign units (units is an ID array), a destination (position).
 * The naval manager will try to deal with it accordingly.
 *
 * By this I mean that the naval manager will find how to go from access point 1 to access point 2
 * and then carry units from there.
 *
 * Note: only assign it units currently over land, or it won't work.
 * Also: destination should probably be land, otherwise the units will be lost at sea.
 *
 * metadata for units:
 *   transport = this.ID
 *   onBoard = ship.id() when affected to a ship but not yet garrisoned
 *           = "onBoard" when garrisoned in a ship
 *           = undefined otherwise
 *   endPos  = position of destination
 *
 *   metadata for ships
 *   transporter = this.ID
 */

export class TransportPlan
{
	constructor(gameState, units, startIndex, endIndex, endPos, ship)
	{
		this.ID = gameState.ai.uniqueIDs.transports++;
		this.debug = gameState.ai.Config.debug;
		this.flotilla = false;   // when false, only one ship per transport ... not yet tested when true

		this.endPos = endPos;
		this.endIndex = endIndex;
		this.startIndex = startIndex;
		// TODO only cases with land-sea-land are allowed for the moment
		// we could also have land-sea-land-sea-land
		if (startIndex == 1)
		{
			// special transport from already garrisoned ship
			if (!ship)
			{
				this.failed = true;
				return false;
			}
			this.sea = ship.getMetadata(PlayerID, "sea");
			ship.setMetadata(PlayerID, "transporter", this.ID);
			ship.setStance("none");
			for (const ent of units)
				ent.setMetadata(PlayerID, "onBoard", "onBoard");
		}
		else
		{
			this.sea = gameState.ai.HQ.getSeaBetweenIndices(gameState, startIndex, endIndex);
			if (!this.sea)
			{
				this.failed = true;
				if (this.debug > 1)
				{
					aiWarn("transport plan with bad path: startIndex " + startIndex + " endIndex " +
						endIndex);
				}
				return false;
			}
		}

		for (const ent of units)
		{
			ent.setMetadata(PlayerID, "transport", this.ID);
			ent.setMetadata(PlayerID, "endPos", endPos);
		}

		if (this.debug > 1)
		{
			aiWarn("Starting a new transport plan with ID " + this.ID + " to index " + endIndex +
				" with units length " + units.length);
		}

		this.state = TransportPlan.BOARDING;
		this.boardingPos = {};
		this.needTransportShips = ship === undefined;
		this.nTry = {};
		return true;
	}

	/**
	 * We're trying to board units onto our ships.
	 */
	static BOARDING = "boarding";
	/**
	 * We're moving ships and eventually unload units.
	 */
	static SAILING = "sailing";

	init(gameState)
	{
		this.units = gameState.getOwnUnits().filter(filters.byMetadata(PlayerID, "transport", this.ID));
		this.ships = gameState.ai.HQ.navalManager.ships.filter(filters.byMetadata(PlayerID, "transporter",
			this.ID));
		this.transportShips = gameState.ai.HQ.navalManager.transportShips.filter(filters.byMetadata(PlayerID,
			"transporter", this.ID));

		this.units.registerUpdates();
		this.ships.registerUpdates();
		this.transportShips.registerUpdates();

		this.boardingRange = 18*18;	// TODO compute it from the ship clearance and garrison range
	}

	/** count available slots */
	countFreeSlots()
	{
		let slots = 0;
		for (const ship of this.transportShips.values())
			slots += this.countFreeSlotsOnShip(ship);
		return slots;
	}

	countFreeSlotsOnShip(ship)
	{
		if (ship.hitpoints() < ship.garrisonEjectHealth() * ship.maxHitpoints())
			return 0;
		const occupied = ship.garrisoned().length +
			this.units.filter(filters.byMetadata(PlayerID, "onBoard", ship.id())).length;
		return Math.max(ship.garrisonMax() - occupied, 0);
	}

	assignUnitToShip(gameState, ent)
	{
		if (this.needTransportShips)
			return;

		for (const ship of this.transportShips.values())
		{
			if (this.countFreeSlotsOnShip(ship) == 0)
				continue;
			ent.setMetadata(PlayerID, "onBoard", ship.id());
			if (this.debug > 1)
			{
				if (ent.getMetadata(PlayerID, "role") === Worker.ROLE_ATTACK)
					Engine.PostCommand(PlayerID, { "type": "set-shading-color", "entities": [ent.id()], "rgb": [2, 0, 0] });
				else
					Engine.PostCommand(PlayerID, { "type": "set-shading-color", "entities": [ent.id()], "rgb": [0, 2, 0] });
			}
			return;
		}

		if (this.flotilla)
		{
			this.needTransportShips = true;
			return;
		}

		if (!this.needSplit)
			this.needSplit = [ent];
		else
			this.needSplit.push(ent);
	}

	assignShip(gameState)
	{
		let pos;
		// choose a unit of this plan not yet assigned to a ship
		for (const ent of this.units.values())
		{
			if (!ent.position() || ent.getMetadata(PlayerID, "onBoard") !== undefined)
				continue;
			pos = ent.position();
			break;
		}
		// and choose the nearest available ship from this unit
		let distmin = Math.min();
		let nearest;
		gameState.ai.HQ.navalManager.seaTransportShips[this.sea].forEach(ship =>
		{
			if (ship.getMetadata(PlayerID, "transporter"))
				return;
			if (pos)
			{
				const dist = SquareVectorDistance(pos, ship.position());
				if (dist > distmin)
					return;
				distmin = dist;
				nearest = ship;
			}
			else if (!nearest)
				nearest = ship;
		});
		if (!nearest)
			return false;

		nearest.setMetadata(PlayerID, "transporter", this.ID);
		nearest.setStance("none");
		this.ships.updateEnt(nearest);
		this.transportShips.updateEnt(nearest);
		this.needTransportShips = false;
		return true;
	}

	/** add a unit to this plan */
	addUnit(unit, endPos)
	{
		unit.setMetadata(PlayerID, "transport", this.ID);
		unit.setMetadata(PlayerID, "endPos", endPos);
		this.units.updateEnt(unit);
	}

	/** remove a unit from this plan, if not yet on board */
	removeUnit(gameState, unit)
	{
		const shipId = unit.getMetadata(PlayerID, "onBoard");
		if (shipId == "onBoard")
			return;			// too late, already onBoard
		else if (shipId !== undefined)
			unit.stopMoving();	// cancel the garrison order
		unit.setMetadata(PlayerID, "transport", undefined);
		unit.setMetadata(PlayerID, "endPos", undefined);
		this.units.updateEnt(unit);
		if (shipId)
		{
			unit.setMetadata(PlayerID, "onBoard", undefined);
			const ship = gameState.getEntityById(shipId);
			if (ship && !ship.garrisoned().length &&
				!this.units.filter(filters.byMetadata(PlayerID, "onBoard", shipId)).length)
			{
				this.releaseShip(ship);
				this.ships.updateEnt(ship);
				this.transportShips.updateEnt(ship);
			}
		}
	}

	releaseShip(ship)
	{
		if (ship.getMetadata(PlayerID, "transporter") != this.ID)
		{
			aiWarn(" Nike: try removing a transporter ship with " +
				ship.getMetadata(PlayerID, "transporter") + " from " + this.ID + " and stance " +
				ship.getStance());
			return;
		}

		const defaultStance = ship.get("UnitAI/DefaultStance");
		if (defaultStance)
			ship.setStance(defaultStance);

		ship.setMetadata(PlayerID, "transporter", undefined);
		if (ship.getMetadata(PlayerID, "role") === Worker.ROLE_SWITCH_TO_TRADER)
			ship.setMetadata(PlayerID, "role", Worker.ROLE_TRADER);
	}

	releaseAll()
	{
		for (const ship of this.ships.values())
			this.releaseShip(ship);

		for (const ent of this.units.values())
		{
			ent.setMetadata(PlayerID, "endPos", undefined);
			ent.setMetadata(PlayerID, "onBoard", undefined);
			ent.setMetadata(PlayerID, "transport", undefined);
			// TODO if the index of the endPos of the entity is !=,
			// require again another transport (we could need land-sea-land-sea-land)
		}

		this.transportShips.unregister();
		this.ships.unregister();
		this.units.unregister();
	}

	/** TODO not currently used ... to be fixed */
	cancelTransport(gameState)
	{
		const ent = this.units.toEntityArray()[0];
		let base = gameState.ai.HQ.getBaseByID(ent.getMetadata(PlayerID, "base"));
		if (!base.anchor || !base.anchor.position())
		{
			for (const newbase of gameState.ai.HQ.baseManagers())
			{
				if (!newbase.anchor || !newbase.anchor.position())
					continue;
				ent.setMetadata(PlayerID, "base", newbase.ID);
				base = newbase;
				break;
			}
			if (!base.anchor || !base.anchor.position())
				return false;
			this.units.forEach(unit => { unit.setMetadata(PlayerID, "base", base.ID); });
		}
		this.endIndex = this.startIndex;
		this.endPos = base.anchor.position();
		this.canceled = true;
		return true;
	}


	/**
	 * Try to move on and then clear the plan.
	 */
	update(gameState)
	{
		if (this.state === TransportPlan.BOARDING)
			this.onBoarding(gameState);
		else if (this.state === TransportPlan.SAILING)
			this.onSailing(gameState);

		return this.units.length;
	}

	onBoarding(gameState)
	{
		let ready = true;
		const time = gameState.ai.elapsedTime;
		const shipTested = {};

		for (const ent of this.units.values())
		{
			if (!ent.getMetadata(PlayerID, "onBoard"))
			{
				ready = false;
				this.assignUnitToShip(gameState, ent);
				if (ent.getMetadata(PlayerID, "onBoard"))
				{
					const shipId = ent.getMetadata(PlayerID, "onBoard");
					const ship = gameState.getEntityById(shipId);
					if (!this.boardingPos[shipId])
					{
						this.boardingPos[shipId] = this.getBoardingPos(gameState, ship, this.startIndex, this.sea, ent.position(), false);
						ship.move(this.boardingPos[shipId][0], this.boardingPos[shipId][1]);
						ship.setMetadata(PlayerID, "timeGarrison", time);
					}
					ent.garrison(ship);
					ent.setMetadata(PlayerID, "timeGarrison", time);
					ent.setMetadata(PlayerID, "posGarrison", ent.position());
				}
			}
			else if (ent.getMetadata(PlayerID, "onBoard") != "onBoard" && !this.isOnBoard(ent))
			{
				ready = false;
				const shipId = ent.getMetadata(PlayerID, "onBoard");
				const ship = gameState.getEntityById(shipId);
				if (!ship)    // the ship must have been destroyed
				{
					ent.setMetadata(PlayerID, "onBoard", undefined);
					continue;
				}
				const distShip = SquareVectorDistance(this.boardingPos[shipId], ship.position());
				if (!shipTested[shipId] && distShip > this.boardingRange)
				{
					shipTested[shipId] = true;
					let retry = false;
					const unitAIState = ship.unitAIState();
					if (unitAIState == "INDIVIDUAL.WALKING" ||
					    unitAIState == "INDIVIDUAL.PICKUP.APPROACHING")
					{
						if (time - ship.getMetadata(PlayerID, "timeGarrison") > 2)
						{
							const oldPos = ent.getMetadata(PlayerID, "posGarrison");
							const newPos = ent.position();
							if (oldPos[0] == newPos[0] && oldPos[1] == newPos[1])
								retry = true;
							ent.setMetadata(PlayerID, "posGarrison", newPos);
							ent.setMetadata(PlayerID, "timeGarrison", time);
						}
					}

					else if (unitAIState != "INDIVIDUAL.PICKUP.LOADING" &&
						   time - ship.getMetadata(PlayerID, "timeGarrison") > 5 ||
						   time - ship.getMetadata(PlayerID, "timeGarrison") > 8)
					{
						retry = true;
						ent.setMetadata(PlayerID, "timeGarrison", time);
					}

					if (retry)
					{
						if (!this.nTry[shipId])
							this.nTry[shipId] = 1;
						else
							++this.nTry[shipId];
						if (this.nTry[shipId] > 1)	// we must have been blocked by something ... try with another boarding point
						{
							this.nTry[shipId] = 0;
							if (this.debug > 1)
								aiWarn("ship " + shipId + " new attempt for a landing point ");
							this.boardingPos[shipId] = this.getBoardingPos(gameState, ship, this.startIndex, this.sea, undefined, false);
						}
						ship.move(this.boardingPos[shipId][0], this.boardingPos[shipId][1]);
						ship.setMetadata(PlayerID, "timeGarrison", time);
					}
				}

				if (time - ent.getMetadata(PlayerID, "timeGarrison") > 2)
				{
					const oldPos = ent.getMetadata(PlayerID, "posGarrison");
					const newPos = ent.position();
					if (oldPos[0] == newPos[0] && oldPos[1] == newPos[1])
					{
						if (distShip < this.boardingRange)	// looks like we are blocked ... try to go out of this trap
						{
							if (!this.nTry[ent.id()])
								this.nTry[ent.id()] = 1;
							else
								++this.nTry[ent.id()];
							if (this.nTry[ent.id()] > 5)
							{
								if (this.debug > 1)
								{
									aiWarn("unit blocked, but no ways out of the trap ... " +
										"destroy it");
								}
								this.resetUnit(gameState, ent);
								ent.destroy();
								continue;
							}
							if (this.nTry[ent.id()] > 1)
								ent.moveToRange(newPos[0], newPos[1], 30, 35);
							ent.garrison(ship, true);
						}
						else if (SquareVectorDistance(this.boardingPos[shipId], newPos) > 225)
							ent.moveToRange(this.boardingPos[shipId][0], this.boardingPos[shipId][1], 0, 15);
					}
					else
						this.nTry[ent.id()] = 0;
					ent.setMetadata(PlayerID, "timeGarrison", time);
					ent.setMetadata(PlayerID, "posGarrison", ent.position());
				}
			}
		}

		if (this.needSplit)
		{
			gameState.ai.HQ.navalManager.splitTransport(gameState, this);
			this.needSplit = undefined;
		}

		if (!ready)
			return;

		for (const ship of this.ships.values())
		{
			this.boardingPos[ship.id()] = undefined;
			this.boardingPos[ship.id()] = this.getBoardingPos(gameState, ship, this.endIndex, this.sea, this.endPos, true);
			ship.move(this.boardingPos[ship.id()][0], this.boardingPos[ship.id()][1]);
		}
		this.state = TransportPlan.SAILING;
		this.nTry = {};
		this.unloaded = [];
		this.recovered = [];
	}

	/** tell if a unit is garrisoned in one of the ships of this plan, and update its metadata if yes */
	isOnBoard(ent)
	{
		for (const ship of this.transportShips.values())
		{
			if (ship.garrisoned().indexOf(ent.id()) == -1)
				continue;
			ent.setMetadata(PlayerID, "onBoard", "onBoard");
			return true;
		}
		return false;
	}

	/** when avoidEnnemy is true, we try to not board/unboard in ennemy territory */
	getBoardingPos(gameState, ship, landIndex, seaIndex, destination,
		avoidEnnemy)
	{
		if (!gameState.ai.HQ.navalManager.landingZones[landIndex])
		{
			aiWarn(" >>> no landing zone for land " + landIndex);
			return destination;
		}
		else if (!gameState.ai.HQ.navalManager.landingZones[landIndex][seaIndex])
		{
			aiWarn(" >>> no landing zone for land " + landIndex + " and sea " + seaIndex);
			return destination;
		}

		const startPos = ship.position();
		let distmin = Math.min();
		let posmin = destination;
		const width = gameState.getPassabilityMap().width;
		const cell = gameState.getPassabilityMap().cellSize;
		const alliedDocks = gameState.getAllyStructures().filter(filters.and(filters.byClass("Dock"),
			filters.byMetadata(PlayerID, "sea", seaIndex))).toEntityArray();
		for (const i of gameState.ai.HQ.navalManager.landingZones[landIndex][seaIndex])
		{
			let pos = [i%width+0.5, Math.floor(i/width)+0.5];
			pos = [cell*pos[0], cell*pos[1]];
			let dist = VectorDistance(startPos, pos);
			if (destination)
				dist += VectorDistance(pos, destination);
			if (avoidEnnemy)
			{
				const territoryOwner = gameState.ai.HQ.territoryMap.getOwner(pos);
				if (territoryOwner != 0 && !gameState.isPlayerAlly(territoryOwner))
					dist += 100000000;
			}
			// require a small distance between all ships of the transport plan to avoid path finder problems
			// this is also used when the ship is blocked and we want to find a new boarding point
			for (const shipId in this.boardingPos)
			{
				if (this.boardingPos[shipId] !== undefined &&
					SquareVectorDistance(this.boardingPos[shipId], pos) < this.boardingRange)
				{
					dist += 1000000;
				}
			}
			// and not too near our allied docks to not disturb naval traffic
			let distSquare;
			for (const dock of alliedDocks)
			{
				if (dock.foundationProgress() !== undefined)
					distSquare = 900;
				else
					distSquare = 4900;
				const dockDist = SquareVectorDistance(dock.position(), pos);
				if (dockDist < distSquare)
					dist += 100000 * (distSquare - dockDist) / distSquare;
			}
			if (dist > distmin)
				continue;
			distmin = dist;
			posmin = pos;
		}
		// We should always have either destination or the previous boardingPos defined
		// so let's return this value if everything failed
		if (!posmin && this.boardingPos[ship.id()])
			posmin = this.boardingPos[ship.id()];
		return posmin;
	}

	onSailing(gameState)
	{
		// Check that the units recovered on the previous turn have been reloaded
		for (const recov of this.recovered)
		{
			const ent = gameState.getEntityById(recov.entId);
			if (!ent)  // entity destroyed
				continue;
			if (!ent.position())  // reloading succeeded ... move a bit the ship before trying again
			{
				const ship = gameState.getEntityById(recov.shipId);
				if (ship)
					ship.moveApart(recov.entPos, 15);
				continue;
			}
			if (this.debug > 1)
				aiWarn(">>> transport " + this.ID + " reloading failed ... <<<");
			// destroy the unit if inaccessible otherwise leave it there
			const index = getLandAccess(gameState, ent);
			if (gameState.ai.HQ.landRegions[index])
			{
				if (this.debug > 1)
					aiWarn(" recovered entity kept " + ent.id());
				this.resetUnit(gameState, ent);
				// TODO we should not destroy it, but now the unit could still be reloaded on the next turn
				// and mess everything
				ent.destroy();
			}
			else
			{
				if (this.debug > 1)
					aiWarn("recovered entity destroyed " + ent.id());
				this.resetUnit(gameState, ent);
				ent.destroy();
			}
		}
		this.recovered = [];

		// Check that the units unloaded on the previous turn have been really unloaded and in the right position
		const shipsToMove = {};
		for (const entId of this.unloaded)
		{
			const ent = gameState.getEntityById(entId);
			if (!ent)  // entity destroyed
				continue;
			else if (!ent.position())  // unloading failed
			{
				const ship = gameState.getEntityById(ent.getMetadata(PlayerID, "onBoard"));
				if (ship)
				{
					if (ship.garrisoned().indexOf(entId) != -1)
						ent.setMetadata(PlayerID, "onBoard", "onBoard");
					else
					{
						aiWarn("Nike transportPlan problem: unit not on ship without position ???");
						this.resetUnit(gameState, ent);
						ent.destroy();
					}
				}
				else
				{
					aiWarn("Nike transportPlan problem: unit on ship, but no ship ???");
					this.resetUnit(gameState, ent);
					ent.destroy();
				}
			}
			else if (getLandAccess(gameState, ent) != this.endIndex)
			{
				// unit unloaded on a wrong region - try to regarrison it and move a bit the ship
				if (this.debug > 1)
					aiWarn(">>> unit unloaded on a wrong region ! try to garrison it again <<<");
				const ship = gameState.getEntityById(ent.getMetadata(PlayerID, "onBoard"));
				if (ship && !this.canceled)
				{
					shipsToMove[ship.id()] = ship;
					this.recovered.push({ "entId": ent.id(), "entPos": ent.position(), "shipId": ship.id() });
					ent.garrison(ship);
					ent.setMetadata(PlayerID, "onBoard", "onBoard");
				}
				else
				{
					if (this.debug > 1)
						aiWarn("no way ... we destroy it");
					this.resetUnit(gameState, ent);
					ent.destroy();
				}
			}
			else
			{
				// And make some room for other units
				const pos = ent.position();
				const goal = ent.getMetadata(PlayerID, "endPos");
				const dist = goal ? VectorDistance(pos, goal) : 0;
				if (dist > 30)
					ent.moveToRange(goal[0], goal[1], dist-25, dist-20);
				else
					ent.moveToRange(pos[0], pos[1], 20, 25);
				ent.setMetadata(PlayerID, "transport", undefined);
				ent.setMetadata(PlayerID, "onBoard", undefined);
				ent.setMetadata(PlayerID, "endPos", undefined);
			}
		}
		for (const shipId in shipsToMove)
		{
			this.boardingPos[shipId] = this.getBoardingPos(gameState, shipsToMove[shipId], this.endIndex, this.sea, this.endPos, true);
			shipsToMove[shipId].move(this.boardingPos[shipId][0], this.boardingPos[shipId][1]);
		}
		this.unloaded = [];

		if (this.canceled)
		{
			for (const ship of this.ships.values())
			{
				this.boardingPos[ship.id()] = undefined;
				this.boardingPos[ship.id()] = this.getBoardingPos(gameState, ship, this.endIndex, this.sea, this.endPos, true);
				ship.move(this.boardingPos[ship.id()][0], this.boardingPos[ship.id()][1]);
			}
			this.canceled = undefined;
		}

		for (const ship of this.transportShips.values())
		{
			if (ship.unitAIState() == "INDIVIDUAL.WALKING")
				continue;
			const shipId = ship.id();
			const dist = SquareVectorDistance(ship.position(), this.boardingPos[shipId]);
			let remaining = 0;
			for (const entId of ship.garrisoned())
			{
				const ent = gameState.getEntityById(entId);
				if (!ent.getMetadata(PlayerID, "transport"))
					continue;
				remaining++;
				if (dist < 625)
				{
					ship.unload(entId);
					this.unloaded.push(entId);
					ent.setMetadata(PlayerID, "onBoard", shipId);
				}
			}

			let recovering = 0;
			for (const recov of this.recovered)
				if (recov.shipId == shipId)
					recovering++;

			if (!remaining && !recovering)   // when empty, release the ship and move apart to leave room for other ships. TODO fight
			{
				ship.moveApart(this.boardingPos[shipId], 30);
				this.releaseShip(ship);
				continue;
			}
			if (dist > this.boardingRange)
			{
				if (!this.nTry[shipId])
					this.nTry[shipId] = 1;
				else
					++this.nTry[shipId];
				if (this.nTry[shipId] > 2)	// we must have been blocked by something ... try with another boarding point
				{
					this.nTry[shipId] = 0;
					if (this.debug > 1)
						aiWarn(shipId + " new attempt for a landing point ");
					this.boardingPos[shipId] = this.getBoardingPos(gameState, ship, this.endIndex, this.sea, undefined, true);
				}
				ship.move(this.boardingPos[shipId][0], this.boardingPos[shipId][1]);
			}
		}
	}

	resetUnit(gameState, ent)
	{
		ent.setMetadata(PlayerID, "transport", undefined);
		ent.setMetadata(PlayerID, "onBoard", undefined);
		ent.setMetadata(PlayerID, "endPos", undefined);
		// if from an army or attack, remove it
		if (ent.getMetadata(PlayerID, "plan") !== undefined && ent.getMetadata(PlayerID, "plan") >= 0)
		{
			const attackPlan = gameState.ai.HQ.attackManager.getPlan(ent.getMetadata(PlayerID, "plan"));
			if (attackPlan)
				attackPlan.removeUnit(ent, true);
		}
		if (ent.getMetadata(PlayerID, "PartOfArmy"))
		{
			const army = gameState.ai.HQ.defenseManager.getArmy(ent.getMetadata(PlayerID, "PartOfArmy"));
			if (army)
				army.removeOwn(gameState, ent.id());
		}
	}

	Serialize()
	{
		return {
			"ID": this.ID,
			"flotilla": this.flotilla,
			"endPos": this.endPos,
			"endIndex": this.endIndex,
			"startIndex": this.startIndex,
			"sea": this.sea,
			"state": this.state,
			"boardingPos": this.boardingPos,
			"needTransportShips": this.needTransportShips,
			"nTry": this.nTry,
			"canceled": this.canceled,
			"unloaded": this.unloaded,
			"recovered": this.recovered
		};
	}

	Deserialize(data)
	{
		for (const key in data)
			this[key] = data[key];

		this.failed = false;
	}
}
