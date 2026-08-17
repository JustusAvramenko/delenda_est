import * as filters from "simulation/ai/common-api/filters.js";
import { aiWarn, SquareVectorDistance, VectorDistance } from "simulation/ai/common-api/utils.js";
import { AttackPlan } from "simulation/ai/nike/attackPlan.js";
import * as chat from "simulation/ai/nike/chatHelper.js";
import { Config } from "simulation/ai/nike/config.js";
import * as difficulty from "simulation/ai/nike/difficultyLevel.js";
import { allowCapture, getLandAccess } from "simulation/ai/nike/entityExtend.js";
import { Worker } from "simulation/ai/nike/worker.js";

export class AttackManager
{
	totalNumber = 0;
	attackNumber = 0;
	rushNumber = 0;
	raidNumber = 0;
	upcomingAttacks = {
		[AttackPlan.TYPE_RUSH]: [],
		[AttackPlan.TYPE_RAID]: [],
		[AttackPlan.TYPE_DEFAULT]: [],
		[AttackPlan.TYPE_HUGE_ATTACK]: []
	};
	startedAttacks = {
		[AttackPlan.TYPE_RUSH]: [],
		[AttackPlan.TYPE_RAID]: [],
		[AttackPlan.TYPE_DEFAULT]: [],
		[AttackPlan.TYPE_HUGE_ATTACK]: []
	};
	bombingAttacks = new Map();// Temporary attacks for siege units while waiting their current attack to start
	debugTime = 0;
	maxRushes = 0;
	rushSize = [];
	currentEnemyPlayer = undefined; // enemy player we are currently targeting
	defeated = {};

	constructor(config)
	{
		this.Config = config;
	}

	/** More initialisation for stuff that needs the gameState */
	init(gameState)
	{
		this.outOfPlan = gameState.getOwnUnits().filter(filters.byMetadata(PlayerID, "plan", -1));
		this.outOfPlan.registerUpdates();
	}

	setRushes(allowed)
	{
		if (this.Config.personality.aggressive > this.Config.personalityCut.strong && allowed > 2)
		{
			this.maxRushes = 3;
			this.rushSize = [ 16, 20, 24 ];
		}
		else if (this.Config.personality.aggressive > this.Config.personalityCut.medium && allowed > 1)
		{
			this.maxRushes = 2;
			this.rushSize = [ 18, 22 ];
		}
		else if (this.Config.personality.aggressive > this.Config.personalityCut.weak && allowed > 0)
		{
			this.maxRushes = 1;
			this.rushSize = [ 20 ];
		}
	}

	checkEvents(gameState, events)
	{
		for (const evt of events.PlayerDefeated)
			this.defeated[evt.playerId] = true;

		let answer = "decline";
		let other;
		let targetPlayer;
		for (const evt of events.AttackRequest)
		{
			if (evt.source === PlayerID || !gameState.isPlayerAlly(evt.source) || !gameState.isPlayerEnemy(evt.player))
				continue;
			targetPlayer = evt.player;
			let available = 0;
			for (const attackType in this.upcomingAttacks)
			{
				for (const attack of this.upcomingAttacks[attackType])
				{
					if (attack.state === AttackPlan.STATE_COMPLETING)
					{
						if (attack.targetPlayer === targetPlayer)
							available += attack.unitCollection.length;
						else if (attack.targetPlayer !== undefined && attack.targetPlayer !== targetPlayer)
							other = attack.targetPlayer;
						continue;
					}

					attack.targetPlayer = targetPlayer;

					if (attack.unitCollection.length > 2)
						available += attack.unitCollection.length;
				}
			}

			if (available > 12)	// launch the attack immediately
			{
				for (const attackType in this.upcomingAttacks)
				{
					for (const attack of this.upcomingAttacks[attackType])
					{
						if (attack.state === AttackPlan.STATE_COMPLETING ||
							attack.targetPlayer !== targetPlayer ||
							attack.unitCollection.length < 3)
							continue;
						attack.forceStart();
						attack.requested = true;
					}
				}
				answer = "join";
			}
			else if (other !== undefined)
				answer = "other";
			break;  // take only the first attack request into account
		}
		if (targetPlayer !== undefined)
			chat.answerRequestAttack(gameState, targetPlayer, answer, other);

		for (const evt of events.EntityRenamed)	// take care of packing units in bombing attacks
		{
			for (const [targetId, unitIds] of this.bombingAttacks)
			{
				if (targetId == evt.entity)
				{
					this.bombingAttacks.set(evt.newentity, unitIds);
					this.bombingAttacks.delete(evt.entity);
				}
				else if (unitIds.has(evt.entity))
				{
					unitIds.add(evt.newentity);
					unitIds.delete(evt.entity);
				}
			}
		}
	}

