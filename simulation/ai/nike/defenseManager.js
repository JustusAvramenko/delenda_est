import * as filters from "simulation/ai/common-api/filters.js";
import { SquareVectorDistance, aiWarn } from "simulation/ai/common-api/utils.js";
import { AttackPlan } from "simulation/ai/nike/attackPlan.js";
import { DefenseArmy } from "simulation/ai/nike/defenseArmy.js";
import { allowCapture, getLandAccess, getMaxStrength, isSiegeUnit } from
	"simulation/ai/nike/entityExtend.js";
import { GarrisonManager } from "simulation/ai/nike/garrisonManager.js";
import { Worker } from "simulation/ai/nike/worker.js";

export class DefenseManager
{
	constructor(Config)
	{
		// Array of "army" Objects.
		this.armies = [];
		this.Config = Config;
		this.targetList = [];
		this.armyMergeSize = this.Config.Defense.armyMergeSize;
		// Stats on how many enemies are currently attacking our allies
		// this.attackingArmies[enemy][ally] = number of enemy armies inside allied territory
		// this.attackingUnits[enemy][ally] = number of enemy units not in armies inside allied territory
		// this.attackedAllies[ally] = number of enemies attacking the ally
		this.attackingArmies = {};
		this.attackingUnits = {};
		this.attackedAllies = {};
	}

	update(gameState, events)
	{
		Engine.ProfileStart("Defense Manager");

		this.territoryMap = gameState.ai.HQ.territoryMap;

		this.checkEvents(gameState, events);

		// Check if our potential targets are still valid.
		for (let i = 0; i < this.targetList.length; ++i)
		{
			const target = gameState.getEntityById(this.targetList[i]);
			if (!target || !target.position() || !gameState.isPlayerEnemy(target.owner()))
				this.targetList.splice(i--, 1);
		}

		// Count the number of enemies attacking our allies in the previous turn.
		// We'll be more cooperative if several enemies are attacking him simultaneously.
		this.attackedAllies = {};
		const attackingArmies = clone(this.attackingArmies);
		for (const enemy in this.attackingUnits)
		{
			if (!this.attackingUnits[enemy])
				continue;
			for (const ally in this.attackingUnits[enemy])
			{
				if (this.attackingUnits[enemy][ally] < 8)
					continue;
				if (attackingArmies[enemy] === undefined)
					attackingArmies[enemy] = {};
				if (attackingArmies[enemy][ally] === undefined)
					attackingArmies[enemy][ally] = 0;
				attackingArmies[enemy][ally] += 1;
			}
		}
		for (const enemy in attackingArmies)
		{
			for (const ally in attackingArmies[enemy])
			{
				if (this.attackedAllies[ally] === undefined)
					this.attackedAllies[ally] = 0;
				this.attackedAllies[ally] += 1;
			}
		}
		this.checkEnemyArmies(gameState);
		this.checkEnemyUnits(gameState);
		this.assignDefenders(gameState);

		Engine.ProfileStop();
	}

	makeIntoArmy(gameState, entityID, type = "default")
	{
		if (type == "default")
		{
			for (const army of this.armies)
				if (army.getType() == type && army.addFoe(gameState, entityID))
					return;
		}

		this.armies.push(new DefenseArmy(gameState, [entityID], type));
	}

	getArmy(partOfArmy)
	{
		return this.armies.find(army => army.ID == partOfArmy);
	}

