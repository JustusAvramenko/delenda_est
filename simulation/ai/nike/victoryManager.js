import * as filters from "simulation/ai/common-api/filters.js";
import { SquareVectorDistance } from "simulation/ai/common-api/utils.js";
import { AttackPlan } from "simulation/ai/nike/attackPlan.js";
import { getAttackBonus, getBestBase, getLandAccess, returnResources } from
	"simulation/ai/nike/entityExtend.js";
import { TrainingPlan } from "simulation/ai/nike/queueplanTraining.js";
import { Worker } from "simulation/ai/nike/worker.js";

/**
 * Handle events that are important to specific victory conditions:
 *   in capture_the_relic, capture gaia relics and train military guards.
 *   in regicide, train healer and military guards for the hero.
 *   in wonder, train military guards.
 */

export class VictoryManager
{
	constructor(Config)
	{
		this.Config = Config;
		this.criticalEnts = new Map();
		// Holds ids of all ents who are (or can be) guarding and if the ent is currently guarding
		this.guardEnts = new Map();
		this.healersPerCriticalEnt = 2 + Math.round(this.Config.personality.defensive * 2);
		this.tryCaptureGaiaRelic = false;
		this.tryCaptureGaiaRelicLapseTime = -1;
		// Gaia relics which we are targeting currently and have not captured yet
		this.targetedGaiaRelics = new Map();
	}

	/**
	 * Cache the ids of any inital victory-critical entities.
	 */
	init(gameState)
	{
		if (gameState.getVictoryConditions().has("wonder"))
		{
			for (const wonder of gameState.getOwnEntitiesByClass("Wonder", true).values())
				this.criticalEnts.set(wonder.id(), { "guardsAssigned": new Set(), "guards": new Map() });
		}

		if (gameState.getVictoryConditions().has("regicide"))
		{
			for (const hero of gameState.getOwnEntitiesByClass("Hero", true).values())
			{
				const defaultStance = hero.hasClass("Soldier") ? "aggressive" : "passive";
				if (hero.getStance() != defaultStance)
					hero.setStance(defaultStance);
				this.criticalEnts.set(hero.id(), {
					"garrisonEmergency": false,
					"healersAssigned": new Set(),
					"guardsAssigned": new Set(), // for non-healer guards
					"guards": new Map() // ids of ents who are currently guarding this hero
				});
			}
		}

		if (gameState.getVictoryConditions().has("capture_the_relic"))
		{
			for (const relic of
				gameState.updatingGlobalCollection("allRelics", filters.byClass("Relic")).values())
			{
				if (relic.owner() == PlayerID)
					this.criticalEnts.set(relic.id(), { "guardsAssigned": new Set(), "guards": new Map() });
			}
		}
	}