	/**
	 * Check for any structure in range from within our territory, and bomb it
	 */
	assignBombers(gameState)
	{
		// First some cleaning of current bombing attacks
		for (const [targetId, unitIds] of this.bombingAttacks)
		{
			const target = gameState.getEntityById(targetId);
			if (!target || !gameState.isPlayerEnemy(target.owner()))
				this.bombingAttacks.delete(targetId);
			else
			{
				for (const entId of unitIds.values())
				{
					const ent = gameState.getEntityById(entId);
					if (ent && ent.owner() == PlayerID)
					{
						const plan = ent.getMetadata(PlayerID, "plan");
						const orders = ent.unitAIOrderData();
						const lastOrder = orders && orders.length ? orders[orders.length-1] : null;
						if (lastOrder && lastOrder.target && lastOrder.target == targetId && plan != -2 && plan != -3)
							continue;
					}
					unitIds.delete(entId);
				}
				if (!unitIds.size)
					this.bombingAttacks.delete(targetId);
			}
		}

		const bombers = gameState.updatingCollection("bombers",
			filters.byClasses(["BoltShooter", "StoneThrower"]), gameState.getOwnUnits());
		for (const ent of bombers.values())
		{
			if (!ent.position() || !ent.isIdle() || !ent.attackRange("Ranged"))
				continue;
			if (ent.getMetadata(PlayerID, "plan") == -2 || ent.getMetadata(PlayerID, "plan") == -3)
				continue;
			if (ent.getMetadata(PlayerID, "plan") !== undefined && ent.getMetadata(PlayerID, "plan") != -1)
			{
				const subrole = ent.getMetadata(PlayerID, "subrole");
				if (subrole && (subrole === Worker.SUBROLE_COMPLETING ||
					subrole === Worker.SUBROLE_WALKING || subrole === Worker.SUBROLE_ATTACKING))
					continue;
			}
			let alreadyBombing = false;
			for (const unitIds of this.bombingAttacks.values())
			{
				if (!unitIds.has(ent.id()))
					continue;
				alreadyBombing = true;
				break;
			}
			if (alreadyBombing)
				break;

			const range = ent.attackRange("Ranged").max;
			const entPos = ent.position();
			const access = getLandAccess(gameState, ent);
			for (const struct of gameState.getEnemyStructures().values())
			{
				if (!ent.canAttackTarget(struct, allowCapture(gameState, ent, struct)))
					continue;

				const structPos = struct.position();
				let x;
				let z;
				if (struct.hasClass("Field"))
				{
					if (!struct.resourceSupplyNumGatherers() ||
					    !gameState.isPlayerEnemy(gameState.ai.HQ.territoryMap.getOwner(structPos)))
						continue;
				}
				const dist = VectorDistance(entPos, structPos);
				if (dist > range)
				{
					const safety = struct.footprintRadius() + 30;
					x = structPos[0] + (entPos[0] - structPos[0]) * safety / dist;
					z = structPos[1] + (entPos[1] - structPos[1]) * safety / dist;
					const owner = gameState.ai.HQ.territoryMap.getOwner([x, z]);
					if (owner != 0 && gameState.isPlayerEnemy(owner))
						continue;
					x = structPos[0] + (entPos[0] - structPos[0]) * range / dist;
					z = structPos[1] + (entPos[1] - structPos[1]) * range / dist;
					if (gameState.ai.HQ.territoryMap.getOwner([x, z]) != PlayerID ||
					    gameState.ai.accessibility.getAccessValue([x, z]) != access)
						continue;
				}
				let attackingUnits;
				for (const [targetId, unitIds] of this.bombingAttacks)
				{
					if (targetId != struct.id())
						continue;
					attackingUnits = unitIds;
					break;
				}
				if (attackingUnits && attackingUnits.size > 4)
					continue;	// already enough units against that target
				if (!attackingUnits)
				{
					attackingUnits = new Set();
					this.bombingAttacks.set(struct.id(), attackingUnits);
				}
				attackingUnits.add(ent.id());
				if (dist > range)
					ent.move(x, z);
				ent.attack(struct.id(), false, dist > range);
				break;
			}
		}
	}