	isDangerous(gameState, entity)
	{
		if (!entity.position())
			return false;

		const territoryOwner = this.territoryMap.getOwner(entity.position());
		if (territoryOwner != 0 && !gameState.isPlayerAlly(territoryOwner))
			return false;
		// Check if the entity is trying to build a new base near our buildings,
		// and if yes, add this base in our target list.
		if (entity.unitAIState() && entity.unitAIState() == "INDIVIDUAL.REPAIR.REPAIRING")
		{
			const targetId = entity.unitAIOrderData()[0].target;
			if (this.targetList.indexOf(targetId) != -1)
				return true;
			const target = gameState.getEntityById(targetId);
			if (target)
			{
				const isTargetEnemy = gameState.isPlayerEnemy(target.owner());
				if (isTargetEnemy && territoryOwner == PlayerID)
				{
					if (target.hasClass("Structure"))
						this.targetList.push(targetId);
					return true;
				}
				else if (isTargetEnemy && target.hasClass("CivCentre"))
				{
					const myBuildings = gameState.getOwnStructures();
					for (const building of myBuildings.values())
					{
						if (building.foundationProgress() == 0)
							continue;
						if (SquareVectorDistance(building.position(), entity.position()) > 30000)
							continue;
						this.targetList.push(targetId);
						return true;
					}
				}
			}
		}

		if (entity.attackTypes() === undefined || entity.hasClass("Support"))
			return false;
		let dist2Min = 6000;
		// TODO the 30 is to take roughly into account the structure size in following checks. Can be improved.
		if (entity.attackTypes().indexOf("Ranged") != -1)
			dist2Min = (entity.attackRange("Ranged").max + 30) * (entity.attackRange("Ranged").max + 30);

		for (const targetId of this.targetList)
		{
			const target = gameState.getEntityById(targetId);
			// The enemy base is either destroyed or built.
			if (!target || !target.position())
				continue;
			if (SquareVectorDistance(target.position(), entity.position()) < dist2Min)
				return true;
		}

		const ccEnts = gameState.updatingGlobalCollection("allCCs", filters.byClass("CivCentre"));
		for (const cc of ccEnts.values())
		{
			if (!gameState.isEntityExclusiveAlly(cc) || cc.foundationProgress() == 0)
				continue;
			const cooperation = this.GetCooperationLevel(cc.owner());
			if (cooperation < 0.3 || cooperation < 0.6 && !!cc.foundationProgress())
				continue;
			if (SquareVectorDistance(cc.position(), entity.position()) < dist2Min)
				return true;
		}

		for (const building of gameState.getOwnStructures().values())
		{
			if (building.foundationProgress() == 0 ||
				SquareVectorDistance(building.position(), entity.position()) > dist2Min)
			{
				continue;
			}
			if (!this.territoryMap.isBlinking(building.position()) || gameState.ai.HQ.isDefendable(building))
				return true;
		}

		if (gameState.isPlayerMutualAlly(territoryOwner))
		{
			// If ally attacked by more than 2 enemies, help him not only for cc but also for structures.
			if (territoryOwner != PlayerID && this.attackedAllies[territoryOwner] &&
				                            this.attackedAllies[territoryOwner] > 1 &&
				                            this.GetCooperationLevel(territoryOwner) > 0.7)
			{
				for (const building of gameState.getAllyStructures(territoryOwner).values())
				{
					if (building.foundationProgress() == 0 ||
						SquareVectorDistance(building.position(), entity.position()) > dist2Min)
					{
						continue;
					}
					if (!this.territoryMap.isBlinking(building.position()))
						return true;
				}
			}

			// Update the number of enemies attacking this ally.
			const enemy = entity.owner();
			if (this.attackingUnits[enemy] === undefined)
				this.attackingUnits[enemy] = {};
			if (this.attackingUnits[enemy][territoryOwner] === undefined)
				this.attackingUnits[enemy][territoryOwner] = 0;
			this.attackingUnits[enemy][territoryOwner] += 1;
		}

		return false;
	}

	checkEnemyUnits(gameState)
	{
		const nbPlayers = gameState.sharedScript.playersData.length;
		const i = gameState.ai.playedTurn % nbPlayers;
		this.attackingUnits[i] = undefined;

		if (i == PlayerID)
		{
			if (!this.armies.length)
			{
				// Check if we can recover capture points from any of our notdecaying structures.
				for (const ent of gameState.getOwnStructures().values())
				{
					if (ent.decaying())
						continue;
					const capture = ent.capturePoints();
					if (capture === undefined)
						continue;
					let lost = 0;
					for (let j = 0; j < capture.length; ++j)
						if (gameState.isPlayerEnemy(j))
							lost += capture[j];
					if (lost < Math.ceil(0.25 * capture[i]))
						continue;
					this.makeIntoArmy(gameState, ent.id(), "capturing");
					break;
				}
			}
			return;
		}
		else if (!gameState.isPlayerEnemy(i))
			return;

		for (const ent of gameState.getEnemyUnits(i).values())
		{
			if (ent.getMetadata(PlayerID, "PartOfArmy") !== undefined)
				continue;

			// Keep animals attacking us or our allies.
			if (ent.hasClass("Animal"))
			{
				if (!ent.unitAIState() || ent.unitAIState().split(".")[1] != "COMBAT")
					continue;
				const orders = ent.unitAIOrderData();
				if (!orders || !orders.length || !orders[0].target)
					continue;
				const target = gameState.getEntityById(orders[0].target);
				if (!target || !gameState.isPlayerAlly(target.owner()))
					continue;
			}

			// TODO what to do for ships ?
			if (ent.hasClasses(["Ship", "Trader"]))
				continue;

			// Check if unit is dangerous "a priori".
			if (this.isDangerous(gameState, ent))
				this.makeIntoArmy(gameState, ent.id());
		}

		if (i != 0 || this.armies.length > 1 || !gameState.ai.HQ.hasActiveBase())
			return;
		// Look for possible gaia buildings inside our territory (may happen when enemy resign or after structure decay)
		// and attack it only if useful (and capturable) or dangereous.
		for (const ent of gameState.getEnemyStructures(i).values())
		{
			if (!ent.position() || ent.getMetadata(PlayerID, "PartOfArmy") !== undefined)
				continue;
			if (!ent.capturePoints() && !ent.hasDefensiveFire())
				continue;
			const owner = this.territoryMap.getOwner(ent.position());
			if (owner == PlayerID)
				this.makeIntoArmy(gameState, ent.id(), "capturing");
		}
	}

