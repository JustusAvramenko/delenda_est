GuiInterface.prototype.GetSimulationState = function()
{
	const ret = {
		"players": []
	};

	const cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	const numPlayers = cmpPlayerManager.GetNumPlayers();
	for (let i = 0; i < numPlayers; ++i)
	{
		const playerEnt = cmpPlayerManager.GetPlayerByID(i);
		const cmpPlayer = Engine.QueryInterface(playerEnt, IID_Player);
		const cmpPlayerEntityLimits = Engine.QueryInterface(playerEnt, IID_EntityLimits);
		const cmpIdentity = Engine.QueryInterface(playerEnt, IID_Identity);
		const cmpDiplomacy = Engine.QueryInterface(playerEnt, IID_Diplomacy);

		// Work out which phase we are in.
		let phase = "";
		const cmpTechnologyManager = Engine.QueryInterface(playerEnt, IID_TechnologyManager);
		if (cmpTechnologyManager)
		{
			if (cmpTechnologyManager.IsTechnologyResearched("phase_empire"))
				phase = "empire";  // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< THIS IS ADDED FOR DE.
			else if (cmpTechnologyManager.IsTechnologyResearched("phase_city"))
				phase = "city";
			else if (cmpTechnologyManager.IsTechnologyResearched("phase_town"))
				phase = "town";
			else if (cmpTechnologyManager.IsTechnologyResearched("phase_village"))
				phase = "village";
		}

		const allies = [];
		const mutualAllies = [];
		const neutrals = [];
		const enemies = [];

		for (let j = 0; j < numPlayers; ++j)
		{
			allies[j] = cmpDiplomacy.IsAlly(j);
			mutualAllies[j] = cmpDiplomacy.IsMutualAlly(j);
			neutrals[j] = cmpDiplomacy.IsNeutral(j);
			enemies[j] = cmpDiplomacy.IsEnemy(j);
		}

		ret.players.push({
			"name": cmpIdentity.GetName(),
			"civ": cmpIdentity.GetCiv(),
			"color": cmpPlayer.GetColor(),
			"entity": cmpPlayer.entity,
			"controlsAll": cmpPlayer.CanControlAllUnits(),
			"popCount": cmpPlayer.GetPopulationCount(),
			"popLimit": cmpPlayer.GetPopulationLimit(),
			"popMax": cmpPlayer.GetMaxPopulation(),
			"panelEntities": cmpPlayer.GetPanelEntities(),
			"resourceCounts": cmpPlayer.GetResourceCounts(),
			"resourceGatherers": cmpPlayer.GetResourceGatherers(),
			"trainingBlocked": cmpPlayer.IsTrainingBlocked(),
			"state": cmpPlayer.GetState(),
			"team": cmpDiplomacy.GetTeam(),
			"teamLocked": cmpDiplomacy.IsTeamLocked(),
			"disabledTemplates": cmpPlayer.GetDisabledTemplates(),
			"disabledTechnologies": cmpPlayer.GetDisabledTechnologies(),
			"hasSharedDropsites": cmpDiplomacy.HasSharedDropsites(),
			"hasSharedLos": cmpDiplomacy.HasSharedLos(),
			"spyCostMultiplier": cmpPlayer.GetSpyCostMultiplier(),
			"phase": phase,
			"isAlly": allies,
			"isMutualAlly": mutualAllies,
			"isNeutral": neutrals,
			"isEnemy": enemies,
			"entityLimits": cmpPlayerEntityLimits ? cmpPlayerEntityLimits.GetLimits() : null,
			"entityCounts": cmpPlayerEntityLimits ? cmpPlayerEntityLimits.GetCounts() : null,
			"matchEntityCounts": cmpPlayerEntityLimits ? cmpPlayerEntityLimits.GetMatchCounts() : null,
			"entityLimitChangers": cmpPlayerEntityLimits ? cmpPlayerEntityLimits.GetLimitChangers() : null,
			"researchQueued": cmpTechnologyManager ? cmpTechnologyManager.GetQueuedResearch() : null,
			"researchedTechs": cmpTechnologyManager ? cmpTechnologyManager.GetResearchedTechs() : null,
			"classCounts": cmpTechnologyManager ? cmpTechnologyManager.GetClassCounts() : null,
			"typeCountsByClass": cmpTechnologyManager ? cmpTechnologyManager.GetTypeCountsByClass() : null,
			"canBarter": cmpPlayer.CanBarter(),
			"barterPrices": Engine.QueryInterface(SYSTEM_ENTITY, IID_Barter).GetPrices(cmpPlayer)
		});
	}

	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	if (cmpRangeManager)
		ret.circularMap = cmpRangeManager.GetLosCircular();

	const cmpTerrain = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain);
	if (cmpTerrain)
		ret.mapSize = cmpTerrain.GetMapSize();

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	ret.timeElapsed = cmpTimer.GetTime();

	const cmpCeasefireManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_CeasefireManager);
	if (cmpCeasefireManager)
	{
		ret.ceasefireActive = cmpCeasefireManager.IsCeasefireActive();
		ret.ceasefireTimeRemaining = ret.ceasefireActive ? cmpCeasefireManager.GetCeasefireStartedTime() + cmpCeasefireManager.GetCeasefireTime() - ret.timeElapsed : 0;
	}

	const cmpCinemaManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_CinemaManager);
	if (cmpCinemaManager)
		ret.cinemaPathPlaying = cmpCinemaManager.IsPlayingQueue();

	const cmpEndGameManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_EndGameManager);
	ret.victoryConditions = cmpEndGameManager.GetVictoryConditions();
	ret.alliedVictory = cmpEndGameManager.GetAlliedVictory();

	const cmpPopulationCapManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PopulationCapManager);
	ret.populationCapType = cmpPopulationCapManager.GetPopulationCapType();
	ret.populationCap = cmpPopulationCapManager.GetPopulationCap();

	for (let i = 0; i < numPlayers; ++i)
	{
		const cmpPlayerStatisticsTracker = QueryPlayerIDInterface(i, IID_StatisticsTracker);
		if (cmpPlayerStatisticsTracker)
			ret.players[i].statistics = cmpPlayerStatisticsTracker.GetBasicStatistics();
	}

	return ret;
};