	/**
	 * In regicide victory condition, if the hero has less than 70% health, try to garrison it in a healing structure
	 * If it is less than 40%, try to garrison in the closest possible structure
	 * If the hero cannot garrison, retreat it to the closest base
	 */
	checkEvents(gameState, events)
	{
		if (gameState.getVictoryConditions().has("wonder"))
		{
			for (const evt of events.Create)
			{
				const ent = gameState.getEntityById(evt.entity);
				if (!ent || !ent.isOwn(PlayerID) || ent.foundationProgress() === undefined ||
					!ent.hasClass("Wonder"))
					continue;

				// Let's get a few units from other bases to build the wonder.
				const base = gameState.ai.HQ.getBaseByID(ent.getMetadata(PlayerID, "base"));
				const builders = gameState.ai.HQ.bulkPickWorkers(gameState, base, 10);
				if (builders)
					for (const worker of builders.values())
					{
						worker.setMetadata(PlayerID, "base", base.ID);
						worker.setMetadata(PlayerID, "subrole", Worker.SUBROLE_BUILDER);
						worker.setMetadata(PlayerID, "target-foundation", ent.id());
					}
			}

			for (const evt of events.ConstructionFinished)
			{
				if (!evt || !evt.newentity)
					continue;

				const ent = gameState.getEntityById(evt.newentity);
				if (ent && ent.isOwn(PlayerID) && ent.hasClass("Wonder"))
					this.criticalEnts.set(ent.id(), { "guardsAssigned": new Set(), "guards": new Map() });
			}
		}

		if (gameState.getVictoryConditions().has("regicide"))
		{
			for (const evt of events.Attacked)
			{
				if (!this.criticalEnts.has(evt.target))
					continue;

				const target = gameState.getEntityById(evt.target);
				if (!target || !target.position() || target.healthLevel() > this.Config.garrisonHealthLevel.high)
					continue;

				const plan = target.getMetadata(PlayerID, "plan");
				const hero = this.criticalEnts.get(evt.target);
				if (plan != -2 && plan != -3)
				{
					target.stopMoving();

					if (plan >= 0)
					{
						const attackPlan = gameState.ai.HQ.attackManager.getPlan(plan);
						if (attackPlan)
							attackPlan.removeUnit(target, true);
					}

					if (target.getMetadata(PlayerID, "PartOfArmy"))
					{
						const army = gameState.ai.HQ.defenseManager.getArmy(target.getMetadata(PlayerID, "PartOfArmy"));
						if (army)
							army.removeOwn(gameState, target.id());
					}

					hero.garrisonEmergency = target.healthLevel() < this.Config.garrisonHealthLevel.low;
					this.pickCriticalEntRetreatLocation(gameState, target, hero.garrisonEmergency);
				}
				else if (target.healthLevel() < this.Config.garrisonHealthLevel.low && !hero.garrisonEmergency)
				{
					// the hero is severely wounded, try to retreat/garrison quicker
					gameState.ai.HQ.garrisonManager.cancelGarrison(target);
					this.pickCriticalEntRetreatLocation(gameState, target, true);
					hero.garrisonEmergency = true;
				}
			}

			for (const evt of events.TrainingFinished)
				for (const entId of evt.entities)
				{
					const ent = gameState.getEntityById(entId);
					if (ent && ent.isOwn(PlayerID) && ent.getMetadata(PlayerID, "role") === Worker.ROLE_CRITICAL_ENT_HEALER)
						this.assignGuardToCriticalEnt(gameState, ent);
				}

			for (const evt of events.Garrison)
			{
				if (!this.criticalEnts.has(evt.entity))
					continue;

				const hero = this.criticalEnts.get(evt.entity);
				if (hero.garrisonEmergency)
					hero.garrisonEmergency = false;

				const holderEnt = gameState.getEntityById(evt.holder);
				if (!holderEnt)
					continue;

				if (holderEnt.hasClass("Ship"))
				{
					// If the hero is garrisoned on a ship, remove its guards
					for (const guardId of hero.guards.keys())
					{
						const guardEnt = gameState.getEntityById(guardId);
						if (!guardEnt)
							continue;

						guardEnt.removeGuard();
						this.guardEnts.set(guardId, false);
					}
					hero.guards.clear();
					continue;
				}

				// Move the current guards to the garrison location.
				// TODO: try to garrison them with the critical ent.
				for (const guardId of hero.guards.keys())
				{
					const guardEnt = gameState.getEntityById(guardId);
					if (!guardEnt)
						continue;

					const plan = guardEnt.getMetadata(PlayerID, "plan");

					// Current military guards (with Soldier class) will have been assigned plan metadata, but healer guards
					// are not assigned a plan, and so they could be already moving to garrison somewhere due to low health.
					if (!guardEnt.hasClass("Soldier") && (plan == -2 || plan == -3))
						continue;

					const pos = holderEnt.position();
					const radius = holderEnt.obstructionRadius().max;
					if (pos)
						guardEnt.moveToRange(pos[0], pos[1], radius, radius + 5);
				}
			}
		}

		for (const evt of events.EntityRenamed)
		{
			if (!this.guardEnts.has(evt.entity))
				continue;
			for (const data of this.criticalEnts.values())
			{
				if (!data.guards.has(evt.entity))
					continue;
				data.guards.set(evt.newentity, data.guards.get(evt.entity));
				data.guards.delete(evt.entity);
				break;
			}
			this.guardEnts.set(evt.newentity, this.guardEnts.get(evt.entity));
			this.guardEnts.delete(evt.entity);
		}

		// Check if new healers/guards need to be assigned to an ent
		for (const evt of events.Destroy)
		{
			if (this.criticalEnts.has(evt.entity))
			{
				this.removeCriticalEnt(gameState, evt.entity);
				continue;
			}

			if (!this.guardEnts.delete(evt.entity))
				continue;

			for (const data of this.criticalEnts.values())
			{
				if (data.guards.delete(evt.entity))
				{
					data.healersAssigned?.delete(evt.entity);
					data.guardsAssigned.delete(evt.entity);
				}
			}
		}

		for (const evt of events.UnGarrison)
		{
			if (!this.guardEnts.has(evt.entity) && !this.criticalEnts.has(evt.entity))
				continue;

			const ent = gameState.getEntityById(evt.entity);
			if (!ent)
				continue;

			// If this ent travelled to a criticalEnt's accessValue, try again to assign as a guard
			if ((ent.getMetadata(PlayerID, "role") === Worker.ROLE_CRITICAL_ENT_HEALER ||
			     ent.getMetadata(PlayerID, "role") === Worker.ROLE_CRITICAL_ENT_GUARD) && !this.guardEnts.get(evt.entity))
			{
				this.assignGuardToCriticalEnt(gameState, ent, ent.getMetadata(PlayerID, "guardedEnt"));
				continue;
			}

			if (!this.criticalEnts.has(evt.entity))
				continue;

			// If this is a hero, try to assign ents that should be guarding it, but couldn't previously
			const criticalEnt = this.criticalEnts.get(evt.entity);
			for (const [id, isGuarding] of this.guardEnts)
			{
				if (criticalEnt.guards.size >= this.healersPerCriticalEnt)
					break;

				if (!isGuarding)
				{
					const guardEnt = gameState.getEntityById(id);
					if (guardEnt)
						this.assignGuardToCriticalEnt(gameState, guardEnt, evt.entity);
				}
			}
		}

		for (const evt of events.OwnershipChanged)
		{
			if (evt.from == PlayerID && this.criticalEnts.has(evt.entity))
			{
				this.removeCriticalEnt(gameState, evt.entity);
				continue;
			}
			if (evt.from == 0 && this.targetedGaiaRelics.has(evt.entity))
				this.abortCaptureGaiaRelic(gameState, evt.entity);

			if (evt.to != PlayerID)
				continue;

			const ent = gameState.getEntityById(evt.entity);
			if (ent && (gameState.getVictoryConditions().has("wonder") && ent.hasClass("Wonder") ||
				      gameState.getVictoryConditions().has("capture_the_relic") && ent.hasClass("Relic")))
			{
				this.criticalEnts.set(ent.id(), { "guardsAssigned": new Set(), "guards": new Map() });
				// Move captured relics to the closest base
				if (ent.hasClass("Relic"))
					this.pickCriticalEntRetreatLocation(gameState, ent, false);
			}
		}
	}