	checkEnemyArmies(gameState)
	{
		for (let i = 0; i < this.armies.length; ++i)
		{
			const army = this.armies[i];
			// This returns a list of IDs: the units that broke away from the army for being too far.
			const breakaways = army.update(gameState);
			// Assume dangerosity.
			for (const breaker of breakaways)
				this.makeIntoArmy(gameState, breaker);

			if (army.getState() == 0)
			{
				if (army.getType() == "default")
					this.switchToAttack(gameState, army);
				army.clear(gameState);
				this.armies.splice(i--, 1);
			}
		}
		// Check if we can't merge it with another.
		for (let i = 0; i < this.armies.length - 1; ++i)
		{
			const army = this.armies[i];
			if (army.getType() != "default")
				continue;
			for (let j = i+1; j < this.armies.length; ++j)
			{
				const otherArmy = this.armies[j];
				if (otherArmy.getType() != "default" ||
					SquareVectorDistance(army.foePosition, otherArmy.foePosition) > this.armyMergeSize)
				{
					continue;
				}
				// No need to clear here.
				army.merge(gameState, otherArmy);
				this.armies.splice(j--, 1);
			}
		}

		if (gameState.ai.playedTurn % 5 != 0)
			return;
		// Check if any army is no more dangerous (possibly because it has defeated us and destroyed our base).
		this.attackingArmies = {};
		for (let i = 0; i < this.armies.length; ++i)
		{
			const army = this.armies[i];
			army.recalculatePosition(gameState);
			const owner = this.territoryMap.getOwner(army.foePosition);
			if (!gameState.isPlayerEnemy(owner))
			{
				if (gameState.isPlayerMutualAlly(owner))
				{
					// Update the number of enemies attacking this ally.
					for (const id of army.foeEntities)
					{
						const ent = gameState.getEntityById(id);
						if (!ent)
							continue;
						const enemy = ent.owner();
						if (this.attackingArmies[enemy] === undefined)
							this.attackingArmies[enemy] = {};
						if (this.attackingArmies[enemy][owner] === undefined)
							this.attackingArmies[enemy][owner] = 0;
						this.attackingArmies[enemy][owner] += 1;
						break;
					}
				}
				continue;
			}
			// Enemy army back in its territory.
			else if (owner != 0)
			{
				army.clear(gameState);
				this.armies.splice(i--, 1);
				continue;
			}

			// Army in neutral territory.
			// TODO check smaller distance with all our buildings instead of only ccs with big distance.
			let stillDangerous = false;
			const bases = gameState.updatingGlobalCollection("allCCs", filters.byClass("CivCentre"));
			for (const base of bases.values())
			{
				if (!gameState.isEntityAlly(base))
					continue;
				const cooperation = this.GetCooperationLevel(base.owner());
				if (cooperation < 0.3 && !gameState.isEntityOwn(base))
					continue;
				if (SquareVectorDistance(base.position(), army.foePosition) > 40000)
					continue;
				if (this.Config.debug > 1)
					aiWarn("army in neutral territory, but still near one of our CC");
				stillDangerous = true;
				break;
			}
			if (stillDangerous)
				continue;
			// Need to also check docks because of oversea bases.
			for (const dock of gameState.getOwnStructures().filter(filters.byClass("Dock")).values())
			{
				if (SquareVectorDistance(dock.position(), army.foePosition) > 10000)
					continue;
				stillDangerous = true;
				break;
			}
			if (stillDangerous)
				continue;

			if (army.getType() == "default")
				this.switchToAttack(gameState, army);
			army.clear(gameState);
			this.armies.splice(i--, 1);
		}
	}