/**
 *
 *
 *
 *
 * Added for Multiple Projectiles. Remove once #8920 is committed!
 *
 *
 *
 *
 *
 */
GuiInterface.prototype.GetEntityState = function(player, ent)
{
	if (!ent)
		return null;

	// All units must have a template; if not then it's a nonexistent entity id.
	const template = Engine.QueryInterface(SYSTEM_ENTITY, IID_TemplateManager).GetCurrentTemplateName(ent);
	if (!template)
		return null;

	const ret = {
		"id": ent,
		"player": INVALID_PLAYER,
		"template": template
	};

	const cmpAuras = Engine.QueryInterface(ent, IID_Auras);
	if (cmpAuras)
		ret.auras = cmpAuras.GetDescriptions();

	const cmpMirage = Engine.QueryInterface(ent, IID_Mirage);
	if (cmpMirage)
		ret.mirage = true;

	const cmpIdentity = Engine.QueryInterface(ent, IID_Identity);
	if (cmpIdentity)
		ret.identity = {
			"rank": cmpIdentity.GetRank(),
			"rankTechName": cmpIdentity.GetRankTechName(),
			"classes": cmpIdentity.GetClassesList(),
			"selectionGroupName": cmpIdentity.GetSelectionGroupName(),
			"canDelete": !cmpIdentity.IsUndeletable(),
			"controllable": cmpIdentity.IsControllable()
		};

	const cmpFormation = Engine.QueryInterface(ent, IID_Formation);
	if (cmpFormation)
		ret.formation = {
			"members": cmpFormation.GetMembers()
		};

	const cmpPosition = Engine.QueryInterface(ent, IID_Position);
	if (cmpPosition && cmpPosition.IsInWorld())
		ret.position = cmpPosition.GetPosition();

	const cmpHealth = QueryMiragedInterface(ent, IID_Health);
	if (cmpHealth)
	{
		ret.hitpoints = cmpHealth.GetHitpoints();
		ret.maxHitpoints = cmpHealth.GetMaxHitpoints();
		ret.needsRepair = cmpHealth.IsRepairable() && cmpHealth.IsInjured();
		ret.needsHeal = !cmpHealth.IsUnhealable();
	}

	const cmpCapturable = QueryMiragedInterface(ent, IID_Capturable);
	if (cmpCapturable)
	{
		ret.capturePoints = cmpCapturable.GetCapturePoints();
		ret.maxCapturePoints = cmpCapturable.GetMaxCapturePoints();
	}

	const cmpBuilder = Engine.QueryInterface(ent, IID_Builder);
	if (cmpBuilder)
		ret.builder = true;

	const cmpMarket = QueryMiragedInterface(ent, IID_Market);
	if (cmpMarket)
		ret.market = {
			"land": cmpMarket.HasType("land"),
			"naval": cmpMarket.HasType("naval")
		};

	const cmpPack = Engine.QueryInterface(ent, IID_Pack);
	if (cmpPack)
		ret.pack = {
			"packed": cmpPack.IsPacked(),
			"progress": cmpPack.GetProgress()
		};

	const cmpPopulation = Engine.QueryInterface(ent, IID_Population);
	if (cmpPopulation)
		ret.population = {
			"bonus": cmpPopulation.GetPopBonus()
		};

	const cmpUpgrade = Engine.QueryInterface(ent, IID_Upgrade);
	if (cmpUpgrade)
		ret.upgrade = {
			"upgrades": cmpUpgrade.GetUpgrades(),
			"progress": cmpUpgrade.GetProgress(),
			"template": cmpUpgrade.GetUpgradingTo(),
			"isUpgrading": cmpUpgrade.IsUpgrading()
		};

	const cmpResearcher = Engine.QueryInterface(ent, IID_Researcher);
	if (cmpResearcher)
		ret.researcher = {
			"technologies": cmpResearcher.GetTechnologiesList(),
			"techCostMultiplier": cmpResearcher.GetTechCostMultiplier()
		};

	const cmpStatusEffects = Engine.QueryInterface(ent, IID_StatusEffectsReceiver);
	if (cmpStatusEffects)
		ret.statusEffects = cmpStatusEffects.GetActiveStatuses();

	const cmpProductionQueue = Engine.QueryInterface(ent, IID_ProductionQueue);
	if (cmpProductionQueue)
		ret.production = {
			"queue": cmpProductionQueue.GetQueue(),
			"autoqueue": cmpProductionQueue.IsAutoQueueing()
		};

	const cmpTrainer = Engine.QueryInterface(ent, IID_Trainer);
	if (cmpTrainer)
		ret.trainer = {
			"entities": cmpTrainer.GetEntitiesList()
		};

	const cmpTrader = Engine.QueryInterface(ent, IID_Trader);
	if (cmpTrader)
		ret.trader = {
			"goods": cmpTrader.GetGoods()
		};

	const cmpFoundation = QueryMiragedInterface(ent, IID_Foundation);
	if (cmpFoundation)
		ret.foundation = {
			"numBuilders": cmpFoundation.GetNumBuilders(),
			"buildTime": cmpFoundation.GetBuildTime()
		};

	const cmpRepairable = QueryMiragedInterface(ent, IID_Repairable);
	if (cmpRepairable)
		ret.repairable = {
			"numBuilders": cmpRepairable.GetNumBuilders(),
			"buildTime": cmpRepairable.GetBuildTime()
		};

	const cmpOwnership = Engine.QueryInterface(ent, IID_Ownership);
	if (cmpOwnership)
		ret.player = cmpOwnership.GetOwner();

	const cmpRallyPoint = Engine.QueryInterface(ent, IID_RallyPoint);
	if (cmpRallyPoint)
		ret.rallyPoint = { "position": cmpRallyPoint.GetPositions()[0] }; // undefined or {x,z} object

	const cmpGarrisonHolder = Engine.QueryInterface(ent, IID_GarrisonHolder);
	if (cmpGarrisonHolder)
		ret.garrisonHolder = {
			"entities": cmpGarrisonHolder.GetEntities(),
			"buffHeal": cmpGarrisonHolder.GetHealRate(),
			"allowedClasses": cmpGarrisonHolder.GetAllowedClasses(),
			"capacity": cmpGarrisonHolder.GetCapacity(),
			"occupiedSlots": cmpGarrisonHolder.OccupiedSlots()
		};

	const cmpTurretHolder = Engine.QueryInterface(ent, IID_TurretHolder);
	if (cmpTurretHolder)
		ret.turretHolder = {
			"turretPoints": cmpTurretHolder.GetTurretPoints()
		};

	const cmpTurretable = Engine.QueryInterface(ent, IID_Turretable);
	if (cmpTurretable)
		ret.turretable = {
			"ejectable": cmpTurretable.IsEjectable(),
			"holder": cmpTurretable.HolderID()
		};

	const cmpGarrisonable = Engine.QueryInterface(ent, IID_Garrisonable);
	if (cmpGarrisonable)
		ret.garrisonable = {
			"holder": cmpGarrisonable.HolderID(),
			"size": cmpGarrisonable.UnitSize()
		};

	const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
	if (cmpUnitAI)
		ret.unitAI = {
			"state": cmpUnitAI.GetCurrentState(),
			"orders": cmpUnitAI.GetOrders(),
			"hasWorkOrders": cmpUnitAI.HasWorkOrders(),
			"canGuard": cmpUnitAI.CanGuard(),
			"isGuarding": cmpUnitAI.IsGuardOf(),
			"canPatrol": cmpUnitAI.CanPatrol(),
			"selectableStances": cmpUnitAI.GetSelectableStances(),
			"isIdle": cmpUnitAI.IsIdle(),
			"formations": cmpUnitAI.GetFormationsList(),
			"formation": cmpUnitAI.GetFormationController()
		};

	const cmpGuard = Engine.QueryInterface(ent, IID_Guard);
	if (cmpGuard)
		ret.guard = {
			"entities": cmpGuard.GetEntities()
		};

	const cmpResourceGatherer = Engine.QueryInterface(ent, IID_ResourceGatherer);
	if (cmpResourceGatherer)
	{
		ret.resourceCarrying = cmpResourceGatherer.GetCarryingStatus();
		ret.resourceGatherRates = cmpResourceGatherer.GetGatherRates();
	}

	const cmpGate = Engine.QueryInterface(ent, IID_Gate);
	if (cmpGate)
		ret.gate = {
			"locked": cmpGate.IsLocked()
		};

	const cmpAlertRaiser = Engine.QueryInterface(ent, IID_AlertRaiser);
	if (cmpAlertRaiser)
		ret.alertRaiser = {
			"classes": cmpAlertRaiser.GetTargetClasses()
		};

	const cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	ret.visibility = cmpRangeManager.GetLosVisibility(ent, player);

	const cmpAttack = Engine.QueryInterface(ent, IID_Attack);
	if (cmpAttack)
	{
		const types = cmpAttack.GetAttackTypes();
		if (types.length)
			ret.attack = {};

		for (const type of types)
		{
			ret.attack[type] = {};

			Object.assign(ret.attack[type], cmpAttack.GetAttackEffectsData(type));

			ret.attack[type].attackName = cmpAttack.GetAttackName(type);

			ret.attack[type].splash = cmpAttack.GetSplashData(type);
			if (ret.attack[type].splash)
				Object.assign(ret.attack[type].splash, cmpAttack.GetAttackEffectsData(type, true));

			ret.attack[type].projectileCount = cmpAttack.GetProjectileCount(type);

			const range = cmpAttack.GetRange(type);
			ret.attack[type].minRange = range.min;
			ret.attack[type].maxRange = range.max;
			ret.attack[type].yOrigin = cmpAttack.GetAttackYOrigin(type);

			const timers = cmpAttack.GetTimers(type);
			ret.attack[type].prepareTime = timers.prepare;
			ret.attack[type].repeatTime = timers.repeat;

			if (type != "Ranged")
			{
				ret.attack[type].elevationAdaptedRange = ret.attack.maxRange;
				continue;
			}

			if (cmpPosition && cmpPosition.IsInWorld())
				// For units, take the range in front of it, no spread, so angle = 0,
				// else, take the average elevation around it: angle = 2 * pi.
				ret.attack[type].elevationAdaptedRange = cmpRangeManager.GetElevationAdaptedRange(cmpPosition.GetPosition(), cmpPosition.GetRotation(), range.max, ret.attack[type].yOrigin, cmpUnitAI ? 0 : 2 * Math.PI);
			else
				// Not in world, set a default?
				ret.attack[type].elevationAdaptedRange = ret.attack.maxRange;
		}
	}

	const cmpResistance = QueryMiragedInterface(ent, IID_Resistance);
	if (cmpResistance)
		ret.resistance = cmpResistance.GetResistanceOfForm(cmpFoundation ? "Foundation" : "Entity");

	const cmpBuildingAI = Engine.QueryInterface(ent, IID_BuildingAI);
	if (cmpBuildingAI)
		ret.buildingAI = {
			"defaultArrowCount": cmpBuildingAI.GetDefaultArrowCount(),
			"maxArrowCount": cmpBuildingAI.GetMaxArrowCount(),
			"garrisonArrowMultiplier": cmpBuildingAI.GetGarrisonArrowMultiplier(),
			"garrisonArrowClasses": cmpBuildingAI.GetGarrisonArrowClasses(),
			"arrowCount": cmpBuildingAI.GetArrowCount()
		};

	if (cmpPosition && cmpPosition.GetTurretParent() != INVALID_ENTITY)
		ret.turretParent = cmpPosition.GetTurretParent();

	const cmpResourceSupply = QueryMiragedInterface(ent, IID_ResourceSupply);
	if (cmpResourceSupply)
		ret.resourceSupply = {
			"isInfinite": cmpResourceSupply.IsInfinite(),
			"max": cmpResourceSupply.GetMaxAmount(),
			"amount": cmpResourceSupply.GetCurrentAmount(),
			"type": cmpResourceSupply.GetType(),
			"killBeforeGather": cmpResourceSupply.GetKillBeforeGather(),
			"maxGatherers": cmpResourceSupply.GetMaxGatherers(),
			"numGatherers": cmpResourceSupply.GetNumGatherers()
		};

	const cmpResourceDropsite = Engine.QueryInterface(ent, IID_ResourceDropsite);
	if (cmpResourceDropsite)
		ret.resourceDropsite = {
			"types": cmpResourceDropsite.GetTypes(),
			"sharable": cmpResourceDropsite.IsSharable(),
			"shared": cmpResourceDropsite.IsShared()
		};

	const cmpPromotion = Engine.QueryInterface(ent, IID_Promotion);
	if (cmpPromotion)
		ret.promotion = {
			"curr": cmpPromotion.GetCurrentXp(),
			"req": cmpPromotion.GetRequiredXp()
		};

	if (!cmpFoundation && cmpIdentity && cmpIdentity.HasClass("Barter"))
		ret.isBarterMarket = true;

	const cmpHeal = Engine.QueryInterface(ent, IID_Heal);
	if (cmpHeal)
		ret.heal = {
			"health": cmpHeal.GetHealth(),
			"range": cmpHeal.GetRange().max,
			"interval": cmpHeal.GetInterval(),
			"unhealableClasses": cmpHeal.GetUnhealableClasses(),
			"healableClasses": cmpHeal.GetHealableClasses()
		};

	const cmpLoot = Engine.QueryInterface(ent, IID_Loot);
	if (cmpLoot)
	{
		ret.loot = cmpLoot.GetResources();
		ret.loot.xp = cmpLoot.GetXp();
	}

	const cmpResourceTrickle = Engine.QueryInterface(ent, IID_ResourceTrickle);
	if (cmpResourceTrickle)
		ret.resourceTrickle = {
			"interval": cmpResourceTrickle.GetInterval(),
			"rates": cmpResourceTrickle.GetRates()
		};

	const cmpTreasure = Engine.QueryInterface(ent, IID_Treasure);
	if (cmpTreasure)
		ret.treasure = {
			"collectTime": cmpTreasure.CollectionTime(),
			"resources": cmpTreasure.Resources()
		};

	const cmpTreasureCollector = Engine.QueryInterface(ent, IID_TreasureCollector);
	if (cmpTreasureCollector)
		ret.treasureCollector = true;

	const cmpUnitMotion = Engine.QueryInterface(ent, IID_UnitMotion);
	if (cmpUnitMotion)
		ret.speed = {
			"walk": cmpUnitMotion.GetWalkSpeed(),
			"run": cmpUnitMotion.GetWalkSpeed() * cmpUnitMotion.GetRunMultiplier(),
			"acceleration": cmpUnitMotion.GetAcceleration()
		};

	const cmpUpkeep = Engine.QueryInterface(ent, IID_Upkeep);
	if (cmpUpkeep)
		ret.upkeep = {
			"interval": cmpUpkeep.GetInterval(),
			"rates": cmpUpkeep.GetRates()
		};

	return ret;
};