	/**
	 * Some functions are run every turn
	 * Others once in a while
	 */
	update(gameState, queues, events)
	{
		if (this.Config.debug > 2 && gameState.ai.elapsedTime > this.debugTime + 60)
		{
			this.debugTime = gameState.ai.elapsedTime;
			aiWarn(" upcoming attacks =================");
			for (const attackType in this.upcomingAttacks)
			{
				for (const attack of this.upcomingAttacks[attackType])
				{
					aiWarn(" plan " + attack.name + " type " + attackType + " state " + attack.state +
						" units " + attack.unitCollection.length);
				}
			}
			aiWarn(" started attacks ==================");
			for (const attackType in this.startedAttacks)
			{
				for (const attack of this.startedAttacks[attackType])
				{
					aiWarn(" plan " + attack.name + " type " + attackType + " state " + attack.state +
						" units " + attack.unitCollection.length);
				}
			}
			aiWarn(" ==================================");
		}

		this.checkEvents(gameState, events);
		const unexecutedAttacks = {
			[AttackPlan.TYPE_RUSH]: 0,
			[AttackPlan.TYPE_RAID]: 0,
			[AttackPlan.TYPE_DEFAULT]: 0,
			[AttackPlan.TYPE_HUGE_ATTACK]: 0
		};
		for (const attackType in this.upcomingAttacks)
		{
			for (let i = 0; i < this.upcomingAttacks[attackType].length; ++i)
			{
				const attack = this.upcomingAttacks[attackType][i];
				attack.checkEvents(gameState, events);

				if (attack.isStarted())
				{
					aiWarn("Nike problem in attackManager: attack in preparation has already " +
						"started ???");
				}

				const updateStep = attack.updatePreparation(gameState);
				// now we're gonna check if the preparation time is over
				if (updateStep === AttackPlan.PREPARATION_KEEP_GOING || attack.isPaused())
				{
					// just chillin'
					if (attack.state === AttackPlan.STATE_UNEXECUTED)
						++unexecutedAttacks[attackType];
				}
				else if (updateStep === AttackPlan.PREPARATION_FAILED)
				{
					if (this.Config.debug > 1)
					{
						aiWarn("Attack Manager: " + attack.getType() + " plan " + attack.getName() +
							" aborted.");
					}
					attack.Abort(gameState);
					this.upcomingAttacks[attackType].splice(i--, 1);
				}
				else if (updateStep === AttackPlan.PREPARATION_START)
				{
					if (attack.StartAttack(gameState))
					{
						if (this.Config.debug > 1)
						{
							aiWarn("Attack Manager: Starting " + attack.getType() + " plan " +
								attack.getName());
						}
						if (this.Config.chat)
							chat.launchAttack(gameState, attack.targetPlayer, attack.getType());
						this.startedAttacks[attackType].push(attack);
					}
					else
						attack.Abort(gameState);
					this.upcomingAttacks[attackType].splice(i--, 1);
				}
			}
		}

		for (const attackType in this.startedAttacks)
		{
			for (let i = 0; i < this.startedAttacks[attackType].length; ++i)
			{
				const attack = this.startedAttacks[attackType][i];
				attack.checkEvents(gameState, events);
				// okay so then we'll update the attack.
				if (attack.isPaused())
					continue;
				const remaining = attack.update(gameState, events);
				if (!remaining)
				{
					if (this.Config.debug > 1)
					{
						aiWarn("Military Manager: " + attack.getType() + " plan " +
							attack.getName() + " is finished with remaining " + remaining);
					}
					attack.Abort(gameState);
					this.startedAttacks[attackType].splice(i--, 1);
				}
			}
		}

		// creating plans after updating because an aborted plan might be reused in that case.

		const barracksNb = gameState.getOwnEntitiesByClass("Barracks", true).filter(filters.isBuilt()).length;
		if (this.rushNumber < this.maxRushes && barracksNb >= 1)
		{
			if (unexecutedAttacks[AttackPlan.TYPE_RUSH] === 0)
			{
				// we have a barracks and we want to rush, rush.
				const data = { "targetSize": this.rushSize[this.rushNumber] };
				const attackPlan = new AttackPlan(gameState, this.Config, this.totalNumber,
					AttackPlan.TYPE_RUSH, data, false);
				if (!attackPlan.failed)
				{
					if (this.Config.debug > 1)
					{
						aiWarn("Military Manager: Rushing plan " + this.totalNumber +
							" with maxRushes " + this.maxRushes);
					}
					this.totalNumber++;
					attackPlan.init(gameState);
					this.upcomingAttacks[AttackPlan.TYPE_RUSH].push(attackPlan);
				}
				this.rushNumber++;
			}
		}
		else if (unexecutedAttacks[AttackPlan.TYPE_DEFAULT] == 0 &&
			unexecutedAttacks[AttackPlan.TYPE_HUGE_ATTACK] == 0 &&
			this.startedAttacks[AttackPlan.TYPE_DEFAULT].length +
				this.startedAttacks[AttackPlan.TYPE_HUGE_ATTACK].length <
				Math.min(2, 1 + Math.round(gameState.getPopulationMax() / 100)) &&
			(this.startedAttacks[AttackPlan.TYPE_DEFAULT].length +
				this.startedAttacks[AttackPlan.TYPE_HUGE_ATTACK].length == 0 ||
			gameState.getPopulationMax() - gameState.getPopulation() > 12))
		{
			if (barracksNb >= 1 && (gameState.currentPhase() > 1 || gameState.isResearching(gameState.getPhaseName(2))) ||
				!gameState.ai.HQ.hasPotentialBase())	// if we have no base ... nothing else to do than attack
			{
				const type = this.attackNumber < 2 ||
					this.startedAttacks[AttackPlan.TYPE_HUGE_ATTACK].length > 0 ?
					AttackPlan.TYPE_DEFAULT : AttackPlan.TYPE_HUGE_ATTACK;
				const attackPlan = new AttackPlan(gameState, this.Config, this.totalNumber, type,
					undefined, false);
				if (attackPlan.failed)
					this.attackPlansEncounteredWater = true; // hack
				else
				{
					if (this.Config.debug > 1)
					{
						aiWarn("Military Manager: Creating the plan " + type + "  " +
							this.totalNumber);
					}
					this.totalNumber++;
					attackPlan.init(gameState);
					this.upcomingAttacks[type].push(attackPlan);
				}
				this.attackNumber++;
			}
		}

		if (unexecutedAttacks[AttackPlan.TYPE_RAID] === 0 &&
			gameState.ai.HQ.defenseManager.targetList.length)
		{
			let target;
			for (const targetId of gameState.ai.HQ.defenseManager.targetList)
			{
				target = gameState.getEntityById(targetId);
				if (!target)
					continue;
				if (gameState.isPlayerEnemy(target.owner()))
					break;
				target = undefined;
			}
			if (target) // prepare a raid against this target
				this.raidTargetEntity(gameState, target);
		}

		// Check if we have some unused ranged siege unit which could do something useful while waiting
		if (this.Config.difficulty > difficulty.VERY_EASY && gameState.ai.playedTurn % 5 == 0)
			this.assignBombers(gameState);
	}

