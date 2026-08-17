import * as filters from "simulation/ai/common-api/filters.js";
import { SquareVectorDistance, aiWarn } from "simulation/ai/common-api/utils.js";
import { allowCapture, gatherTreasure, getBuiltEntity, getLandAccess, getSeaAccess, isFastMoving,
	isSupplyFull, returnResources } from "simulation/ai/nike/entityExtend.js";
import { TransportPlan } from "simulation/ai/nike/transportPlan.js";

/**
 * This class makes a worker do as instructed by the economy manager
 */
export class Worker
{
	constructor(base)
	{
		this.ent = undefined;
		this.base = base;
		this.baseID = base.ID;
	}

	static ROLE_ATTACK = "attack";
	static ROLE_TRADER = "trader";
	static ROLE_SWITCH_TO_TRADER = "switchToTrader";
	static ROLE_WORKER = "worker";
	static ROLE_CRITICAL_ENT_GUARD = "criticalEntGuard";
	static ROLE_CRITICAL_ENT_HEALER = "criticalEntHealer";

	static SUBROLE_DEFENDER = "defender";
	static SUBROLE_IDLE = "idle";
	static SUBROLE_BUILDER = "builder";
	static SUBROLE_COMPLETING = "completing";
	static SUBROLE_WALKING = "walking";
	static SUBROLE_ATTACKING = "attacking";
	static SUBROLE_GATHERER = "gatherer";
	static SUBROLE_HUNTER = "hunter";
	static SUBROLE_FISHER = "fisher";
	static SUBROLE_GARRISONING = "garrisoning";

	update(gameState, ent)
	{
		if (!ent.position() || ent.getMetadata(PlayerID, "plan") == -2 || ent.getMetadata(PlayerID, "plan") == -3)
			return;

		const subrole = ent.getMetadata(PlayerID, "subrole");

		// If we are waiting for a transport or we are sailing, just wait
		if (ent.getMetadata(PlayerID, "transport") !== undefined)
		{
			// Except if builder with their foundation destroyed, in which case cancel the transport if not yet on board
			if (subrole === Worker.SUBROLE_BUILDER && ent.getMetadata(PlayerID, "target-foundation") !== undefined)
			{
				const plan = gameState.ai.HQ.navalManager.getPlan(ent.getMetadata(PlayerID, "transport"));
				const target = gameState.getEntityById(ent.getMetadata(PlayerID, "target-foundation"));
				if (!target && plan && plan.state === TransportPlan.BOARDING && ent.position())
					plan.removeUnit(gameState, ent);
			}
			// and gatherer if there are no more dropsite accessible in the base the ent is going to
			if (subrole === Worker.SUBROLE_GATHERER || subrole === Worker.SUBROLE_HUNTER)
			{
				const plan = gameState.ai.HQ.navalManager.getPlan(ent.getMetadata(PlayerID, "transport"));
				if (plan.state === TransportPlan.BOARDING && ent.position())
				{
					let hasDropsite = false;
					const gatherType = ent.getMetadata(PlayerID, "gather-type") || "food";
					for (const structure of gameState.getOwnStructures().values())
					{
						if (getLandAccess(gameState, structure) != plan.endIndex)
							continue;
						const resourceDropsiteTypes = getBuiltEntity(gameState, structure).resourceDropsiteTypes();
						if (!resourceDropsiteTypes || resourceDropsiteTypes.indexOf(gatherType) == -1)
							continue;
						hasDropsite = true;
						break;
					}
					if (!hasDropsite)
					{
						for (const unit of gameState.getOwnUnits().filter(filters.byClass("Support")).values())
						{
							if (!unit.position() || getLandAccess(gameState, unit) != plan.endIndex)
								continue;
							const resourceDropsiteTypes = unit.resourceDropsiteTypes();
							if (!resourceDropsiteTypes || resourceDropsiteTypes.indexOf(gatherType) == -1)
								continue;
							hasDropsite = true;
							break;
						}
					}
					if (!hasDropsite)
						plan.removeUnit(gameState, ent);
				}
			}
			if (ent.getMetadata(PlayerID, "transport") !== undefined)
				return;
		}

		this.entAccess = getLandAccess(gameState, ent);
		// Base for unassigned entities has no accessIndex, so take the one from the entity.
		if (this.baseID == gameState.ai.HQ.basesManager.baselessBase().ID)
			this.baseAccess = this.entAccess;
		else
			this.baseAccess = this.base.accessIndex;

		if (subrole == undefined)	// subrole may-be undefined after a transport, garrisoning, army, ...
		{
			ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_IDLE);
			this.base.reassignIdleWorkers(gameState, [ent]);
			this.update(gameState, ent);
			return;
		}

		this.ent = ent;