	assignDefenders(gameState)
	{
		if (!this.armies.length)
			return;

		const armiesNeeding = [];
		// Let's add defenders.
		for (const army of this.armies)
		{
			const needsDef = army.needsDefenders(gameState);
			if (needsDef === false)
				continue;

			let armyAccess;
			for (const entId of army.foeEntities)
			{
				const ent = gameState.getEntityById(entId);
				if (!ent || !ent.position())
					continue;
				armyAccess = getLandAccess(gameState, ent);
				break;
			}
			if (!armyAccess)
				aiWarn(" Nike error: attacking army " + army.ID + " without access");
			army.recalculatePosition(gameState);
			armiesNeeding.push({ "army": army, "access": armyAccess, "need": needsDef });
		}

		if (!armiesNeeding.length)
			return;

		// Let's get our potential units.
		const potentialDefenders = [];
		gameState.getOwnUnits().forEach(function(ent)
		{
			if (!ent.position())
				return;
			if (ent.getMetadata(PlayerID, "plan") == -2 || ent.getMetadata(PlayerID, "plan") == -3)
				return;
			if (ent.hasClass("Support") || ent.attackTypes() === undefined)
				return;
			if (ent.hasClasses(["StoneThrower", "Support", "FishingBoat"]))
				return;
			if (ent.getMetadata(PlayerID, "transport") !== undefined ||
			    ent.getMetadata(PlayerID, "transporter") !== undefined)
				return;
			if (gameState.ai.HQ.victoryManager.criticalEnts.has(ent.id()))
				return;
			if (ent.getMetadata(PlayerID, "plan") !== undefined && ent.getMetadata(PlayerID, "plan") != -1)
			{
				const subrole = ent.getMetadata(PlayerID, "subrole");
				if (subrole &&
					(subrole === Worker.SUBROLE_COMPLETING || subrole === Worker.SUBROLE_WALKING ||
					subrole === Worker.SUBROLE_ATTACKING))
				{
					return;
				}
			}
			potentialDefenders.push(ent.id());
		});

		for (let ipass = 0; ipass < 2; ++ipass)
		{
			// First pass only assign defenders with the right access.
			// Second pass assign all defenders.
			// TODO could sort them by distance.
			let backup = 0;
			for (let i = 0; i < potentialDefenders.length; ++i)
			{
				const ent = gameState.getEntityById(potentialDefenders[i]);
				if (!ent || !ent.position())
					continue;
				let aMin;
				let distMin;
				const access = ipass == 0 ? getLandAccess(gameState, ent) : undefined;
				for (let a = 0; a < armiesNeeding.length; ++a)
				{
					if (access && armiesNeeding[a].access != access)
						continue;

					// Do not assign defender if it cannot attack at least part of the attacking army.
					if (!armiesNeeding[a].army.foeEntities.some(eEnt =>
					{
						const eEntID = gameState.getEntityById(eEnt);
						return ent.canAttackTarget(eEntID, allowCapture(gameState, ent, eEntID));
					}))
						continue;

					const dist = SquareVectorDistance(ent.position(),
						armiesNeeding[a].army.foePosition);
					if (aMin !== undefined && dist > distMin)
						continue;
					aMin = a;
					distMin = dist;
				}

				// If outside our territory (helping an ally or attacking a cc foundation)
				// or if in another access, keep some troops in backup.
				if (backup < 12 && (aMin == undefined || distMin > 40000 &&
					  this.territoryMap.getOwner(armiesNeeding[aMin].army.foePosition) != PlayerID))
				{
					++backup;
					potentialDefenders[i] = undefined;
					continue;
				}
				else if (aMin === undefined)
					continue;

				armiesNeeding[aMin].need -=
					getMaxStrength(ent, this.Config.debug, this.Config.DamageTypeImportance);
				armiesNeeding[aMin].army.addOwn(gameState, potentialDefenders[i]);
				armiesNeeding[aMin].army.assignUnit(gameState, potentialDefenders[i]);
				potentialDefenders[i] = undefined;

				if (armiesNeeding[aMin].need <= 0)
					armiesNeeding.splice(aMin, 1);
				if (!armiesNeeding.length)
					return;
			}
		}

		// If shortage of defenders, produce infantry garrisoned in nearest civil center.
		const armiesPos = [];
		for (let a = 0; a < armiesNeeding.length; ++a)
			armiesPos.push(armiesNeeding[a].army.foePosition);
		gameState.ai.HQ.trainEmergencyUnits(gameState, armiesPos);
	}