	getPlan(planName)
	{
		for (const attackType in this.upcomingAttacks)
		{
			for (const attack of this.upcomingAttacks[attackType])
				if (attack.getName() == planName)
					return attack;
		}
		for (const attackType in this.startedAttacks)
		{
			for (const attack of this.startedAttacks[attackType])
				if (attack.getName() == planName)
					return attack;
		}
		return undefined;
	}

	pausePlan(planName)
	{
		const attack = this.getPlan(planName);
		if (attack)
			attack.setPaused(true);
	}

	unpausePlan(planName)
	{
		const attack = this.getPlan(planName);
		if (attack)
			attack.setPaused(false);
	}

	pauseAllPlans()
	{
		for (const attackType in this.upcomingAttacks)
			for (const attack of this.upcomingAttacks[attackType])
				attack.setPaused(true);

		for (const attackType in this.startedAttacks)
			for (const attack of this.startedAttacks[attackType])
				attack.setPaused(true);
	}

	unpauseAllPlans()
	{
		for (const attackType in this.upcomingAttacks)
			for (const attack of this.upcomingAttacks[attackType])
				attack.setPaused(false);

		for (const attackType in this.startedAttacks)
			for (const attack of this.startedAttacks[attackType])
				attack.setPaused(false);
	}

	getAttackInPreparation(type)
	{
		return this.upcomingAttacks[type].length ? this.upcomingAttacks[type][0] : undefined;
	}