	removeCriticalEnt(gameState, criticalEntId)
	{
		for (const [guardId, role] of this.criticalEnts.get(criticalEntId).guards)
		{
			const guardEnt = gameState.getEntityById(guardId);
			if (!guardEnt)
				continue;

			if (role == "healer")
				this.guardEnts.set(guardId, false);
			else
			{
				guardEnt.setMetadata(PlayerID, "plan", -1);
				guardEnt.setMetadata(PlayerID, "role", undefined);
				this.guardEnts.delete(guardId);
			}

			if (guardEnt.getMetadata(PlayerID, "guardedEnt"))
				guardEnt.setMetadata(PlayerID, "guardedEnt", undefined);
		}
		this.criticalEnts.delete(criticalEntId);
	}

	/**
	 * Train more healers to be later affected to critical entities if needed
	 */
	manageCriticalEntHealers(gameState, queues)
	{
		if (gameState.ai.HQ.saveResources || queues.healer.hasQueuedUnits() ||
		    !gameState.getOwnEntitiesByClass("Temple", true).hasEntities() ||
		    this.guardEnts.size > Math.min(gameState.getPopulationMax() / 10, gameState.getPopulation() / 4))
			return;

		for (const data of this.criticalEnts.values())
		{
			if (data.healersAssigned === undefined)
				continue;
			if (data.healersAssigned.size >= this.healersPerCriticalEnt)
				continue;

			const template = gameState.applyCiv("units/{civ}/support_healer_b");
			queues.healer.addPlan(new TrainingPlan(gameState, template,
				{ "role": Worker.ROLE_CRITICAL_ENT_HEALER, "base": 0 }, 1, 1));
			return;
		}
	}

