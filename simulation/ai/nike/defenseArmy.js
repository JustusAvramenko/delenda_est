import { SquareVectorDistance } from "simulation/ai/common-api/utils.js";
import { allowCapture, getLandAccess, getMaxStrength, isSiegeUnit, returnResources } from
	"simulation/ai/nike/entityExtend.js";
import { TransportPlan } from "simulation/ai/nike/transportPlan.js";
import { Worker } from "simulation/ai/nike/worker.js";

/**
 * Armies used by the defense manager.
 * An army is a collection of own entities and enemy entities.
 *
 * Types of armies:
 * "default":   army to counter an invading army
 * "capturing": army set to capture a gaia building or recover capture points to one of its own structures
 *            It must contain only one foe (the building to capture) and never be merged
 */
export class DefenseArmy
{
	constructor(gameState, foeEntities, type)
	{
		this.ID = gameState.ai.uniqueIDs.armies++;
		this.type = type || "default";

		this.Config = gameState.ai.Config;
		this.compactSize = this.Config.Defense.armyCompactSize;
		this.breakawaySize = this.Config.Defense.armyBreakawaySize;

		// average
		this.foePosition = [0, 0];
		this.positionLastUpdate = gameState.ai.elapsedTime;

		// Some caching
		// A list of our defenders that were tasked with attacking a particular unit
		// This doesn't mean that they actually are since they could move on to something else on their own.
		this.assignedAgainst = {};
		// who we assigned against, for quick removal.
		this.assignedTo = {};

		this.foeEntities = [];
		this.foeStrength = 0;

		this.ownEntities = [];
		this.ownStrength = 0;

		// actually add units
		for (const id of foeEntities)
			this.addFoe(gameState, id, true);

		this.recalculatePosition(gameState, true);

		return true;
	}

	/**
	 * add an entity to the enemy army
	 * Will return true if the entity was added and false otherwise.
	 * won't recalculate our position but will dirty it.
	 * force is true at army creation or when merging armies, so in this case we should add it even if far
	 */
	addFoe(gameState, enemyId, force)
	{
		if (this.foeEntities.indexOf(enemyId) !== -1)
			return false;
		const ent = gameState.getEntityById(enemyId);
		if (!ent || !ent.position())
			return false;

		// check distance
		if (!force && SquareVectorDistance(ent.position(), this.foePosition) > this.compactSize)
			return false;

		this.foeEntities.push(enemyId);
		this.assignedAgainst[enemyId] = [];
		this.positionLastUpdate = 0;
		this.evaluateStrength(ent);
		ent.setMetadata(PlayerID, "PartOfArmy", this.ID);

		return true;
	}

	/**
	 * returns true if the entity was removed and false otherwise.
	 * TODO: when there is a technology update, we should probably recompute the strengths, or weird stuffs will happen.
	 */
	removeFoe(gameState, enemyId, enemyEntity)
	{
		const idx = this.foeEntities.indexOf(enemyId);
		if (idx === -1)
			return false;

		this.foeEntities.splice(idx, 1);

		this.assignedAgainst[enemyId] = undefined;
		for (const to in this.assignedTo)
			if (this.assignedTo[to] == enemyId)
				this.assignedTo[to] = undefined;

		const ent = enemyEntity ? enemyEntity : gameState.getEntityById(enemyId);
		if (ent)    // TODO recompute strength when no entities (could happen if capture+destroy)
		{
			this.evaluateStrength(ent, false, true);
			ent.setMetadata(PlayerID, "PartOfArmy", undefined);
		}

		return true;
	}