	/**
	 * Determine which player should be attacked: when called when starting the attack,
	 * attack.targetPlayer is undefined and in that case, we keep track of the chosen target
	 * for future attacks.
	 */
	getEnemyPlayer(gameState, attack)
	{
		let enemyPlayer;

		// First check if there is a preferred enemy based on our victory conditions.
		// If both wonder and relic, choose randomly between them TODO should combine decisions

		if (gameState.getVictoryConditions().has("wonder"))
			enemyPlayer = this.getWonderEnemyPlayer(gameState, attack);

		if (gameState.getVictoryConditions().has("capture_the_relic"))
			if (!enemyPlayer || randBool())
				enemyPlayer = this.getRelicEnemyPlayer(gameState, attack) || enemyPlayer;

		if (enemyPlayer)
			return enemyPlayer;

		const veto = {};
		for (const i in this.defeated)
			veto[i] = true;
		// No rush if enemy too well defended (i.e. iberians)
		if (attack.type === AttackPlan.TYPE_RUSH)
		{
			for (let i = 1; i < gameState.sharedScript.playersData.length; ++i)
			{
				if (!gameState.isPlayerEnemy(i) || veto[i])
					continue;
				if (this.defeated[i])
					continue;
				let enemyDefense = 0;
				for (const ent of gameState.getEnemyStructures(i).values())
					if (ent.hasClasses(["Tower", "WallTower", "Fortress"]))
						enemyDefense++;
				if (enemyDefense > 6)
					veto[i] = true;
			}
		}

		// then if not a huge attack, continue attacking our previous target as long as it has some entities,
		// otherwise target the most accessible one
		if (attack.type !== AttackPlan.TYPE_HUGE_ATTACK)
		{
			if (attack.targetPlayer === undefined && this.currentEnemyPlayer !== undefined &&
				!this.defeated[this.currentEnemyPlayer] &&
				gameState.isPlayerEnemy(this.currentEnemyPlayer) &&
				gameState.getEntities(this.currentEnemyPlayer).hasEntities())
				return this.currentEnemyPlayer;

			let distmin;
			let ccmin;
			const ccEnts = gameState.updatingGlobalCollection("allCCs", filters.byClass("CivCentre"));
			for (const ourcc of ccEnts.values())
			{
				if (ourcc.owner() != PlayerID)
					continue;
				const ourPos = ourcc.position();
				const access = getLandAccess(gameState, ourcc);
				for (const enemycc of ccEnts.values())
				{
					if (veto[enemycc.owner()])
						continue;
					if (!gameState.isPlayerEnemy(enemycc.owner()))
						continue;
					if (access !== getLandAccess(gameState, enemycc))
						continue;
					const dist = SquareVectorDistance(ourPos, enemycc.position());
					if (distmin && dist > distmin)
						continue;
					ccmin = enemycc;
					distmin = dist;
				}
			}
			if (ccmin)
			{
				enemyPlayer = ccmin.owner();
				if (attack.targetPlayer === undefined)
					this.currentEnemyPlayer = enemyPlayer;
				return enemyPlayer;
			}
		}

		// then let's target our strongest enemy (basically counting enemies units)
		// with priority to enemies with civ center
		let max = 0;
		for (let i = 1; i < gameState.sharedScript.playersData.length; ++i)
		{
			if (veto[i])
				continue;
			if (!gameState.isPlayerEnemy(i))
				continue;
			let enemyCount = 0;
			let enemyCivCentre = false;
			for (const ent of gameState.getEntities(i).values())
			{
				enemyCount++;
				if (ent.hasClass("CivCentre"))
					enemyCivCentre = true;
			}
			if (enemyCivCentre)
				enemyCount += 500;
			if (!enemyCount || enemyCount < max)
				continue;
			max = enemyCount;
			enemyPlayer = i;
		}
		if (attack.targetPlayer === undefined)
			this.currentEnemyPlayer = enemyPlayer;
		return enemyPlayer;
	}