	/**
	 * Try to keep some military units guarding any criticalEnts, if we can afford it.
	 * If we have too low a population and require units for other needs, remove guards so they can be reassigned.
	 * TODO: Swap citizen soldier guards with champions if they become available.
	 */
	manageCriticalEntGuards(gameState)
	{
		let numWorkers = gameState.getOwnEntitiesByRole(Worker.ROLE_WORKER, true).length;
		if (numWorkers < 20)
		{
			for (const data of this.criticalEnts.values())
			{
				for (const guardId of data.guards.keys())
				{
					const guardEnt = gameState.getEntityById(guardId);
					if (!guardEnt || !guardEnt.hasClass("CitizenSoldier") ||
					    guardEnt.getMetadata(PlayerID, "role") !== Worker.ROLE_CRITICAL_ENT_GUARD)
						continue;

					guardEnt.removeGuard();
					guardEnt.setMetadata(PlayerID, "plan", -1);
					guardEnt.setMetadata(PlayerID, "role", undefined);
					this.guardEnts.delete(guardId);
					data.guardsAssigned.add(guardId);

					if (guardEnt.getMetadata(PlayerID, "guardedEnt"))
						guardEnt.setMetadata(PlayerID, "guardedEnt", undefined);

					if (++numWorkers >= 20)
						break;
				}
				if (numWorkers >= 20)
					break;
			}
		}

		const minWorkers = 25;
		const deltaWorkers = 3;
		for (const [id, data] of this.criticalEnts)
		{
			const criticalEnt = gameState.getEntityById(id);
			if (!criticalEnt)
				continue;

			const militaryGuardsPerCriticalEnt = (criticalEnt.hasClass("Wonder") ? 10 : 4) +
				Math.round(this.Config.personality.defensive * 5);

			if (data.guardsAssigned.size >= militaryGuardsPerCriticalEnt)
				continue;

			// First try to pick guards in the criticalEnt's accessIndex, to avoid unnecessary transports
			for (const checkForSameAccess of [true, false])
			{
				// First try to assign any Champion units we might have
				for (const entity of gameState.getOwnEntitiesByClass("Champion", true).values())
				{
					if (!this.tryAssignMilitaryGuard(gameState, entity, criticalEnt, checkForSameAccess))
						continue;
					data.guardsAssigned.add(entity.id());
					if (data.guardsAssigned.size >= militaryGuardsPerCriticalEnt)
						break;
				}

				if (data.guardsAssigned.size >= militaryGuardsPerCriticalEnt ||
					numWorkers <= minWorkers + deltaWorkers * data.guardsAssigned.size)
				{
					break;
				}

				for (const entity of gameState.ai.HQ.attackManager.outOfPlan.values())
				{
					if (!this.tryAssignMilitaryGuard(gameState, entity, criticalEnt, checkForSameAccess))
						continue;
					--numWorkers;
					data.guardsAssigned.add(entity.id());
					if (data.guardsAssigned.size >= militaryGuardsPerCriticalEnt ||
						numWorkers <= minWorkers + deltaWorkers * data.guardsAssigned.size)
					{
						break;
					}
				}

				if (data.guardsAssigned.size >= militaryGuardsPerCriticalEnt ||
					numWorkers <= minWorkers + deltaWorkers * data.guardsAssigned.size)
				{
					break;
				}

				for (const entity of gameState.getOwnEntitiesByClass("Soldier", true).values())
				{
					if (!this.tryAssignMilitaryGuard(gameState, entity, criticalEnt, checkForSameAccess))
						continue;
					--numWorkers;
					data.guardsAssigned.add(entity.id());
					if (data.guardsAssigned.size >= militaryGuardsPerCriticalEnt ||
						numWorkers <= minWorkers + deltaWorkers * data.guardsAssigned.size)
					{
						break;
					}
				}

				if (data.guardsAssigned.size >= militaryGuardsPerCriticalEnt ||
					numWorkers <= minWorkers + deltaWorkers * data.guardsAssigned.size)
				{
					break;
				}
			}
		}
	}

