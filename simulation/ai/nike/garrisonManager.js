import { SquareVectorDistance, aiWarn } from "simulation/ai/common-api/utils.js";
import { dumpEntity, isSiegeUnit } from "simulation/ai/nike/entityExtend.js";
import { Worker } from "simulation/ai/nike/worker.js";

/**
 * Manage the garrisonHolders
 * When a unit is ordered to garrison, it must be done through this.garrison() function so that
 * an object in this.holders is created. This object contains an array with the entities
 * in the process of being garrisoned. To have all garrisoned units, we must add those in holder.garrisoned().
 * Futhermore garrison units have a metadata garrisonType describing its reason (protection, transport, ...)
 */

export class GarrisonManager
{
	holders = new Map();
	decayingStructures = new Map();

	constructor(Config)
	{
		this.Config = Config;
	}

	static TYPE_FORCE = "force";
	static TYPE_TRADE = "trade";
	static TYPE_PROTECTION = "protection";
	static TYPE_DECAY = "decay";
	static TYPE_EMERGENCY = "emergency";

	update(gameState, events)
	{
		// First check for possible upgrade of a structure
		for (const evt of events.EntityRenamed)
		{
			for (const id of this.holders.keys())
			{
				if (id != evt.entity)
					continue;
				const data = this.holders.get(id);
				const newHolder = gameState.getEntityById(evt.newentity);
				if (newHolder && newHolder.isGarrisonHolder())
				{
					this.holders.delete(id);
					this.holders.set(evt.newentity, data);
				}
				else
				{
					for (const entId of data.list)
					{
						const ent = gameState.getEntityById(entId);
						if (!ent || ent.getMetadata(PlayerID, "garrisonHolder") != id)
							continue;
						this.leaveGarrison(ent);
						ent.stopMoving();
					}
					this.holders.delete(id);
				}
			}

			for (const id of this.decayingStructures.keys())
			{
				if (id !== evt.entity)
					continue;
				this.decayingStructures.delete(id);
				if (this.decayingStructures.has(evt.newentity))
					continue;
				const ent = gameState.getEntityById(evt.newentity);
				if (!ent || !ent.territoryDecayRate() || !ent.garrisonRegenRate())
					continue;
				const gmin = Math.ceil((ent.territoryDecayRate() - ent.defaultRegenRate()) / ent.garrisonRegenRate());
				this.decayingStructures.set(evt.newentity, gmin);
			}
		}

		for (const [id, data] of this.holders.entries())
		{
			const list = data.list;
			const holder = gameState.getEntityById(id);
			if (!holder || !gameState.isPlayerAlly(holder.owner()))
			{
				// this holder was certainly destroyed or captured. Let's remove it
				for (const entId of list)
				{
					const ent = gameState.getEntityById(entId);
					if (!ent || ent.getMetadata(PlayerID, "garrisonHolder") != id)
						continue;
					this.leaveGarrison(ent);
					ent.stopMoving();
				}
				this.holders.delete(id);
				continue;
			}

			// Update the list of garrisoned units
			for (let j = 0; j < list.length; ++j)
			{
				for (const evt of events.EntityRenamed)
					if (evt.entity === list[j])
						list[j] = evt.newentity;

				const ent = gameState.getEntityById(list[j]);
				if (!ent)	// unit must have been killed while garrisoning
					list.splice(j--, 1);
				else if (holder.garrisoned().indexOf(list[j]) !== -1)   // unit is garrisoned
				{
					this.leaveGarrison(ent);
					list.splice(j--, 1);
				}
				else
				{
					if (ent.unitAIOrderData().some(order => order.target && order.target == id))
						continue;
					if (ent.getMetadata(PlayerID, "garrisonHolder") == id)
					{
						// The garrison order must have failed
						this.leaveGarrison(ent);
						list.splice(j--, 1);
					}
					else
					{
						if (gameState.ai.Config.debug > 0)
						{
							aiWarn("Nike garrison error: unit " + ent.id() + " (" +
								ent.genericName() + ") is expected to garrison in " + id + " (" +
								holder.genericName() + "), but has no such garrison order " +
								uneval(ent.unitAIOrderData()));
							dumpEntity(ent);
						}
						list.splice(j--, 1);
					}
				}

			}

			if (!holder.position())     // could happen with siege unit inside a ship
				continue;

			if (gameState.ai.elapsedTime - holder.getMetadata(PlayerID, "holderTimeUpdate") > 3)
			{
				const range = holder.attackRange("Ranged") ? holder.attackRange("Ranged").max : 80;
				const around = { "defenseStructure": false, "meleeSiege": false, "rangeSiege": false, "unit": false };
				for (const ent of gameState.getEnemyEntities().values())
				{
					if (ent.hasClass("Structure"))
					{
						if (!ent.attackRange("Ranged"))
							continue;
					}
					else if (ent.hasClass("Unit"))
					{
						if (ent.owner() == 0 && (!ent.unitAIState() || ent.unitAIState().split(".")[1] != "COMBAT"))
							continue;
					}
					else
						continue;
					if (!ent.position())
						continue;
					const dist = SquareVectorDistance(ent.position(), holder.position());
					if (dist > range*range)
						continue;
					if (ent.hasClass("Structure"))
						around.defenseStructure = true;
					else if (isSiegeUnit(ent))
					{
						if (ent.attackTypes().indexOf("Melee") !== -1)
							around.meleeSiege = true;
						else
							around.rangeSiege = true;
					}
					else
					{
						around.unit = true;
						break;
					}
				}
				// Keep defenseManager.garrisonUnitsInside in sync to avoid garrisoning-ungarrisoning some units
				data.allowMelee = around.defenseStructure || around.unit;

				for (const entId of holder.garrisoned())
				{
					const ent = gameState.getEntityById(entId);
					if (ent.owner() === PlayerID && !this.keepGarrisoned(ent, holder, around))
						holder.unload(entId);
				}
				for (let j = 0; j < list.length; ++j)
				{
					const ent = gameState.getEntityById(list[j]);
					if (this.keepGarrisoned(ent, holder, around))
						continue;
					if (ent.getMetadata(PlayerID, "garrisonHolder") == id)
					{
						this.leaveGarrison(ent);
						ent.stopMoving();
					}
					list.splice(j--, 1);
				}
				if (this.numberOfGarrisonedSlots(holder) === 0)
					this.holders.delete(id);
				else
					holder.setMetadata(PlayerID, "holderTimeUpdate", gameState.ai.elapsedTime);
			}
		}

		// Warning new garrison orders (as in the following lines) should be done after having updated the holders
		// (or TODO we should add a test that the garrison order is from a previous turn when updating)
		for (const [id, gmin] of this.decayingStructures.entries())
		{
			const ent = gameState.getEntityById(id);
			if (!ent || ent.owner() !== PlayerID)
				this.decayingStructures.delete(id);
			else if (this.numberOfGarrisonedSlots(ent) < gmin)
				gameState.ai.HQ.defenseManager.garrisonUnitsInside(gameState, ent, { "min": gmin, "type": GarrisonManager.TYPE_DECAY });
		}
	}