	abortArmy(gameState, army)
	{
		army.clear(gameState);
		for (let i = 0; i < this.armies.length; ++i)
		{
			if (this.armies[i].ID != army.ID)
				continue;
			this.armies.splice(i, 1);
			break;
		}
	}

	/**
	 * If our defense structures are attacked, garrison soldiers inside when possible
	 * and if a support unit is attacked and has less than 55% health, garrison it inside the nearest healing structure
	 * and if a ranged siege unit (not used for defense) is attacked, garrison it in the nearest fortress.
	 * If our hero is attacked with regicide victory condition, the victoryManager will handle it.
	 */
	checkEvents(gameState, events)
	{
		// Must be called every turn for all armies.
		for (const army of this.armies)
			army.checkEvents(gameState, events);

		// Capture events.
		for (const evt of events.OwnershipChanged)
		{
			if (gameState.isPlayerMutualAlly(evt.from) && evt.to > 0)
			{
				const ent = gameState.getEntityById(evt.entity);
				// One of our cc has been captured.
				if (ent && ent.hasClass("CivCentre"))
					gameState.ai.HQ.attackManager.switchDefenseToAttack(gameState, ent, { "range": 150 });
			}
		}

		const allAttacked = {};
		for (const evt of events.Attacked)
			allAttacked[evt.target] = evt.attacker;

		for (const evt of events.Attacked)
		{
			const target = gameState.getEntityById(evt.target);
			if (!target || !target.position())
				continue;

			const attacker = gameState.getEntityById(evt.attacker);
			if (attacker && gameState.isEntityOwn(attacker) && gameState.isEntityEnemy(target) && !attacker.hasClass("Ship") &&
			   (!target.hasClass("Structure") || target.attackRange("Ranged")))
			{
				// If enemies are in range of one of our defensive structures, garrison it for arrow multiplier
				// (enemy non-defensive structure are not considered to stay in sync with garrisonManager).
				if (attacker.position() && attacker.isGarrisonHolder() && attacker.getArrowMultiplier() &&
				    (target.owner() != 0 || !target.hasClass("Unit") ||
				     target.unitAIState() && target.unitAIState().split(".")[1] == "COMBAT"))
					this.garrisonUnitsInside(gameState, attacker, { "attacker": target });
			}

			if (!gameState.isEntityOwn(target))
				continue;

			// If attacked by one of our allies (he must trying to recover capture points), do not react.
			if (attacker && gameState.isEntityAlly(attacker))
				continue;

			if (attacker && attacker.position() && target.hasClass("FishingBoat"))
			{
				const unitAIState = target.unitAIState();
				const unitAIStateOrder = unitAIState ? unitAIState.split(".")[1] : "";
				if (target.isIdle() || unitAIStateOrder == "GATHER")
				{
					const pos = attacker.position();
					const range = attacker.attackRange("Ranged") ? attacker.attackRange("Ranged").max + 15 : 25;
					if (range * range > SquareVectorDistance(pos, target.position()))
						target.moveToRange(pos[0], pos[1], range, range + 5);
				}
				continue;
			}

			// TODO integrate other ships later, need to be sure it is accessible.
			if (target.hasClass("Ship"))
				continue;

			// If a building on a blinking tile is attacked, check if it can be defended.
			// Same thing for a building in an isolated base (not connected to a base with anchor).
			if (target.hasClass("Structure"))
			{
				const base = gameState.ai.HQ.getBaseByID(target.getMetadata(PlayerID, "base"));
				if (this.territoryMap.isBlinking(target.position()) && !gameState.ai.HQ.isDefendable(target) ||
				    !base || gameState.ai.HQ.baseManagers().every(b => !b.anchor || b.accessIndex != base.accessIndex))
				{
					const capture = target.capturePoints();
					if (!capture)
						continue;
					const captureRatio = capture[PlayerID] / capture.reduce((a, b) => a + b);
					if (captureRatio > 0.50 && captureRatio < 0.70)
						target.destroy();
					continue;
				}
			}


			// If inside a started attack plan, let the plan deal with this unit.
			const plan = target.getMetadata(PlayerID, "plan");
			if (plan !== undefined && plan >= 0)
			{
				const attack = gameState.ai.HQ.attackManager.getPlan(plan);
				if (attack && attack.state != AttackPlan.STATE_UNEXECUTED)
					continue;
			}

			// Signal this attacker to our defense manager, except if we are in enemy territory.
			// TODO treat ship attack.
			if (attacker && attacker.position() && attacker.getMetadata(PlayerID, "PartOfArmy") === undefined &&
				!attacker.hasClasses(["Structure", "Ship"]))
			{
				const territoryOwner = this.territoryMap.getOwner(attacker.position());
				if (territoryOwner == 0 || gameState.isPlayerAlly(territoryOwner))
					this.makeIntoArmy(gameState, attacker.id());
			}

			if (target.getMetadata(PlayerID, "PartOfArmy") !== undefined)
			{
				const army = this.getArmy(target.getMetadata(PlayerID, "PartOfArmy"));
				if (army.getType() == "capturing")
				{
					let abort = false;
					// If one of the units trying to capture a structure is attacked,
					// abort the army so that the unit can defend itself
					if (army.ownEntities.indexOf(target.id()) != -1)
						abort = true;
					else if (army.foeEntities[0] == target.id() && target.owner() == PlayerID)
					{
						// else we may be trying to regain some capture point from one of our structure.
						abort = true;
						const capture = target.capturePoints();
						for (let j = 0; j < capture.length; ++j)
						{
							if (!gameState.isPlayerEnemy(j) || capture[j] == 0)
								continue;
							abort = false;
							break;
						}
					}
					if (abort)
						this.abortArmy(gameState, army);
				}
				continue;
			}

			// Try to garrison any attacked support unit if low health.
			if (target.hasClass("Support") && target.healthLevel() < this.Config.garrisonHealthLevel.medium &&
				!target.getMetadata(PlayerID, "transport") && plan != -2 && plan != -3)
			{
				this.garrisonAttackedUnit(gameState, target);
				continue;
			}

			// Try to garrison any attacked stone thrower.
			if (target.hasClass("StoneThrower") &&
				!target.getMetadata(PlayerID, "transport") && plan != -2 && plan != -3)
			{
				this.garrisonSiegeUnit(gameState, target);
				continue;
			}

			if (!attacker || !attacker.position())
				continue;

			if (target.isGarrisonHolder() && target.getArrowMultiplier())
				this.garrisonUnitsInside(gameState, target, { "attacker": attacker });

			if (target.hasClass("Unit") && attacker.hasClass("Unit"))
			{
				// Consider whether we should retaliate or continue our task.
				if (target.hasClass("Support") || target.attackTypes() === undefined)
					continue;
				const orderData = target.unitAIOrderData();
				const currentTarget = orderData && orderData.length && orderData[0].target ?
					gameState.getEntityById(orderData[0].target) : undefined;
				if (currentTarget)
				{
					const unitAIState = target.unitAIState();
					const unitAIStateOrder = unitAIState ? unitAIState.split(".")[1] : "";
					if (unitAIStateOrder === "COMBAT" && (currentTarget.id() === attacker.id() ||
						!currentTarget.hasClasses(["Structure", "Support"])))
						continue;
					if (unitAIStateOrder === "REPAIR" && currentTarget.hasDefensiveFire())
						continue;
					if (unitAIStateOrder === "COMBAT" && !isSiegeUnit(currentTarget) &&
					    gameState.ai.HQ.capturableTargets.has(orderData[0].target))
					{
						// Take the nearest unit also attacking this structure to help us.
						const capturableTarget = gameState.ai.HQ.capturableTargets.get(orderData[0].target);
						let minDist;
						let minEnt;
						const pos = attacker.position();
						capturableTarget.ents.delete(target.id());
						for (const entId of capturableTarget.ents)
						{
							if (allAttacked[entId])
								continue;
							const ent = gameState.getEntityById(entId);
							if (!ent || !ent.position() || !ent.canAttackTarget(attacker,
								allowCapture(gameState, ent, attacker)))
							{
								continue;
							}
							// Check that the unit is still attacking the structure (since the last played turn).
							const state = ent.unitAIState();
							if (!state || !state.split(".")[1] || state.split(".")[1] != "COMBAT")
								continue;
							const entOrderData = ent.unitAIOrderData();
							if (!entOrderData || !entOrderData.length || !entOrderData[0].target ||
							     entOrderData[0].target != orderData[0].target)
								continue;
							const dist = SquareVectorDistance(pos, ent.position());
							if (minEnt && dist > minDist)
								continue;
							minDist = dist;
							minEnt = ent;
						}
						if (minEnt)
						{
							capturableTarget.ents.delete(minEnt.id());
							minEnt.attack(attacker.id(), allowCapture(gameState, minEnt, attacker));
						}
					}
				}
				const shouldCapture = allowCapture(gameState, target, attacker);
				if (target.canAttackTarget(attacker, shouldCapture))
					target.attack(attacker.id(), shouldCapture);
			}
		}
	}