	tryAssignMilitaryGuard(gameState, guardEnt, criticalEnt, checkForSameAccess)
	{
		if (guardEnt.getMetadata(PlayerID, "plan") !== undefined ||
		    guardEnt.getMetadata(PlayerID, "transport") !== undefined || this.criticalEnts.has(guardEnt.id()) ||
		    checkForSameAccess && (!guardEnt.position() || !criticalEnt.position() ||
		    getLandAccess(gameState, criticalEnt) != getLandAccess(gameState, guardEnt)))
			return false;

		if (!this.assignGuardToCriticalEnt(gameState, guardEnt, criticalEnt.id()))
			return false;

		guardEnt.setMetadata(PlayerID, "plan", -2);
		guardEnt.setMetadata(PlayerID, "role", Worker.ROLE_CRITICAL_ENT_GUARD);
		return true;
	}

	pickCriticalEntRetreatLocation(gameState, criticalEnt, emergency)
	{
		gameState.ai.HQ.defenseManager.garrisonAttackedUnit(gameState, criticalEnt, emergency);
		const plan = criticalEnt.getMetadata(PlayerID, "plan");

		if (plan == -2 || plan == -3)
			return;

		if (this.criticalEnts.get(criticalEnt.id()).garrisonEmergency)
			this.criticalEnts.get(criticalEnt.id()).garrisonEmergency = false;

		// Couldn't find a place to garrison, so the ent will flee from attacks
		if (!criticalEnt.hasClass("Relic") && criticalEnt.getStance() != "passive")
			criticalEnt.setStance("passive");
		const accessIndex = getLandAccess(gameState, criticalEnt);
		const bestBase = getBestBase(gameState, criticalEnt, true);
		if (bestBase.accessIndex == accessIndex)
		{
			const bestBasePos = bestBase.anchor.position();
			criticalEnt.moveToRange(bestBasePos[0], bestBasePos[1],
				0, bestBase.anchor.obstructionRadius().max);
		}
	}

	/**
	 * Only send the guard command if the guard's accessIndex is the same as the critical ent
	 * and the critical ent has a position (i.e. not garrisoned).
	 * Request a transport if the accessIndex value is different, and if a transport is needed,
	 * the guardEnt will be given metadata describing which entity it is being sent to guard,
	 * which will be used once its transport has finished.
	 * Return false if the guardEnt is not a valid guard unit (i.e. cannot guard or is being transported).
	 */
	assignGuardToCriticalEnt(gameState, guardEnt, criticalEntId)
	{
		if (guardEnt.getMetadata(PlayerID, "transport") !== undefined || !guardEnt.canGuard())
			return false;

		if (criticalEntId && !this.criticalEnts.has(criticalEntId))
		{
			criticalEntId = undefined;
			if (guardEnt.getMetadata(PlayerID, "guardedEnt"))
				guardEnt.setMetadata(PlayerID, "guardedEnt", undefined);
		}

		if (!criticalEntId)
		{
			const isHealer = guardEnt.hasClass("Healer");

			// Assign to the critical ent with the fewest guards
			let min = Math.min();
			for (const [id, data] of this.criticalEnts)
			{
				if (isHealer && (data.healersAssigned === undefined || data.healersAssigned.size > min))
					continue;
				if (!isHealer && data.guardsAssigned.size > min)
					continue;

				criticalEntId = id;
				min = data[isHealer ? "healersAssigned" : "guardsAssigned"].size;
			}
			if (criticalEntId)
			{
				const data = this.criticalEnts.get(criticalEntId);
				data[isHealer ? "healersAssigned" : "guardsAssigned"].add(guardEnt.id());
			}
		}

		if (!criticalEntId)
		{
			if (guardEnt.getMetadata(PlayerID, "guardedEnt"))
				guardEnt.setMetadata(PlayerID, "guardedEnt", undefined);
			return false;
		}

		const criticalEnt = gameState.getEntityById(criticalEntId);
		if (!criticalEnt || !criticalEnt.position() || !guardEnt.position())
		{
			this.guardEnts.set(guardEnt.id(), false);
			return false;
		}

		if (guardEnt.getMetadata(PlayerID, "guardedEnt") != criticalEntId)
			guardEnt.setMetadata(PlayerID, "guardedEnt", criticalEntId);

		const guardEntAccess = getLandAccess(gameState, guardEnt);
		const criticalEntAccess = getLandAccess(gameState, criticalEnt);
		if (guardEntAccess == criticalEntAccess)
		{
			const queued = returnResources(gameState, guardEnt);
			guardEnt.guard(criticalEnt, queued);
			const guardRole = guardEnt.getMetadata(PlayerID, "role") === Worker.ROLE_CRITICAL_ENT_HEALER ? "healer" : "guard";
			this.criticalEnts.get(criticalEntId).guards.set(guardEnt.id(), guardRole);

			// Switch this guard ent to the criticalEnt's base
			if (criticalEnt.hasClass("Structure") && criticalEnt.getMetadata(PlayerID, "base") !== undefined)
				guardEnt.setMetadata(PlayerID, "base", criticalEnt.getMetadata(PlayerID, "base"));
		}
		else
			gameState.ai.HQ.navalManager.requireTransport(gameState, guardEnt, guardEntAccess, criticalEntAccess, criticalEnt.position());

		this.guardEnts.set(guardEnt.id(), guardEntAccess == criticalEntAccess);
		return true;
	}