		const unitAIState = ent.unitAIState();
		if ((subrole === Worker.SUBROLE_HUNTER || subrole === Worker.SUBROLE_GATHERER) &&
		    (unitAIState == "INDIVIDUAL.GATHER.GATHERING" || unitAIState == "INDIVIDUAL.GATHER.APPROACHING" ||
		     unitAIState == "INDIVIDUAL.COMBAT.APPROACHING"))
		{
			if (this.isInaccessibleSupply(gameState))
			{
				if (this.retryWorking(gameState, subrole))
					return;
				ent.stopMoving();
			}

			if (unitAIState == "INDIVIDUAL.COMBAT.APPROACHING" && ent.unitAIOrderData().length)
			{
				const orderData = ent.unitAIOrderData()[0];
				if (orderData && orderData.target)
				{
					// Check that we have not drifted too far when hunting
					const target = gameState.getEntityById(orderData.target);
					if (target && target.resourceSupplyType() && target.resourceSupplyType().generic == "food")
					{
						const territoryOwner = gameState.ai.HQ.territoryMap.getOwner(target.position());
						if (gameState.isPlayerEnemy(territoryOwner))
						{
							if (this.retryWorking(gameState, subrole))
								return;
							ent.stopMoving();
						}
						else if (!gameState.isPlayerAlly(territoryOwner))
						{
							const distanceSquare = isFastMoving(ent) ? 90000 : 30000;
							const targetAccess = getLandAccess(gameState, target);
							const foodDropsites = gameState.playerData.hasSharedDropsites ?
								gameState.getAnyDropsites("food") : gameState.getOwnDropsites("food");
							let hasFoodDropsiteWithinDistance = false;
							for (const dropsite of foodDropsites.values())
							{
								if (!dropsite.position())
									continue;
								const owner = dropsite.owner();
								// owner != PlayerID can only happen when hasSharedDropsites == true, so no need to test it again
								if (owner != PlayerID && (!dropsite.isSharedDropsite() || !gameState.isPlayerMutualAlly(owner)))
									continue;
								if (targetAccess != getLandAccess(gameState, dropsite))
									continue;
								if (SquareVectorDistance(target.position(), dropsite.position()) < distanceSquare)
								{
									hasFoodDropsiteWithinDistance = true;
									break;
								}
							}
							if (!hasFoodDropsiteWithinDistance)
							{
								if (this.retryWorking(gameState, subrole))
									return;
								ent.stopMoving();
							}
						}
					}
				}
			}
		}
		else if (ent.getMetadata(PlayerID, "approachingTarget"))
		{
			ent.setMetadata(PlayerID, "approachingTarget", undefined);
			ent.setMetadata(PlayerID, "alreadyTried", undefined);
		}

		const unitAIStateOrder = unitAIState.split(".")[1];
		// If we're fighting or hunting, let's not start gathering except if inaccessible target
		// but for fishers where UnitAI must have made us target a moving whale.
		// Also, if we are attacking, do not capture
		if (unitAIStateOrder == "COMBAT")
		{
			if (subrole === Worker.SUBROLE_FISHER)
				this.startFishing(gameState);
			else if (unitAIState == "INDIVIDUAL.COMBAT.APPROACHING" && ent.unitAIOrderData().length &&
				!ent.getMetadata(PlayerID, "PartOfArmy"))
			{
				const orderData = ent.unitAIOrderData()[0];
				if (orderData && orderData.target)
				{
					const target = gameState.getEntityById(orderData.target);
					if (target && (!target.position() || getLandAccess(gameState, target) != this.entAccess))
					{
						if (this.retryWorking(gameState, subrole))
							return;
						ent.stopMoving();
					}
				}
			}
			else if (unitAIState == "INDIVIDUAL.COMBAT.ATTACKING" && ent.unitAIOrderData().length &&
				!ent.getMetadata(PlayerID, "PartOfArmy"))
			{
				const orderData = ent.unitAIOrderData()[0];
				if (orderData && orderData.target && orderData.attackType && orderData.attackType == "Capture")
				{
					// If we are here, an enemy structure must have targeted one of our workers
					// and UnitAI sent it fight back with allowCapture=true
					const target = gameState.getEntityById(orderData.target);
					if (target && target.owner() > 0 && !gameState.isPlayerAlly(target.owner()))
						ent.attack(orderData.target, allowCapture(gameState, ent, target));
				}
			}
			return;
		}

		// Okay so we have a few tasks.
		// If we're gathering, we'll check that we haven't run idle.
		// And we'll also check that we're gathering a resource we want to gather.