	garrisonUnitsInside(gameState, target, data)
	{
		if (target.hitpoints() < target.garrisonEjectHealth() * target.maxHitpoints())
			return false;
		const minGarrison = data.min || target.garrisonMax();
		if (gameState.ai.HQ.garrisonManager.numberOfGarrisonedSlots(target) >= minGarrison)
			return false;
		if (data.attacker)
		{
			const attackTypes = target.attackTypes();
			if (!attackTypes || attackTypes.indexOf("Ranged") == -1)
				return false;
			const dist = SquareVectorDistance(data.attacker.position(), target.position());
			const range = target.attackRange("Ranged").max;
			if (dist >= range*range)
				return false;
		}
		const access = getLandAccess(gameState, target);
		const garrisonManager = gameState.ai.HQ.garrisonManager;
		const garrisonArrowClasses = target.getGarrisonArrowClasses();
		const typeGarrison = data.type || GarrisonManager.TYPE_PROTECTION;
		let allowMelee = gameState.ai.HQ.garrisonManager.allowMelee(target);
		if (allowMelee === undefined)
		{
			// Should be kept in sync with garrisonManager to avoid garrisoning-ungarrisoning some units.
			if (data.attacker)
			{
				allowMelee = data.attacker.hasClass("Structure") ? data.attacker.attackRange("Ranged") :
					!isSiegeUnit(data.attacker);
			}
			else
				allowMelee = true;
		}
		const units = gameState.getOwnUnits().filter(ent =>
		{
			if (!ent.position())
				return false;
			if (!ent.hasClasses(garrisonArrowClasses))
				return false;
			if (typeGarrison !== GarrisonManager.TYPE_DECAY && !allowMelee && ent.attackTypes().indexOf("Melee") != -1)
				return false;
			if (ent.getMetadata(PlayerID, "transport") !== undefined)
				return false;
			const army = ent.getMetadata(PlayerID, "PartOfArmy") ? this.getArmy(ent.getMetadata(PlayerID, "PartOfArmy")) : undefined;
			if (!army && (ent.getMetadata(PlayerID, "plan") == -2 || ent.getMetadata(PlayerID, "plan") == -3))
				return false;
			if (ent.getMetadata(PlayerID, "plan") !== undefined && ent.getMetadata(PlayerID, "plan") >= 0)
			{
				const subrole = ent.getMetadata(PlayerID, "subrole");
				// When structure decaying (usually because we've just captured it in enemy territory), also allow units from an attack plan.
				if (typeGarrison !== GarrisonManager.TYPE_DECAY && subrole &&
					(subrole === Worker.SUBROLE_COMPLETING || subrole === Worker.SUBROLE_WALKING ||
					subrole === Worker.SUBROLE_ATTACKING))
				{
					return false;
				}
			}
			if (getLandAccess(gameState, ent) != access)
				return false;
			return true;
		}).filterNearest(target.position());

		let ret = false;
		for (const ent of units.values())
		{
			if (garrisonManager.numberOfGarrisonedSlots(target) >= minGarrison)
				break;
			if (ent.getMetadata(PlayerID, "plan") !== undefined && ent.getMetadata(PlayerID, "plan") >= 0)
			{
				const attackPlan = gameState.ai.HQ.attackManager.getPlan(ent.getMetadata(PlayerID, "plan"));
				if (attackPlan)
					attackPlan.removeUnit(ent, true);
			}
			const army = ent.getMetadata(PlayerID, "PartOfArmy") ? this.getArmy(ent.getMetadata(PlayerID, "PartOfArmy")) : undefined;
			if (army)
				army.removeOwn(gameState, ent.id());
			garrisonManager.garrison(gameState, ent, target, typeGarrison);
			ret = true;
		}
		return ret;
	}