	/**
	 * adds a defender but doesn't assign him yet.
	 * force is true when merging armies, so in this case we should add it even if no position as it can be in a ship
	 */
	addOwn(gameState, id, force)
	{
		if (this.ownEntities.indexOf(id) !== -1)
			return false;
		const ent = gameState.getEntityById(id);
		if (!ent || !ent.position() && !force)
			return false;

		this.ownEntities.push(id);
		this.evaluateStrength(ent, true);
		ent.setMetadata(PlayerID, "PartOfArmy", this.ID);
		this.assignedTo[id] = 0;

		const plan = ent.getMetadata(PlayerID, "plan");
		if (plan !== undefined)
			ent.setMetadata(PlayerID, "plan", -2);
		else
			ent.setMetadata(PlayerID, "plan", -3);
		const subrole = ent.getMetadata(PlayerID, "subrole");
		if (subrole === undefined || subrole !== Worker.SUBROLE_DEFENDER)
			ent.setMetadata(PlayerID, "formerSubrole", subrole);
		ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_DEFENDER);
		return true;
	}

	removeOwn(gameState, id, Entity)
	{
		const idx = this.ownEntities.indexOf(id);
		if (idx === -1)
			return false;

		this.ownEntities.splice(idx, 1);

		if (this.assignedTo[id] !== 0)
		{
			const temp = this.assignedAgainst[this.assignedTo[id]];
			if (temp)
				temp.splice(temp.indexOf(id), 1);
		}
		this.assignedTo[id] = undefined;

		const ent = Entity ? Entity : gameState.getEntityById(id);
		if (!ent)
			return true;

		this.evaluateStrength(ent, true, true);
		ent.setMetadata(PlayerID, "PartOfArmy", undefined);
		if (ent.getMetadata(PlayerID, "plan") === -2)
			ent.setMetadata(PlayerID, "plan", -1);
		else
			ent.setMetadata(PlayerID, "plan", undefined);

		const formerSubrole = ent.getMetadata(PlayerID, "formerSubrole");
		if (formerSubrole !== undefined)
			ent.setMetadata(PlayerID, "subrole", formerSubrole);
		else
			ent.setMetadata(PlayerID, "subrole", undefined);
		ent.setMetadata(PlayerID, "formerSubrole", undefined);

		// Remove from transport plan if not yet on Board
		if (ent.getMetadata(PlayerID, "transport") !== undefined)
		{
			const plan = gameState.ai.HQ.navalManager.getPlan(ent.getMetadata(PlayerID, "transport"));
			if (plan && plan.state === TransportPlan.BOARDING && ent.position())
				plan.removeUnit(gameState, ent);
		}

		/*
		// TODO be sure that all units in the transport need the cancelation
		if (!ent.position())	// this unit must still be in a transport plan ... try to cancel it
		{
			let planID = ent.getMetadata(PlayerID, "transport");
			// no plans must mean that the unit was in a ship which was destroyed, so do nothing
			if (planID)
			{
				if (gameState.ai.Config.debug > 0)
					warn("ent from army still in transport plan: plan " + planID + " canceled");
				let plan = gameState.ai.HQ.navalManager.getPlan(planID);
				if (plan && !plan.canceled)
					plan.cancelTransport(gameState);
			}
		}
	*/

		return true;
	}

	/**
	 * resets the army properly.
	 * assumes we already cleared dead units.
	 */
	clear(gameState)
	{
		while (this.foeEntities.length > 0)
			this.removeFoe(gameState, this.foeEntities[0]);

		// Go back to our or allied territory if needed
		const posOwn = [0, 0];
		let nOwn = 0;
		const posAlly = [0, 0];
		let nAlly = 0;
		const posOther = [0, 0];
		let nOther = 0;
		for (const entId of this.ownEntities)
		{
			const ent = gameState.getEntityById(entId);
			if (!ent || !ent.position())
				continue;
			const pos = ent.position();
			const territoryOwner = gameState.ai.HQ.territoryMap.getOwner(pos);
			if (territoryOwner === PlayerID)
			{
				posOwn[0] += pos[0];
				posOwn[1] += pos[1];
				++nOwn;
			}
			else if (gameState.isPlayerMutualAlly(territoryOwner))
			{
				posAlly[0] += pos[0];
				posAlly[1] += pos[1];
				++nAlly;
			}
			else
			{
				posOther[0] += pos[0];
				posOther[1] += pos[1];
				++nOther;
			}
		}
		let destination;
		let defensiveFound;
		let distmin;
		let radius = 0;
		if (nOwn > 0)
			destination = [posOwn[0]/nOwn, posOwn[1]/nOwn];
		else if (nAlly > 0)
			destination = [posAlly[0]/nAlly, posAlly[1]/nAlly];
		else
		{
			posOther[0] /= nOther;
			posOther[1] /= nOther;
			const armyAccess = gameState.ai.accessibility.getAccessValue(posOther);
			for (const struct of gameState.getAllyStructures().values())
			{
				const pos = struct.position();
				if (!pos || !gameState.isPlayerMutualAlly(gameState.ai.HQ.territoryMap.getOwner(pos)))
					continue;
				if (getLandAccess(gameState, struct) !== armyAccess)
					continue;
				const defensiveStruct = struct.hasDefensiveFire();
				if (defensiveFound && !defensiveStruct)
					continue;
				const dist = SquareVectorDistance(posOther, pos);
				if (distmin && dist > distmin && (defensiveFound || !defensiveStruct))
					continue;
				if (defensiveStruct)
					defensiveFound = true;
				distmin = dist;
				destination = pos;
				radius = struct.obstructionRadius().max;
			}
		}
		while (this.ownEntities.length > 0)
		{
			const entId = this.ownEntities[0];
			this.removeOwn(gameState, entId);
			const ent = gameState.getEntityById(entId);
			if (ent)
			{
				if (!ent.position() || ent.getMetadata(PlayerID, "transport") !== undefined ||
					                 ent.getMetadata(PlayerID, "transporter") !== undefined)
					continue;
				if (ent.healthLevel() < this.Config.garrisonHealthLevel.low &&
				    gameState.ai.HQ.defenseManager.garrisonAttackedUnit(gameState, ent))
					continue;

				if (destination && !gameState.isPlayerMutualAlly(gameState.ai.HQ.territoryMap.getOwner(ent.position())))
					ent.moveToRange(destination[0], destination[1], radius, radius + 5);
				else
					ent.stopMoving();
			}
		}

		this.assignedAgainst = {};
		this.assignedTo = {};

		this.recalculateStrengths(gameState);
		this.recalculatePosition(gameState);
	}

	assignUnit(gameState, entID)
	{
		// we'll assume this defender is ours already.
		// we'll also override any previous assignment

		const ent = gameState.getEntityById(entID);
		if (!ent || !ent.position())
			return false;

		// try to return its resources, and if any, the attack order will be queued
		const queued = returnResources(gameState, ent);

		let idMin;
		let distMin;
		let idMinAll;
		let distMinAll;
		for (const id of this.foeEntities)
		{
			const eEnt = gameState.getEntityById(id);
			if (!eEnt || !eEnt.position())	// probably can't happen.
				continue;

			if (!ent.canAttackTarget(eEnt, allowCapture(gameState, ent, eEnt)))
				continue;

			if (eEnt.hasClass("Unit") && eEnt.unitAIOrderData() && eEnt.unitAIOrderData().length &&
				eEnt.unitAIOrderData()[0].target && eEnt.unitAIOrderData()[0].target == entID)
			{   // being attacked  >>> target the unit
				idMin = id;
				break;
			}

			// already enough units against it
			if (this.assignedAgainst[id].length > 8 ||
				this.assignedAgainst[id].length > 5 && !eEnt.hasClass("Hero") && !isSiegeUnit(eEnt))
				continue;

			const dist = SquareVectorDistance(ent.position(), eEnt.position());
			if (idMinAll === undefined || dist < distMinAll)
			{
				idMinAll = id;
				distMinAll = dist;
			}
			if (this.assignedAgainst[id].length > 2)
				continue;
			if (idMin === undefined || dist < distMin)
			{
				idMin = id;
				distMin = dist;
			}
		}

		let idFoe;
		if (idMin !== undefined)
			idFoe = idMin;
		else if (idMinAll !== undefined)
			idFoe = idMinAll;
		else
			return false;

		const ownIndex = getLandAccess(gameState, ent);
		const foeEnt = gameState.getEntityById(idFoe);
		const foePosition = foeEnt.position();
		const foeIndex = gameState.ai.accessibility.getAccessValue(foePosition);
		if (ownIndex == foeIndex || ent.hasClass("Ship"))
		{
			this.assignedTo[entID] = idFoe;
			this.assignedAgainst[idFoe].push(entID);
			ent.attack(idFoe, allowCapture(gameState, ent, foeEnt), queued);
		}
		else
			gameState.ai.HQ.navalManager.requireTransport(gameState, ent, ownIndex, foeIndex, foePosition);
		return true;
	}

	getType()
	{
		return this.type;
	}

	getState()
	{
		if (!this.foeEntities.length)
			return 0;
		return 1;
	}

	/**
	 * merge this army with another properly.
	 * assumes units are in only one army.
	 * also assumes that all have been properly cleaned up (no dead units).
	 */
	merge(gameState, otherArmy)
	{
		// copy over all parameters.
		for (const i in otherArmy.assignedAgainst)
		{
			if (this.assignedAgainst[i] === undefined)
				this.assignedAgainst[i] = otherArmy.assignedAgainst[i];
			else
				this.assignedAgainst[i] = this.assignedAgainst[i].concat(otherArmy.assignedAgainst[i]);
		}
		for (const i in otherArmy.assignedTo)
			this.assignedTo[i] = otherArmy.assignedTo[i];

		for (const id of otherArmy.foeEntities)
			this.addFoe(gameState, id, true);
		// TODO: reassign those ?
		for (const id of otherArmy.ownEntities)
			this.addOwn(gameState, id, true);

		this.recalculatePosition(gameState, true);
		this.recalculateStrengths(gameState);

		return true;
	}

	needsDefenders(gameState)
	{
		let defenseRatio;
		const territoryOwner = gameState.ai.HQ.territoryMap.getOwner(this.foePosition);
		if (territoryOwner == PlayerID)
			defenseRatio = this.Config.Defense.defenseRatio.own;
		else if (gameState.isPlayerAlly(territoryOwner))
		{
			defenseRatio = this.Config.Defense.defenseRatio.ally;
			let numExclusiveAllies = 0;
			for (let p = 1; p < gameState.sharedScript.playersData.length; ++p)
				if (p != territoryOwner && gameState.sharedScript.playersData[p].isAlly[territoryOwner])
					++numExclusiveAllies;
			defenseRatio /= 1 + 0.5*Math.max(0, numExclusiveAllies-1);
		}
		else
			defenseRatio = this.Config.Defense.defenseRatio.neutral;

		// some preliminary checks because we don't update for tech so entStrength removed can be > entStrength added
		if (this.foeStrength <= 0 || this.ownStrength <= 0)
			this.recalculateStrengths(gameState);

		if (this.foeStrength * defenseRatio <= this.ownStrength)
			return false;
		return this.foeStrength * defenseRatio - this.ownStrength;
	}


	/** if not forced, will only recalculate if on a different turn. */
	recalculatePosition(gameState, force)
	{
		if (!force && this.positionLastUpdate === gameState.ai.elapsedTime)
			return;

		let npos = 0;
		const pos = [0, 0];
		for (const id of this.foeEntities)
		{
			const ent = gameState.getEntityById(id);
			if (!ent || !ent.position())
				continue;
			npos++;
			const epos = ent.position();
			pos[0] += epos[0];
			pos[1] += epos[1];
		}
		// if npos = 0, the army must have been destroyed and will be removed next turn. keep previous position
		if (npos > 0)
		{
			this.foePosition[0] = pos[0]/npos;
			this.foePosition[1] = pos[1]/npos;
		}

		this.positionLastUpdate = gameState.ai.elapsedTime;
	}

	recalculateStrengths(gameState)
	{
		this.ownStrength = 0;
		this.foeStrength = 0;

		for (const id of this.foeEntities)
			this.evaluateStrength(gameState.getEntityById(id));
		for (const id of this.ownEntities)
			this.evaluateStrength(gameState.getEntityById(id), true);
	}

	/** adds or remove the strength of the entity either to the enemy or to our units. */
	evaluateStrength(ent, isOwn, remove)
	{
		if (!ent)
			return;

		let entStrength;
		if (ent.hasClass("Structure"))
		{
			if (ent.owner() !== PlayerID)
				entStrength = ent.getDefaultArrow() ? 6*ent.getDefaultArrow() : 4;
			else	// small strength used only when we try to recover capture points
				entStrength = 2;
		}
		else
			entStrength = getMaxStrength(ent, this.Config.debug, this.Config.DamageTypeImportance);

		// TODO adapt the getMaxStrength function for animals.
		// For the time being, just increase it for elephants as the returned value is too small.
		if (ent.hasClasses(["Animal+Elephant"]))
			entStrength *= 3;

		if (remove)
			entStrength *= -1;

		if (isOwn)
			this.ownStrength += entStrength;
		else
			this.foeStrength += entStrength;
	}

	checkEvents(gameState, events)
	{
		// Warning the metadata is already cloned in shared.js. Futhermore, changes should be done before destroyEvents
		// otherwise it would remove the old entity from this army list
		// TODO we should may-be reevaluate the strength
		for (const evt of events.EntityRenamed)	// take care of promoted and packed units
		{
			if (this.foeEntities.indexOf(evt.entity) !== -1)
			{
				const ent = gameState.getEntityById(evt.newentity);
				if (ent && ent.templateName().indexOf("resource|") !== -1)  // corpse of animal killed
					continue;
				const idx = this.foeEntities.indexOf(evt.entity);
				this.foeEntities[idx] = evt.newentity;
				this.assignedAgainst[evt.newentity] = this.assignedAgainst[evt.entity];
				this.assignedAgainst[evt.entity] = undefined;
				for (const to in this.assignedTo)
					if (this.assignedTo[to] === evt.entity)
						this.assignedTo[to] = evt.newentity;
			}
			else if (this.ownEntities.indexOf(evt.entity) !== -1)
			{
				const newEnt = gameState.getEntityById(evt.newentity);
				if (newEnt && (!newEnt.hasUnitAI() || !newEnt.attackTypes()))
					continue;
				const idx = this.ownEntities.indexOf(evt.entity);
				this.ownEntities[idx] = evt.newentity;
				this.assignedTo[evt.newentity] = this.assignedTo[evt.entity];
				this.assignedTo[evt.entity] = undefined;
				for (const against in this.assignedAgainst)
				{
					if (!this.assignedAgainst[against])
						continue;
					if (this.assignedAgainst[against].indexOf(evt.entity) !== -1)
						this.assignedAgainst[against][this.assignedAgainst[against].indexOf(evt.entity)] = evt.newentity;
				}
			}
		}

		for (const evt of events.Garrison)
			this.removeFoe(gameState, evt.entity);

		for (const evt of events.OwnershipChanged)	// captured
		{
			if (!gameState.isPlayerEnemy(evt.to))
				this.removeFoe(gameState, evt.entity);
			else if (evt.from === PlayerID)
				this.removeOwn(gameState, evt.entity);
		}

		for (const evt of events.Destroy)
		{
			// we may have capture+destroy, so do not trust owner and check all possibilities
			this.removeOwn(gameState, evt.entity);
			this.removeFoe(gameState, evt.entity);
		}
	}

	update(gameState)
	{
		for (const entId of this.ownEntities)
		{
			const ent = gameState.getEntityById(entId);
			if (!ent)
				continue;
			const orderData = ent.unitAIOrderData();
			if (!orderData.length && !ent.getMetadata(PlayerID, "transport"))
				this.assignUnit(gameState, entId);
			else if (orderData.length && orderData[0].target && orderData[0].attackType && orderData[0].attackType === "Capture")
			{
				const target = gameState.getEntityById(orderData[0].target);
				if (target && !allowCapture(gameState, ent, target))
					ent.attack(orderData[0].target, false);
			}
		}

		if (this.type == "capturing")
		{
			if (this.foeEntities.length && gameState.getEntityById(this.foeEntities[0]))
			{
				// Check if we still still some capturePoints to recover
				// and if not, remove this foe from the list (capture army have only one foe)
				const capture = gameState.getEntityById(this.foeEntities[0]).capturePoints();
				if (capture)
					for (let j = 0; j < capture.length; ++j)
						if (gameState.isPlayerEnemy(j) && capture[j] > 0)
							return [];
				this.removeFoe(gameState, this.foeEntities[0]);
			}
			return [];
		}

		const breakaways = [];
		// TODO: assign unassigned defenders, cleanup of a few things.
		// perhaps occasional strength recomputation

		// occasional update or breakaways, positions…
		if (gameState.ai.elapsedTime - this.positionLastUpdate > 5)
		{
			this.recalculatePosition(gameState);
			this.positionLastUpdate = gameState.ai.elapsedTime;

			// Check for breakaways.
			for (let i = 0; i < this.foeEntities.length; ++i)
			{
				const id = this.foeEntities[i];
				const ent = gameState.getEntityById(id);
				if (!ent || !ent.position())
					continue;
				if (SquareVectorDistance(ent.position(), this.foePosition) > this.breakawaySize)
				{
					breakaways.push(id);
					if (this.removeFoe(gameState, id))
						i--;
				}
			}

			this.recalculatePosition(gameState);
		}

		return breakaways;
	}

	Serialize()
	{
		return {
			"ID": this.ID,
			"type": this.type,
			"foePosition": this.foePosition,
			"positionLastUpdate": this.positionLastUpdate,
			"assignedAgainst": this.assignedAgainst,
			"assignedTo": this.assignedTo,
			"foeEntities": this.foeEntities,
			"foeStrength": this.foeStrength,
			"ownEntities": this.ownEntities,
			"ownStrength": this.ownStrength
		};
	}

	Deserialize(data)
	{
		for (const key in data)
			this[key] = data[key];
	}
}