	/**
	 * Target the player with the most advanced wonder.
	 * TODO currently the first built wonder is kept, should chek on the minimum wonderDuration left instead.
	 */
	getWonderEnemyPlayer(gameState, attack)
	{
		let enemyPlayer;
		let enemyWonder;
		let moreAdvanced;
		for (const wonder of gameState.getEnemyStructures().filter(filters.byClass("Wonder")).values())
		{
			if (wonder.owner() == 0)
				continue;
			const progress = wonder.foundationProgress();
			if (progress === undefined)
			{
				enemyWonder = wonder;
				break;
			}
			if (enemyWonder && moreAdvanced > progress)
				continue;
			enemyWonder = wonder;
			moreAdvanced = progress;
		}
		if (enemyWonder)
		{
			enemyPlayer = enemyWonder.owner();
			if (attack.targetPlayer === undefined)
				this.currentEnemyPlayer = enemyPlayer;
		}
		return enemyPlayer;
	}

	/**
	 * Target the player with the most relics (including gaia).
	 */
	getRelicEnemyPlayer(gameState, attack)
	{
		let enemyPlayer;
		const allRelics = gameState.updatingGlobalCollection("allRelics", filters.byClass("Relic"));
		let maxRelicsOwned = 0;
		for (let i = 0; i < gameState.sharedScript.playersData.length; ++i)
		{
			if (!gameState.isPlayerEnemy(i) || this.defeated[i] ||
			    i == 0 && !gameState.ai.HQ.victoryManager.tryCaptureGaiaRelic)
				continue;

			const relicsCount = allRelics.filter(relic => relic.owner() == i).length;
			if (relicsCount <= maxRelicsOwned)
				continue;
			maxRelicsOwned = relicsCount;
			enemyPlayer = i;
		}
		if (enemyPlayer !== undefined)
		{
			if (attack.targetPlayer === undefined)
				this.currentEnemyPlayer = enemyPlayer;
			if (enemyPlayer == 0)
				gameState.ai.HQ.victoryManager.resetCaptureGaiaRelic(gameState);
		}
		return enemyPlayer;
	}

	/** f.e. if we have changed diplomacy with another player. */
	cancelAttacksAgainstPlayer(gameState, player)
	{
		for (const attackType in this.upcomingAttacks)
			for (const attack of this.upcomingAttacks[attackType])
				if (attack.targetPlayer === player)
					attack.targetPlayer = undefined;

		for (const attackType in this.startedAttacks)
			for (let i = 0; i < this.startedAttacks[attackType].length; ++i)
			{
				const attack = this.startedAttacks[attackType][i];
				if (attack.targetPlayer === player)
				{
					attack.Abort(gameState);
					this.startedAttacks[attackType].splice(i--, 1);
				}
			}
	}

	raidTargetEntity(gameState, ent)
	{
		const data = { "target": ent };
		const attackPlan = new AttackPlan(gameState, this.Config, this.totalNumber,
			AttackPlan.TYPE_RAID, data, false);
		if (attackPlan.failed)
			return null;
		if (this.Config.debug > 1)
			aiWarn("Military Manager: Raiding plan " + this.totalNumber);
		this.raidNumber++;
		this.totalNumber++;
		attackPlan.init(gameState);
		this.upcomingAttacks[AttackPlan.TYPE_RAID].push(attackPlan);
		return attackPlan;
	}

	/**
	 * Return the number of units from any of our attacking armies around this position
	 */
	numAttackingUnitsAround(pos, dist)
	{
		let num = 0;
		for (const attackType in this.startedAttacks)
			for (const attack of this.startedAttacks[attackType])
			{
				if (!attack.position)	// this attack may be inside a transport
					continue;
				if (SquareVectorDistance(pos, attack.position) < dist*dist)
					num += attack.unitCollection.length;
			}
		return num;
	}