	resetCaptureGaiaRelic(gameState)
	{
		// Do not capture gaia relics too frequently as the ai has access to the entire map
		this.tryCaptureGaiaRelicLapseTime = gameState.ai.elapsedTime + 240 - 30 * (this.Config.difficulty - 3);
		this.tryCaptureGaiaRelic = false;
	}

	update(gameState, events, queues)
	{
		// Wait a turn for trigger scripts to spawn any critical ents (i.e. in regicide)
		if (gameState.ai.playedTurn == 1)
			this.init(gameState);

		this.checkEvents(gameState, events);

		if (gameState.ai.playedTurn % 10 != 0 ||
		    !gameState.getVictoryConditions().has("wonder") && !gameState.getVictoryConditions().has("regicide") &&
		    !gameState.getVictoryConditions().has("capture_the_relic"))
			return;

		this.manageCriticalEntGuards(gameState);

		if (gameState.getVictoryConditions().has("wonder"))
			gameState.ai.HQ.buildWonder(gameState, queues, true);

		if (gameState.getVictoryConditions().has("regicide"))
		{
			for (const id of this.criticalEnts.keys())
			{
				const ent = gameState.getEntityById(id);
				if (ent && ent.healthLevel() > this.Config.garrisonHealthLevel.high && ent.hasClass("Soldier") &&
				    ent.getStance() != "aggressive")
					ent.setStance("aggressive");
			}
			this.manageCriticalEntHealers(gameState, queues);
		}

		if (gameState.getVictoryConditions().has("capture_the_relic"))
		{
			if (!this.tryCaptureGaiaRelic && gameState.ai.elapsedTime > this.tryCaptureGaiaRelicLapseTime)
				this.tryCaptureGaiaRelic = true;

			// Reinforce (if needed) any raid currently trying to capture a gaia relic
			for (const relicId of this.targetedGaiaRelics.keys())
			{
				const relic = gameState.getEntityById(relicId);
				if (!relic || relic.owner() != 0)
					this.abortCaptureGaiaRelic(gameState, relicId);
				else
					this.captureGaiaRelic(gameState, relic);
			}
			// And look for some new gaia relics visible by any of our units
			// or that may be on our territory
			const allGaiaRelics = gameState.updatingGlobalCollection("allRelics", filters.byClass("Relic"))
				.filter(relic => relic.owner() == 0);
			for (const relic of allGaiaRelics.values())
			{
				const relicPosition = relic.position();
				if (!relicPosition || this.targetedGaiaRelics.has(relic.id()))
					continue;
				const territoryOwner = gameState.ai.HQ.territoryMap.getOwner(relicPosition);
				if (territoryOwner == PlayerID)
				{
					this.targetedGaiaRelics.set(relic.id(), []);
					this.captureGaiaRelic(gameState, relic);
					break;
				}

				if (territoryOwner != 0 && gameState.isPlayerEnemy(territoryOwner))
					continue;

				for (const ent of gameState.getOwnUnits().values())
				{
					if (!ent.position() || !ent.visionRange())
						continue;
					if (SquareVectorDistance(ent.position(), relicPosition) > Math.square(ent.visionRange()))
						continue;
					this.targetedGaiaRelics.set(relic.id(), []);
					this.captureGaiaRelic(gameState, relic);
					break;
				}
			}
		}
	}