	/** Garrison a attacked siege ranged unit inside the nearest fortress. */
	garrisonSiegeUnit(gameState, unit)
	{
		let distmin = Math.min();
		let nearest;
		const unitAccess = getLandAccess(gameState, unit);
		const garrisonManager = gameState.ai.HQ.garrisonManager;
		for (const ent of gameState.getAllyStructures().values())
		{
			if (!ent.isGarrisonHolder())
				continue;
			if (!unit.hasClasses(ent.garrisonableClasses()))
				continue;
			if (garrisonManager.numberOfGarrisonedSlots(ent) >= ent.garrisonMax())
				continue;
			if (ent.hitpoints() < ent.garrisonEjectHealth() * ent.maxHitpoints())
				continue;
			if (getLandAccess(gameState, ent) != unitAccess)
				continue;
			const dist = SquareVectorDistance(ent.position(), unit.position());
			if (dist > distmin)
				continue;
			distmin = dist;
			nearest = ent;
		}
		if (nearest)
			garrisonManager.garrison(gameState, unit, nearest, GarrisonManager.TYPE_PROTECTION);
		return nearest !== undefined;
	}

	/**
	 * Garrison a hurt unit inside a player-owned or allied structure.
	 * If emergency is true, the unit will be garrisoned in the closest possible structure.
	 * Otherwise, it will garrison in the closest healing structure.
	 */
	garrisonAttackedUnit(gameState, unit, emergency = false)
	{
		let distmin = Math.min();
		let nearest;
		const unitAccess = getLandAccess(gameState, unit);
		const garrisonManager = gameState.ai.HQ.garrisonManager;
		for (const ent of gameState.getAllyStructures().values())
		{
			if (!ent.isGarrisonHolder())
				continue;
			if (!emergency && !ent.buffHeal())
				continue;
			if (!unit.hasClasses(ent.garrisonableClasses()))
				continue;
			if (garrisonManager.numberOfGarrisonedSlots(ent) >= ent.garrisonMax() &&
			    (!emergency || !ent.garrisoned().length))
				continue;
			if (ent.hitpoints() < ent.garrisonEjectHealth() * ent.maxHitpoints())
				continue;
			if (getLandAccess(gameState, ent) != unitAccess)
				continue;
			const dist = SquareVectorDistance(ent.position(), unit.position());
			if (dist > distmin)
				continue;
			distmin = dist;
			nearest = ent;
		}
		if (!nearest)
			return false;

		if (!emergency)
		{
			garrisonManager.garrison(gameState, unit, nearest, GarrisonManager.TYPE_PROTECTION);
			return true;
		}
		if (garrisonManager.numberOfGarrisonedSlots(nearest) >= nearest.garrisonMax()) // make room for this ent
			nearest.unload(nearest.garrisoned()[0]);

		garrisonManager.garrison(gameState, unit, nearest,
			nearest.buffHeal() ? GarrisonManager.TYPE_PROTECTION : GarrisonManager.TYPE_EMERGENCY);
		return true;
	}