		if (subrole === Worker.SUBROLE_GATHERER)
		{
			if (ent.isIdle())
			{
				// if we aren't storing resources or it's the same type as what we're about to gather,
				// let's just pick a new resource.
				// TODO if we already carry the max we can ->  returnresources
				if (!ent.resourceCarrying() || !ent.resourceCarrying().length ||
					ent.resourceCarrying()[0].type == ent.getMetadata(PlayerID, "gather-type"))
				{
					this.startGathering(gameState);
				}
				else if (!returnResources(gameState, ent))     // try to deposit resources
				{
					// no dropsite, abandon old resources and start gathering new ones
					this.startGathering(gameState);
				}
			}
			else if (unitAIStateOrder == "GATHER")
			{
				// we're already gathering. But let's check if there is nothing better
				// in case UnitAI did something bad
				if (ent.unitAIOrderData().length)
				{
					const supplyId = ent.unitAIOrderData()[0].target;
					const supply = gameState.getEntityById(supplyId);
					if (supply && !supply.hasClasses(["Field", "Animal"]) &&
						supplyId != ent.getMetadata(PlayerID, "supply"))
					{
						const nbGatherers = supply.resourceSupplyNumGatherers() + this.base.GetTCGatherer(supplyId);
						if (nbGatherers > 1 && supply.resourceSupplyAmount()/nbGatherers < 30)
						{
							this.base.RemoveTCGatherer(supplyId);
							this.startGathering(gameState);
						}
						else
						{
							const gatherType = ent.getMetadata(PlayerID, "gather-type");
							const nearby = this.base.dropsiteSupplies[gatherType].nearby;
							if (nearby.some(sup => sup.id == supplyId))
								ent.setMetadata(PlayerID, "supply", supplyId);
							else if (nearby.length)
							{
								this.base.RemoveTCGatherer(supplyId);
								this.startGathering(gameState);
							}
							else
							{
								const medium = this.base.dropsiteSupplies[gatherType].medium;
								if (medium.length && !medium.some(sup => sup.id == supplyId))
								{
									this.base.RemoveTCGatherer(supplyId);
									this.startGathering(gameState);
								}
								else
									ent.setMetadata(PlayerID, "supply", supplyId);
							}
						}
					}
				}
				if (unitAIState == "INDIVIDUAL.GATHER.RETURNINGRESOURCE.APPROACHING")
				{
					if (gameState.ai.playedTurn % 10 == 0)
					{
						// Check from time to time that UnitAI does not send us to an inaccessible dropsite
						const dropsite = gameState.getEntityById(ent.unitAIOrderData()[0].target);
						if (dropsite && dropsite.position() &&
							this.entAccess != getLandAccess(gameState, dropsite))
						{
							returnResources(gameState, this.ent);
						}
					}

					// If gathering a sparse resource, we may have been sent to a faraway resource if the one nearby was full.
					// Let's check if it is still the case. If so, we reset its metadata supplyId so that the unit will be
					// reordered to gather after having returned the resources (when comparing its supplyId with the UnitAI one).
					const gatherType = ent.getMetadata(PlayerID, "gather-type");
					const influenceGroup = Resources.GetResource(gatherType).aiAnalysisInfluenceGroup;
					if (influenceGroup && influenceGroup == "sparse")
					{
						const supplyId = ent.getMetadata(PlayerID, "supply");
						if (supplyId)
						{
							const nearby = this.base.dropsiteSupplies[gatherType].nearby;
							if (!nearby.some(sup => sup.id == supplyId))
							{
								if (nearby.length)
									ent.setMetadata(PlayerID, "supply", undefined);
								else
								{
									const medium = this.base.dropsiteSupplies[gatherType].medium;
									if (!medium.some(sup => sup.id == supplyId) && medium.length)
										ent.setMetadata(PlayerID, "supply", undefined);
								}
							}
						}
					}
				}
			}
		}
		else if (subrole === Worker.SUBROLE_BUILDER)
		{
			if (unitAIStateOrder == "REPAIR")
			{
				// Update our target in case UnitAI sent us to a different foundation because of autocontinue
				// and abandon it if UnitAI has sent us to build a field (as we build them only when needed)
				if (ent.unitAIOrderData()[0] && ent.unitAIOrderData()[0].target &&
					ent.getMetadata(PlayerID, "target-foundation") != ent.unitAIOrderData()[0].target)
				{
					const targetId = ent.unitAIOrderData()[0].target;
					const target = gameState.getEntityById(targetId);
					if (target && !target.hasClass("Field"))
					{
						ent.setMetadata(PlayerID, "target-foundation", targetId);
						return;
					}
					ent.setMetadata(PlayerID, "target-foundation", undefined);
					ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_IDLE);
					ent.stopMoving();
					if (this.baseID != gameState.ai.HQ.basesManager.baselessBase().ID)
					{
						// reassign it to something useful
						this.base.reassignIdleWorkers(gameState, [ent]);
						this.update(gameState, ent);
						return;
					}
				}
				// Otherwise check that the target still exists (useful in REPAIR.APPROACHING)
				const targetId = ent.getMetadata(PlayerID, "target-foundation");
				if (targetId && gameState.getEntityById(targetId))
					return;
				ent.stopMoving();
			}
			// okay so apparently we aren't working.
			// Unless we've been explicitely told to keep our role, make us idle.
			const target = gameState.getEntityById(ent.getMetadata(PlayerID, "target-foundation"));
			if (!target || target.foundationProgress() === undefined && target.needsRepair() === false)
			{
				ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_IDLE);
				ent.setMetadata(PlayerID, "target-foundation", undefined);
				// If worker elephant, move away to avoid being trapped in between constructions
				if (ent.hasClass("Elephant"))
					this.moveToGatherer(gameState, ent, true);
				else if (this.baseID != gameState.ai.HQ.basesManager.baselessBase().ID)
				{
					// reassign it to something useful
					this.base.reassignIdleWorkers(gameState, [ent]);
					this.update(gameState, ent);
					return;
				}
			}
			else
			{
				const goalAccess = getLandAccess(gameState, target);
				const queued = returnResources(gameState, ent);
				if (this.entAccess == goalAccess)
					ent.repair(target, target.hasClass("House"), queued);  // autocontinue=true for houses
				else
					gameState.ai.HQ.navalManager.requireTransport(gameState, ent, this.entAccess, goalAccess, target.position());
			}
		}
		else if (subrole === Worker.SUBROLE_HUNTER)
		{
			const lastHuntSearch = ent.getMetadata(PlayerID, "lastHuntSearch");
			if (ent.isIdle() && (!lastHuntSearch || gameState.ai.elapsedTime - lastHuntSearch > 20))
			{
				if (!this.startHunting(gameState))
				{
					// nothing to hunt around. Try another region if any
					let nowhereToHunt = true;
					for (const base of gameState.ai.HQ.baseManagers())
					{
						if (!base.anchor || !base.anchor.position())
							continue;
						const basePos = base.anchor.position();
						if (this.startHunting(gameState, basePos))
						{
							ent.setMetadata(PlayerID, "base", base.ID);
							if (base.accessIndex == this.entAccess)
								ent.move(basePos[0], basePos[1]);
							else
								gameState.ai.HQ.navalManager.requireTransport(gameState, ent, this.entAccess, base.accessIndex, basePos);
							nowhereToHunt = false;
							break;
						}
					}
					if (nowhereToHunt)
						ent.setMetadata(PlayerID, "lastHuntSearch", gameState.ai.elapsedTime);
				}
			}
			else	// Perform some sanity checks
			{
				if (unitAIStateOrder == "GATHER")
				{
					// we may have drifted towards ennemy territory during the hunt, if yes go home
					const territoryOwner = gameState.ai.HQ.territoryMap.getOwner(ent.position());
					if (territoryOwner != 0 && !gameState.isPlayerAlly(territoryOwner))  // player is its own ally
						this.startHunting(gameState);
					else if (unitAIState == "INDIVIDUAL.GATHER.RETURNINGRESOURCE.APPROACHING")
					{
						// Check that UnitAI does not send us to an inaccessible dropsite
						const dropsite = gameState.getEntityById(ent.unitAIOrderData()[0].target);
						if (dropsite && dropsite.position() &&
							this.entAccess != getLandAccess(gameState, dropsite))
						{
							returnResources(gameState, ent);
						}
					}
				}
			}
		}
		else if (subrole === Worker.SUBROLE_FISHER)
		{
			if (ent.isIdle())
				this.startFishing(gameState);
			else	// if we have drifted towards ennemy territory during the fishing, go home
			{
				const territoryOwner = gameState.ai.HQ.territoryMap.getOwner(ent.position());
				if (territoryOwner != 0 && !gameState.isPlayerAlly(territoryOwner))  // player is its own ally
					this.startFishing(gameState);
			}
		}
	}

	retryWorking(gameState, subrole)
	{
		switch (subrole)
		{
		case Worker.SUBROLE_GATHERER:
			return this.startGathering(gameState);
		case Worker.SUBROLE_HUNTER:
			return this.startHunting(gameState);
		case Worker.SUBROLE_FISHER:
			return this.startFishing(gameState);
		case Worker.SUBROLE_BUILDER:
			return this.startBuilding(gameState);
		default:
			return false;
		}
	}

	startBuilding(gameState)
	{
		const target = gameState.getEntityById(this.ent.getMetadata(PlayerID, "target-foundation"));
		if (!target || target.foundationProgress() === undefined && target.needsRepair() == false)
			return false;
		if (getLandAccess(gameState, target) != this.entAccess)
			return false;
		this.ent.repair(target, target.hasClass("House"));  // autocontinue=true for houses
		return true;
	}

	startGathering(gameState)
	{
		// First look for possible treasure if any
		if (gatherTreasure(gameState, this.ent))
			return true;

		const resource = this.ent.getMetadata(PlayerID, "gather-type");

		// If we are gathering food, try to hunt first
		if (resource == "food" && this.startHunting(gameState))
			return true;

		const findSupply = function(worker, supplies)
		{
			const ent = worker.ent;
			let ret = false;
			const gatherRates = ent.resourceGatherRates();
			for (let i = 0; i < supplies.length; ++i)
			{
				const entity = gameState.getEntityById(supplies[i].id);
				// exhausted resource, remove it from this list
				if (!entity)
				{
					supplies.splice(i--, 1);
					continue;
				}
				if (isSupplyFull(gameState, entity))
					continue;
				const inaccessibleTime = entity.getMetadata(PlayerID, "inaccessibleTime");
				if (inaccessibleTime && gameState.ai.elapsedTime < inaccessibleTime)
					continue;
				const supplyType = entity.get("ResourceSupply/Type");
				if (!gatherRates[supplyType])
					continue;
				// check if available resource is worth one additionnal gatherer (except for farms)
				const nbGatherers = entity.resourceSupplyNumGatherers() + worker.base.GetTCGatherer(supplies[i].id);
				if (entity.resourceSupplyType().specific != "grain" && nbGatherers > 0 &&
					entity.resourceSupplyAmount()/(1+nbGatherers) < 30)
				{
					continue;
				}
				// not in ennemy territory
				const territoryOwner = gameState.ai.HQ.territoryMap.getOwner(entity.position());
				if (territoryOwner != 0 && !gameState.isPlayerAlly(territoryOwner))  // player is its own ally
					continue;
				worker.base.AddTCGatherer(supplies[i].id);
				ent.setMetadata(PlayerID, "supply", supplies[i].id);
				ret = entity;
				break;
			}
			return ret;
		};

		const navalManager = gameState.ai.HQ.navalManager;
		let supply;

		// first look in our own base if accessible from our present position
		if (this.baseAccess == this.entAccess)
		{
			supply = findSupply(this, this.base.dropsiteSupplies[resource].nearby);
			if (supply)
			{
				this.ent.gather(supply);
				return true;
			}
			// --> for food, try to gather from fields if any, otherwise build one if any
			if (resource == "food")
			{
				supply = this.gatherNearestField(gameState, this.baseID);
				if (supply)
				{
					this.ent.gather(supply);
					return true;
				}
				supply = this.buildAnyField(gameState, this.baseID);
				if (supply)
				{
					this.ent.repair(supply);
					return true;
				}
			}
			supply = findSupply(this, this.base.dropsiteSupplies[resource].medium);
			if (supply)
			{
				this.ent.gather(supply);
				return true;
			}
		}
		// So if we're here we have checked our whole base for a proper resource (or it was not accessible)
		// --> check other bases directly accessible
		for (const base of gameState.ai.HQ.baseManagers())
		{
			if (base.ID == this.baseID)
				continue;
			if (base.accessIndex != this.entAccess)
				continue;
			supply = findSupply(this, base.dropsiteSupplies[resource].nearby);
			if (supply)
			{
				this.ent.setMetadata(PlayerID, "base", base.ID);
				this.ent.gather(supply);
				return true;
			}
		}
		if (resource == "food")	// --> for food, try to gather from fields if any, otherwise build one if any
		{
			for (const base of gameState.ai.HQ.baseManagers())
			{
				if (base.ID == this.baseID)
					continue;
				if (base.accessIndex != this.entAccess)
					continue;
				supply = this.gatherNearestField(gameState, base.ID);
				if (supply)
				{
					this.ent.setMetadata(PlayerID, "base", base.ID);
					this.ent.gather(supply);
					return true;
				}
				supply = this.buildAnyField(gameState, base.ID);
				if (supply)
				{
					this.ent.setMetadata(PlayerID, "base", base.ID);
					this.ent.repair(supply);
					return true;
				}
			}
		}
		for (const base of gameState.ai.HQ.baseManagers())
		{
			if (base.ID == this.baseID)
				continue;
			if (base.accessIndex != this.entAccess)
				continue;
			supply = findSupply(this, base.dropsiteSupplies[resource].medium);
			if (supply)
			{
				this.ent.setMetadata(PlayerID, "base", base.ID);
				this.ent.gather(supply);
				return true;
			}
		}

		// Okay may-be we haven't found any appropriate dropsite anywhere.
		// Try to help building one if any accessible foundation available
		const foundations = gameState.getOwnFoundations().toEntityArray();
		let shouldBuild = this.ent.isBuilder() && foundations.some(function(foundation)
		{
			if (!foundation || getLandAccess(gameState, foundation) != this.entAccess)
				return false;
			const structure = gameState.getBuiltTemplate(foundation.templateName());
			if (structure.resourceDropsiteTypes() && structure.resourceDropsiteTypes().indexOf(resource) != -1)
			{
				if (foundation.getMetadata(PlayerID, "base") != this.baseID)
					this.ent.setMetadata(PlayerID, "base", foundation.getMetadata(PlayerID, "base"));
				this.ent.setMetadata(PlayerID, "target-foundation", foundation.id());
				this.ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_BUILDER);
				this.ent.repair(foundation);
				return true;
			}
			return false;
		}, this);
		if (shouldBuild)
			return true;

		// Still nothing ... try bases which need a transport
		for (const base of gameState.ai.HQ.baseManagers())
		{
			if (base.accessIndex == this.entAccess)
				continue;
			supply = findSupply(this, base.dropsiteSupplies[resource].nearby);
			if (supply && navalManager.requireTransport(gameState, this.ent, this.entAccess, base.accessIndex, supply.position()))
			{
				if (base.ID != this.baseID)
					this.ent.setMetadata(PlayerID, "base", base.ID);
				return true;
			}
		}
		if (resource == "food")	// --> for food, try to gather from fields if any, otherwise build one if any
		{
			for (const base of gameState.ai.HQ.baseManagers())
			{
				if (base.accessIndex == this.entAccess)
					continue;
				supply = this.gatherNearestField(gameState, base.ID);
				if (supply && navalManager.requireTransport(gameState, this.ent, this.entAccess, base.accessIndex, supply.position()))
				{
					if (base.ID != this.baseID)
						this.ent.setMetadata(PlayerID, "base", base.ID);
					return true;
				}
				supply = this.buildAnyField(gameState, base.ID);
				if (supply && navalManager.requireTransport(gameState, this.ent, this.entAccess, base.accessIndex, supply.position()))
				{
					if (base.ID != this.baseID)
						this.ent.setMetadata(PlayerID, "base", base.ID);
					return true;
				}
			}
		}
		for (const base of gameState.ai.HQ.baseManagers())
		{
			if (base.accessIndex == this.entAccess)
				continue;
			supply = findSupply(this, base.dropsiteSupplies[resource].medium);
			if (supply && navalManager.requireTransport(gameState, this.ent, this.entAccess, base.accessIndex, supply.position()))
			{
				if (base.ID != this.baseID)
					this.ent.setMetadata(PlayerID, "base", base.ID);
				return true;
			}
		}
		// Okay so we haven't found any appropriate dropsite anywhere.
		// Try to help building one if any non-accessible foundation available
		shouldBuild = this.ent.isBuilder() && foundations.some(function(foundation)
		{
			if (!foundation || getLandAccess(gameState, foundation) == this.entAccess)
				return false;
			const structure = gameState.getBuiltTemplate(foundation.templateName());
			if (structure.resourceDropsiteTypes() && structure.resourceDropsiteTypes().indexOf(resource) != -1)
			{
				const foundationAccess = getLandAccess(gameState, foundation);
				if (navalManager.requireTransport(gameState, this.ent, this.entAccess, foundationAccess, foundation.position()))
				{
					if (foundation.getMetadata(PlayerID, "base") != this.baseID)
						this.ent.setMetadata(PlayerID, "base", foundation.getMetadata(PlayerID, "base"));
					this.ent.setMetadata(PlayerID, "target-foundation", foundation.id());
					this.ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_BUILDER);
					return true;
				}
			}
			return false;
		}, this);
		if (shouldBuild)
			return true;

		// Still nothing, we look now for faraway resources, first in the accessible ones, then in the others
		// except for food when farms or corrals can be used
		let allowDistant = true;
		if (resource == "food")
		{
			if (gameState.ai.HQ.turnCache.allowDistantFood === undefined)
				gameState.ai.HQ.turnCache.allowDistantFood =
					!gameState.ai.HQ.canBuild(gameState, "structures/{civ}/field") &&
					!gameState.ai.HQ.canBuild(gameState, "structures/{civ}/corral");
			allowDistant = gameState.ai.HQ.turnCache.allowDistantFood;
		}
		if (allowDistant)
		{
			if (this.baseAccess == this.entAccess)
			{
				supply = findSupply(this, this.base.dropsiteSupplies[resource].faraway);
				if (supply)
				{
					this.ent.gather(supply);
					return true;
				}
			}
			for (const base of gameState.ai.HQ.baseManagers())
			{
				if (base.ID == this.baseID)
					continue;
				if (base.accessIndex != this.entAccess)
					continue;
				supply = findSupply(this, base.dropsiteSupplies[resource].faraway);
				if (supply)
				{
					this.ent.setMetadata(PlayerID, "base", base.ID);
					this.ent.gather(supply);
					return true;
				}
			}
			for (const base of gameState.ai.HQ.baseManagers())
			{
				if (base.accessIndex == this.entAccess)
					continue;
				supply = findSupply(this, base.dropsiteSupplies[resource].faraway);
				if (supply && navalManager.requireTransport(gameState, this.ent, this.entAccess, base.accessIndex, supply.position()))
				{
					if (base.ID != this.baseID)
						this.ent.setMetadata(PlayerID, "base", base.ID);
					return true;
				}
			}
		}

		// If we are here, we have nothing left to gather ... certainly no more resources of this type
		gameState.ai.HQ.lastFailedGather[resource] = gameState.ai.elapsedTime;
		if (gameState.ai.Config.debug > 2)
			aiWarn(" >>>>> worker with gather-type " + resource + " with nothing to gather ");
		this.ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_IDLE);
		return false;
	}

	/**
	 * if position is given, we only check if we could hunt from this position but do nothing
	 * otherwise the position of the entity is taken, and if something is found, we directly start the hunt
	 */
	startHunting(gameState, position)
	{
		// First look for possible treasure if any
		if (!position && gatherTreasure(gameState, this.ent))
			return true;

		const resources = gameState.getHuntableSupplies();
		if (!resources.hasEntities())
			return false;

		let nearestSupplyDist = Math.min();
		let nearestSupply;

		const entIsFastMoving = isFastMoving(this.ent);
		const isRanged = this.ent.hasClass("Ranged");
		const entPosition = position ? position : this.ent.position();
		const foodDropsites = gameState.playerData.hasSharedDropsites ?
			gameState.getAnyDropsites("food") : gameState.getOwnDropsites("food");

		const hasFoodDropsiteWithinDistance = function(supplyPosition, supplyAccess, distSquare)
		{
			for (const dropsite of foodDropsites.values())
			{
				if (!dropsite.position())
					continue;
				const owner = dropsite.owner();
				// owner != PlayerID can only happen when hasSharedDropsites == true, so no need to test it again
				if (owner != PlayerID && (!dropsite.isSharedDropsite() || !gameState.isPlayerMutualAlly(owner)))
					continue;
				if (supplyAccess != getLandAccess(gameState, dropsite))
					continue;
				if (SquareVectorDistance(supplyPosition, dropsite.position()) < distSquare)
					return true;
			}
			return false;
		};

		const gatherRates = this.ent.resourceGatherRates();
		for (const supply of resources.values())
		{
			if (!supply.position())
				continue;

			const inaccessibleTime = supply.getMetadata(PlayerID, "inaccessibleTime");
			if (inaccessibleTime && gameState.ai.elapsedTime < inaccessibleTime)
				continue;

			const supplyType = supply.get("ResourceSupply/Type");
			if (!gatherRates[supplyType])
				continue;

			if (isSupplyFull(gameState, supply))
				continue;
			// Check if available resource is worth one additionnal gatherer (except for farms).
			const nbGatherers = supply.resourceSupplyNumGatherers() + this.base.GetTCGatherer(supply.id());
			if (nbGatherers > 0 && supply.resourceSupplyAmount()/(1+nbGatherers) < 30)
				continue;

			const canFlee = !supply.hasClass("Domestic") && supply.templateName().indexOf("resource|") == -1;
			// Only FastMoving and Ranged units should hunt fleeing animals.
			if (canFlee && !entIsFastMoving && !isRanged)
				continue;

			const supplyAccess = getLandAccess(gameState, supply);
			if (supplyAccess != this.entAccess)
				continue;

			// measure the distance to the resource.
			const dist = SquareVectorDistance(entPosition, supply.position());
			if (dist > nearestSupplyDist)
				continue;

			// Only FastMoving should hunt faraway.
			if (!entIsFastMoving && dist > 25000)
				continue;

			// Avoid enemy territory.
			const territoryOwner = gameState.ai.HQ.territoryMap.getOwner(supply.position());
			if (territoryOwner != 0 && !gameState.isPlayerAlly(territoryOwner))  // Player is its own ally.
				continue;
			// And if in ally territory, don't hunt this ally's cattle.
			if (territoryOwner != 0 && territoryOwner != PlayerID && supply.owner() == territoryOwner)
				continue;

			// Only FastMoving should hunt far from dropsite (specially for non-Domestic animals which flee).
			if (!entIsFastMoving && canFlee && territoryOwner == 0)
				continue;
			const distanceSquare = entIsFastMoving ? 35000 : (canFlee ? 7000 : 12000);
			if (!hasFoodDropsiteWithinDistance(supply.position(), supplyAccess, distanceSquare))
				continue;

			nearestSupplyDist = dist;
			nearestSupply = supply;
		}

		if (nearestSupply)
		{
			if (position)
				return true;
			this.base.AddTCGatherer(nearestSupply.id());
			this.ent.gather(nearestSupply);
			this.ent.setMetadata(PlayerID, "supply", nearestSupply.id());
			this.ent.setMetadata(PlayerID, "target-foundation", undefined);
			return true;
		}
		return false;
	}

	startFishing(gameState)
	{
		if (!this.ent.position())
			return false;

		const resources = gameState.getFishableSupplies();
		if (!resources.hasEntities())
		{
			gameState.ai.HQ.navalManager.resetFishingBoats(gameState);
			this.ent.destroy();
			return false;
		}

		let nearestSupplyDist = Math.min();
		let nearestSupply;

		const fisherSea = getSeaAccess(gameState, this.ent);
		const fishDropsites = (gameState.playerData.hasSharedDropsites ? gameState.getAnyDropsites("food") :
			gameState.getOwnDropsites("food")).filter(filters.byClass("Dock")).toEntityArray();

		const nearestDropsiteDist = function(supply)
		{
			let distMin = 1000000;
			const pos = supply.position();
			for (const dropsite of fishDropsites)
			{
				if (!dropsite.position())
					continue;
				const owner = dropsite.owner();
				// owner != PlayerID can only happen when hasSharedDropsites == true, so no need to test it again
				if (owner != PlayerID && (!dropsite.isSharedDropsite() || !gameState.isPlayerMutualAlly(owner)))
					continue;
				if (fisherSea != getSeaAccess(gameState, dropsite))
					continue;
				distMin = Math.min(distMin, SquareVectorDistance(pos, dropsite.position()));
			}
			return distMin;
		};

		let exhausted = true;
		const gatherRates = this.ent.resourceGatherRates();
		resources.forEach((supply) =>
		{
			if (!supply.position())
				return;

			// check that it is accessible
			if (gameState.ai.HQ.navalManager.getFishSea(gameState, supply) != fisherSea)
				return;

			exhausted = false;

			const supplyType = supply.get("ResourceSupply/Type");
			if (!gatherRates[supplyType])
				return;

			if (isSupplyFull(gameState, supply))
				return;
			// check if available resource is worth one additionnal gatherer (except for farms)
			const nbGatherers = supply.resourceSupplyNumGatherers() + this.base.GetTCGatherer(supply.id());
			if (nbGatherers > 0 && supply.resourceSupplyAmount()/(1+nbGatherers) < 30)
				return;

			// Avoid ennemy territory
			if (!gameState.ai.HQ.navalManager.canFishSafely(gameState, supply))
				return;

			// measure the distance from the resource to the nearest dropsite
			const dist = nearestDropsiteDist(supply);
			if (dist > nearestSupplyDist)
				return;

			nearestSupplyDist = dist;
			nearestSupply = supply;
		});

		if (exhausted)
		{
			gameState.ai.HQ.navalManager.resetFishingBoats(gameState, fisherSea);
			this.ent.destroy();
			return false;
		}

		if (nearestSupply)
		{
			this.base.AddTCGatherer(nearestSupply.id());
			this.ent.gather(nearestSupply);
			this.ent.setMetadata(PlayerID, "supply", nearestSupply.id());
			this.ent.setMetadata(PlayerID, "target-foundation", undefined);
			return true;
		}
		if (this.ent.getMetadata(PlayerID, "subrole") === Worker.SUBROLE_FISHER)
			this.ent.setMetadata(PlayerID, "subrole", Worker.SUBROLE_IDLE);
		return false;
	}

	gatherNearestField(gameState, baseID)
	{
		const ownFields = gameState.getOwnEntitiesByClass("Field", true).filter(filters.isBuilt())
			.filter(filters.byMetadata(PlayerID, "base", baseID));
		let bestFarm;

		const gatherRates = this.ent.resourceGatherRates();
		for (const field of ownFields.values())
		{
			if (isSupplyFull(gameState, field))
				continue;
			const supplyType = field.get("ResourceSupply/Type");
			if (!gatherRates[supplyType])
				continue;

			let rate = 1;
			const diminishing = field.getDiminishingReturns();
			if (diminishing < 1)
			{
				const num = field.resourceSupplyNumGatherers() + this.base.GetTCGatherer(field.id());
				if (num > 0)
					rate = Math.pow(diminishing, num);
			}
			// Add a penalty distance depending on rate
			const dist = SquareVectorDistance(field.position(), this.ent.position()) + (1 - rate) * 160000;
			if (!bestFarm || dist < bestFarm.dist)
				bestFarm = { "ent": field, "dist": dist, "rate": rate };
		}
		// If other field foundations available, better build them when rate becomes too small
		if (!bestFarm || bestFarm.rate < 0.70 && gameState.getOwnFoundations()
			.filter(filters.byClass("Field")).filter(filters.byMetadata(PlayerID, "base", baseID))
			.hasEntities())
		{
			return false;
		}
		this.base.AddTCGatherer(bestFarm.ent.id());
		this.ent.setMetadata(PlayerID, "supply", bestFarm.ent.id());
		return bestFarm.ent;
	}

	/**
	 * WARNING with the present options of AI orders, the unit will not gather after building the farm.
	 * This is done by calling the gatherNearestField function when construction is completed.
	 */
	buildAnyField(gameState, baseID)
	{
		if (!this.ent.isBuilder())
			return false;
		let bestFarmEnt = false;
		let bestFarmDist = 10000000;
		const pos = this.ent.position();
		for (const found of gameState.getOwnFoundations().values())
		{
			if (found.getMetadata(PlayerID, "base") != baseID || !found.hasClass("Field"))
				continue;
			const current = found.getBuildersNb();
			if (current === undefined ||
			    current >= gameState.getBuiltTemplate(found.templateName()).maxGatherers())
				continue;
			const dist = SquareVectorDistance(found.position(), pos);
			if (dist > bestFarmDist)
				continue;
			bestFarmEnt = found;
			bestFarmDist = dist;
		}
		return bestFarmEnt;
	}

	/**
	 * Workers elephant should move away from the buildings they've built to avoid being trapped in between constructions.
	 * For the time being, we move towards the nearest gatherer (providing him a dropsite).
	 * BaseManager does also use that function to deal with its mobile dropsites.
	 */
	moveToGatherer(gameState, ent, forced)
	{
		const pos = ent.position();
		if (!pos || ent.getMetadata(PlayerID, "target-foundation") !== undefined)
			return;
		if (!forced && gameState.ai.elapsedTime < (ent.getMetadata(PlayerID, "nextMoveToGatherer") || 5))
			return;
		const gatherers = this.base.workersBySubrole(gameState, Worker.SUBROLE_GATHERER);
		let dist = Math.min();
		let destination;
		const access = getLandAccess(gameState, ent);
		const types = ent.resourceDropsiteTypes();
		for (const gatherer of gatherers.values())
		{
			const gathererType = gatherer.getMetadata(PlayerID, "gather-type");
			if (!gathererType || types.indexOf(gathererType) == -1)
				continue;
			if (!gatherer.position() || gatherer.getMetadata(PlayerID, "transport") !== undefined ||
				getLandAccess(gameState, gatherer) != access || gatherer.isIdle())
			{
				continue;
			}
			const distance = SquareVectorDistance(pos, gatherer.position());
			if (distance > dist)
				continue;
			dist = distance;
			destination = gatherer.position();
		}
		ent.setMetadata(PlayerID, "nextMoveToGatherer", gameState.ai.elapsedTime + (destination ? 12 : 5));
		if (destination && dist > 10)
			ent.move(destination[0], destination[1]);
	}

	/**
	 * Check accessibility of the target when in approach (in RMS maps, we quite often have chicken or bushes
	 * inside obstruction of other entities). The resource will be flagged as inaccessible during 10 mn (in case
	 * it will be cleared later).
	 */
	isInaccessibleSupply(gameState)
	{
		if (!this.ent.unitAIOrderData()[0] || !this.ent.unitAIOrderData()[0].target)
			return false;
		const targetId = this.ent.unitAIOrderData()[0].target;
		const target = gameState.getEntityById(targetId);
		if (!target)
			return true;

		if (!target.resourceSupplyType())
			return false;

		const approachingTarget = this.ent.getMetadata(PlayerID, "approachingTarget");
		const carriedAmount = this.ent.resourceCarrying().length ? this.ent.resourceCarrying()[0].amount : 0;
		if (!approachingTarget || approachingTarget != targetId)
		{
			this.ent.setMetadata(PlayerID, "approachingTarget", targetId);
			this.ent.setMetadata(PlayerID, "approachingTime", undefined);
			this.ent.setMetadata(PlayerID, "approachingPos", undefined);
			this.ent.setMetadata(PlayerID, "carriedBefore", carriedAmount);
			const alreadyTried = this.ent.getMetadata(PlayerID, "alreadyTried");
			if (alreadyTried && alreadyTried != targetId)
				this.ent.setMetadata(PlayerID, "alreadyTried", undefined);
		}

		const carriedBefore = this.ent.getMetadata(PlayerID, "carriedBefore");
		if (carriedBefore != carriedAmount)
		{
			this.ent.setMetadata(PlayerID, "approachingTarget", undefined);
			this.ent.setMetadata(PlayerID, "alreadyTried", undefined);
			if (target.getMetadata(PlayerID, "inaccessibleTime"))
				target.setMetadata(PlayerID, "inaccessibleTime", 0);
			return false;
		}

		const inaccessibleTime = target.getMetadata(PlayerID, "inaccessibleTime");
		if (inaccessibleTime && gameState.ai.elapsedTime < inaccessibleTime)
			return true;

		const approachingTime = this.ent.getMetadata(PlayerID, "approachingTime");
		if (!approachingTime || gameState.ai.elapsedTime - approachingTime > 3)
		{
			const presentPos = this.ent.position();
			const approachingPos = this.ent.getMetadata(PlayerID, "approachingPos");
			if (!approachingPos || approachingPos[0] != presentPos[0] || approachingPos[1] != presentPos[1])
			{
				this.ent.setMetadata(PlayerID, "approachingTime", gameState.ai.elapsedTime);
				this.ent.setMetadata(PlayerID, "approachingPos", presentPos);
				return false;
			}
			if (gameState.ai.elapsedTime - approachingTime > 10)
			{
				if (this.ent.getMetadata(PlayerID, "alreadyTried"))
				{
					target.setMetadata(PlayerID, "inaccessibleTime", gameState.ai.elapsedTime + 600);
					return true;
				}
				// let's try again to reach it
				this.ent.setMetadata(PlayerID, "alreadyTried", targetId);
				this.ent.setMetadata(PlayerID, "approachingTarget", undefined);
				this.ent.gather(target);
				return false;
			}
		}
		return false;
	}
}