	/** TODO should add the units garrisoned inside garrisoned units */
	numberOfGarrisonedUnits(holder)
	{
		if (!this.holders.has(holder.id()))
			return holder.garrisoned().length;

		return holder.garrisoned().length + this.holders.get(holder.id()).list.length;
	}

	/** TODO should add the units garrisoned inside garrisoned units */
	numberOfGarrisonedSlots(holder)
	{
		if (!this.holders.has(holder.id()))
			return holder.garrisonedSlots();

		return holder.garrisonedSlots() + this.holders.get(holder.id()).list.length;
	}

	allowMelee(holder)
	{
		if (!this.holders.has(holder.id()))
			return undefined;

		return this.holders.get(holder.id()).allowMelee;
	}

	/** This is just a pre-garrison state, while the entity walk to the garrison holder */
	garrison(gameState, ent, holder, type)
	{
		if (this.numberOfGarrisonedSlots(holder) >= holder.garrisonMax() || !ent.canGarrison())
			return;

		this.registerHolder(gameState, holder);
		this.holders.get(holder.id()).list.push(ent.id());

		if (gameState.ai.Config.debug > 2)
		{
			warn("garrison unit " + ent.genericName() + " in " + holder.genericName() + " with type " + type);
			warn(" we try to garrison a unit with plan " + ent.getMetadata(PlayerID, "plan") + " and role " + ent.getMetadata(PlayerID, "role") +
			     " and subrole " + ent.getMetadata(PlayerID, "subrole") + " and transport " + ent.getMetadata(PlayerID, "transport"));
		}

		if (ent.getMetadata(PlayerID, "plan") !== undefined)
			ent.setMetadata(PlayerID, "plan", -2);
		else
			ent.setMetadata(PlayerID, "plan", -3);
		ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_GARRISONING);
		ent.setMetadata(PlayerID, "garrisonHolder", holder.id());
		ent.setMetadata(PlayerID, "garrisonType", type);
		ent.garrison(holder);
	}

	/**
	 This is the end of the pre-garrison state, either because the entity is really garrisoned
	 or because it has changed its order (i.e. because the garrisonHolder was destroyed)
	 This function is for internal use inside garrisonManager. From outside, you should also update
	 the holder and then using cancelGarrison should be the preferred solution
	 */
	leaveGarrison(ent)
	{
		ent.setMetadata(PlayerID, "subrole", undefined);
		if (ent.getMetadata(PlayerID, "plan") === -2)
			ent.setMetadata(PlayerID, "plan", -1);
		else
			ent.setMetadata(PlayerID, "plan", undefined);
		ent.setMetadata(PlayerID, "garrisonHolder", undefined);
	}

	/** Cancel a pre-garrison state */
	cancelGarrison(ent)
	{
		ent.stopMoving();
		this.leaveGarrison(ent);
		const holderId = ent.getMetadata(PlayerID, "garrisonHolder");
		if (!holderId || !this.holders.has(holderId))
			return;
		const list = this.holders.get(holderId).list;
		const index = list.indexOf(ent.id());
		if (index !== -1)
			list.splice(index, 1);
	}

	keepGarrisoned(ent, holder, around)
	{
		switch (ent.getMetadata(PlayerID, "garrisonType"))
		{
		case GarrisonManager.TYPE_FORCE:           // force the ungarrisoning
			return false;
		case GarrisonManager.TYPE_TRADE:		// trader garrisoned in ship
			return true;
		case GarrisonManager.TYPE_PROTECTION:	// hurt unit for healing or infantry for defense
		{
			if (holder.buffHeal() && ent.isHealable() && ent.healthLevel() < this.Config.garrisonHealthLevel.high)
				return true;
			const capture = ent.capturePoints();
			if (capture && capture[PlayerID] / capture.reduce((a, b) => a + b) < 0.8)
				return true;
			if (ent.hasClasses(holder.getGarrisonArrowClasses()))
			{
				if (around.unit || around.defenseStructure)
					return true;
				if (around.meleeSiege || around.rangeSiege)
					return ent.attackTypes().indexOf("Melee") === -1 || ent.healthLevel() < this.Config.garrisonHealthLevel.low;
				return false;
			}
			if (ent.attackTypes() && ent.attackTypes().indexOf("Melee") !== -1)
				return false;
			if (around.unit)
				return ent.hasClass("Support") || isSiegeUnit(ent);	// only ranged siege here and below as melee siege already released above
			if (isSiegeUnit(ent))
				return around.meleeSiege;
			return holder.buffHeal() && ent.needsHeal();
		}
		case GarrisonManager.TYPE_DECAY:
			return ent.captureStrength() && this.decayingStructures.has(holder.id());
		case GarrisonManager.TYPE_EMERGENCY: // f.e. hero in regicide mode
			if (holder.buffHeal() && ent.isHealable() && ent.healthLevel() < this.Config.garrisonHealthLevel.high)
				return true;
			if (around.unit || around.defenseStructure || around.meleeSiege ||
				around.rangeSiege && ent.healthLevel() < this.Config.garrisonHealthLevel.high)
				return true;
			return holder.buffHeal() && ent.needsHeal();
		default:
			if (ent.getMetadata(PlayerID, "onBoard") === "onBoard")  // transport is not (yet ?) managed by garrisonManager
				return true;
			aiWarn("unknown type in garrisonManager " + ent.getMetadata(PlayerID, "garrisonType") +
				" for " + ent.genericName() + " id " + ent.id() + " inside " + holder.genericName() +
				" id " + holder.id());
			ent.setMetadata(PlayerID, "garrisonType", GarrisonManager.TYPE_PROTECTION);
			return true;
		}
	}

	/** Add this holder in the list managed by the garrisonManager */
	registerHolder(gameState, holder)
	{
		if (this.holders.has(holder.id()))    // already registered
			return;
		this.holders.set(holder.id(), { "list": [], "allowMelee": true });
		holder.setMetadata(PlayerID, "holderTimeUpdate", gameState.ai.elapsedTime);
	}

	/**
	 * Garrison units in decaying structures to stop their decay
	 * do it only for structures useful for defense, except if we are expanding (justCaptured=true)
	 * in which case we also do it for structures useful for unit trainings (TODO only Barracks are done)
	 */
	addDecayingStructure(gameState, entId, justCaptured)
	{
		if (this.decayingStructures.has(entId))
			return true;
		const ent = gameState.getEntityById(entId);
		if (!ent || !(ent.hasClass("Barracks") && justCaptured) && !ent.hasDefensiveFire())
			return false;
		if (!ent.territoryDecayRate() || !ent.garrisonRegenRate())
			return false;
		const gmin = Math.ceil((ent.territoryDecayRate() - ent.defaultRegenRate()) / ent.garrisonRegenRate());
		this.decayingStructures.set(entId, gmin);
		return true;
	}

	removeDecayingStructure(entId)
	{
		if (!this.decayingStructures.has(entId))
			return;
		this.decayingStructures.delete(entId);
	}

	Serialize()
	{
		return { "holders": this.holders, "decayingStructures": this.decayingStructures };
	}

	Deserialize(data)
	{
		for (const key in data)
			this[key] = data[key];
	}
}