	/**
	 * Be more inclined to help an ally attacked by several enemies.
	 */
	GetCooperationLevel(ally)
	{
		let cooperation = this.Config.personality.cooperative;
		if (this.attackedAllies[ally] && this.attackedAllies[ally] > 1)
			cooperation += 0.2 * (this.attackedAllies[ally] - 1);
		return cooperation;
	}

	/**
	 * Switch a defense army into an attack if needed.
	 */
	switchToAttack(gameState, army)
	{
		if (!army)
			return;
		for (const targetId of this.targetList)
		{
			const target = gameState.getEntityById(targetId);
			if (!target || !target.position() || !gameState.isPlayerEnemy(target.owner()))
				continue;
			const targetAccess = getLandAccess(gameState, target);
			const targetPos = target.position();
			for (const entId of army.ownEntities)
			{
				const ent = gameState.getEntityById(entId);
				if (!ent || !ent.position() || getLandAccess(gameState, ent) != targetAccess)
					continue;
				if (SquareVectorDistance(targetPos, ent.position()) > 14400)
					continue;
				gameState.ai.HQ.attackManager.switchDefenseToAttack(gameState, target, { "armyID": army.ID, "uniqueTarget": true });
				return;
			}
		}
	}

	Serialize()
	{
		const properties = {
			"targetList": this.targetList,
			"armyMergeSize": this.armyMergeSize,
			"attackingUnits": this.attackingUnits,
			"attackingArmies": this.attackingArmies,
			"attackedAllies": this.attackedAllies
		};

		const armies = [];
		for (const army of this.armies)
			armies.push(army.Serialize());

		return { "properties": properties, "armies": armies };
	}

	Deserialize(gameState, data)
	{
		for (const key in data.properties)
			this[key] = data.properties[key];

		this.armies = [];
		for (const dataArmy of data.armies)
		{
			const army = new DefenseArmy(gameState, []);
			army.Deserialize(dataArmy);
			this.armies.push(army);
		}
	}
}