	/**
	 * Send an expedition to capture a gaia relic, or reinforce an existing one.
	 */
	captureGaiaRelic(gameState, relic)
	{
		let capture = -relic.defaultRegenRate();
		const sumCapturePoints = relic.capturePoints().reduce((a, b) => a + b);
		const plans = this.targetedGaiaRelics.get(relic.id());
		for (const plan of plans)
		{
			const attack = gameState.ai.HQ.attackManager.getPlan(plan);
			if (!attack)
				continue;
			for (const ent of attack.unitCollection.values())
				capture += ent.captureStrength() * getAttackBonus(ent, relic, "Capture");
		}
		// No need to make a new attack if already enough units
		if (capture > sumCapturePoints / 50)
			return;
		const relicPosition = relic.position();
		const access = getLandAccess(gameState, relic);
		const units = gameState.getOwnUnits().filter(ent =>
		{
			if (!ent.position() || !ent.canCapture(relic))
				return false;
			if (ent.getMetadata(PlayerID, "transport") !== undefined)
				return false;
			if (ent.getMetadata(PlayerID, "PartOfArmy") !== undefined)
				return false;
			const plan = ent.getMetadata(PlayerID, "plan");
			if (plan == -2 || plan == -3)
				return false;
			if (plan !== undefined && plan >= 0)
			{
				const attack = gameState.ai.HQ.attackManager.getPlan(plan);
				if (attack && (attack.state !== AttackPlan.STATE_UNEXECUTED ||
					attack.type === AttackPlan.TYPE_RAID))
				{
					return false;
				}
			}
			if (getLandAccess(gameState, ent) != access)
				return false;
			return true;
		}).filterNearest(relicPosition);
		const expedition = [];
		for (const ent of units.values())
		{
			capture += ent.captureStrength() * getAttackBonus(ent, relic, "Capture");
			expedition.push(ent);
			if (capture > sumCapturePoints / 25)
				break;
		}
		if (!expedition.length || !plans.length && capture < sumCapturePoints / 100)
			return;
		const attack = gameState.ai.HQ.attackManager.raidTargetEntity(gameState, relic);
		if (!attack)
			return;
		const plan = attack.name;
		attack.rallyPoint = undefined;
		for (const ent of expedition)
		{
			ent.setMetadata(PlayerID, "plan", plan);
			attack.unitCollection.updateEnt(ent);
			if (!attack.rallyPoint)
				attack.rallyPoint = ent.position();
		}
		attack.forceStart();
		this.targetedGaiaRelics.get(relic.id()).push(plan);
	}

	abortCaptureGaiaRelic(gameState, relicId)
	{
		for (const plan of this.targetedGaiaRelics.get(relicId))
		{
			const attack = gameState.ai.HQ.attackManager.getPlan(plan);
			if (attack)
				attack.Abort(gameState);
		}
		this.targetedGaiaRelics.delete(relicId);
	}

	Serialize()
	{
		return {
			"criticalEnts": this.criticalEnts,
			"guardEnts": this.guardEnts,
			"healersPerCriticalEnt": this.healersPerCriticalEnt,
			"tryCaptureGaiaRelic": this.tryCaptureGaiaRelic,
			"tryCaptureGaiaRelicLapseTime": this.tryCaptureGaiaRelicLapseTime,
			"targetedGaiaRelics": this.targetedGaiaRelics
		};
	}

	Deserialize(data)
	{
		for (const key in data)
			this[key] = data[key];
	}
}