	/**
	 * Switch defense armies into an attack one against the given target
	 * data.range: transform all defense armies inside range of the target into a new attack
	 * data.armyID: transform only the defense army ID into a new attack
	 * data.uniqueTarget: the attack will stop when the target is destroyed or captured
	 */
	switchDefenseToAttack(gameState, target, data)
	{
		if (!target || !target.position())
			return false;
		if (!data.range && !data.armyID)
		{
			aiWarn(" attackManager.switchDefenseToAttack inconsistent data " + uneval(data));
			return false;
		}
		const attackData = data.uniqueTarget ? { "uniqueTargetId": target.id() } : undefined;
		const pos = target.position();
		const attackType = AttackPlan.TYPE_DEFAULT;
		const attackPlan = new AttackPlan(gameState, this.Config, this.totalNumber, attackType, attackData,
			false);
		if (attackPlan.failed)
			return false;
		this.totalNumber++;
		attackPlan.init(gameState);
		this.startedAttacks[attackType].push(attackPlan);

		const targetAccess = getLandAccess(gameState, target);
		for (const army of gameState.ai.HQ.defenseManager.armies)
		{
			if (data.range)
			{
				army.recalculatePosition(gameState);
				if (SquareVectorDistance(pos, army.foePosition) > data.range * data.range)
					continue;
			}
			else if (army.ID != +data.armyID)
				continue;

			while (army.foeEntities.length > 0)
				army.removeFoe(gameState, army.foeEntities[0]);
			while (army.ownEntities.length > 0)
			{
				const unitId = army.ownEntities[0];
				army.removeOwn(gameState, unitId);
				const unit = gameState.getEntityById(unitId);
				const accessOk = unit.getMetadata(PlayerID, "transport") !== undefined ||
					unit.position() && getLandAccess(gameState, unit) == targetAccess;
				if (unit && accessOk && attackPlan.isAvailableUnit(gameState, unit))
				{
					unit.setMetadata(PlayerID, "plan", attackPlan.name);
					unit.setMetadata(PlayerID, "role", Worker.ROLE_ATTACK);
					attackPlan.unitCollection.updateEnt(unit);
				}
			}
		}
		if (!attackPlan.unitCollection.hasEntities())
		{
			attackPlan.Abort(gameState);
			return false;
		}
		for (const unit of attackPlan.unitCollection.values())
			unit.setMetadata(PlayerID, "role", Worker.ROLE_ATTACK);
		attackPlan.targetPlayer = target.owner();
		attackPlan.targetPos = pos;
		attackPlan.target = target;
		attackPlan.state = AttackPlan.STATE_ARRIVED;
		return true;
	}

	Serialize()
	{
		const properties = {
			"totalNumber": this.totalNumber,
			"attackNumber": this.attackNumber,
			"rushNumber": this.rushNumber,
			"raidNumber": this.raidNumber,
			"debugTime": this.debugTime,
			"maxRushes": this.maxRushes,
			"rushSize": this.rushSize,
			"currentEnemyPlayer": this.currentEnemyPlayer,
			"defeated": this.defeated
		};

		const upcomingAttacks = {};
		for (const key in this.upcomingAttacks)
		{
			upcomingAttacks[key] = [];
			for (const attack of this.upcomingAttacks[key])
				upcomingAttacks[key].push(attack.Serialize());
		}

		const startedAttacks = {};
		for (const key in this.startedAttacks)
		{
			startedAttacks[key] = [];
			for (const attack of this.startedAttacks[key])
				startedAttacks[key].push(attack.Serialize());
		}

		return { "properties": properties, "upcomingAttacks": upcomingAttacks, "startedAttacks": startedAttacks };
	}

	Deserialize(gameState, data)
	{
		for (const key in data.properties)
			this[key] = data.properties[key];

		this.upcomingAttacks = {};
		for (const key in data.upcomingAttacks)
		{
			this.upcomingAttacks[key] = [];
			for (const dataAttack of data.upcomingAttacks[key])
			{
				const attack = new AttackPlan(gameState, this.Config, dataAttack.properties.name,
					undefined, undefined, true);
				attack.Deserialize(gameState, dataAttack);
				attack.init(gameState);
				this.upcomingAttacks[key].push(attack);
			}
		}

		this.startedAttacks = {};
		for (const key in data.startedAttacks)
		{
			this.startedAttacks[key] = [];
			for (const dataAttack of data.startedAttacks[key])
			{
				const attack = new AttackPlan(gameState, this.Config, dataAttack.properties.name,
					undefined, undefined, true);
				attack.Deserialize(gameState, dataAttack);
				attack.init(gameState);
				this.startedAttacks[key].push(attack);
			}
		}
	}
}
