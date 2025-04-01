GuiInterface.prototype.GetSimulationState = function()
{
	let ret = {
		"players": []
	};

	let cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	let numPlayers = cmpPlayerManager.GetNumPlayers();
	for (let i = 0; i < numPlayers; ++i)
	{
		const playerEnt = cmpPlayerManager.GetPlayerByID(i);
		const cmpPlayer = Engine.QueryInterface(playerEnt, IID_Player);
		const cmpPlayerEntityLimits = Engine.QueryInterface(playerEnt, IID_EntityLimits);
		const cmpIdentity = Engine.QueryInterface(playerEnt, IID_Identity);
		const cmpDiplomacy = Engine.QueryInterface(playerEnt, IID_Diplomacy);

		// Work out which phase we are in. "phase_empire" added for Delenda Est.
		let phase = "";
		const cmpTechnologyManager = Engine.QueryInterface(playerEnt, IID_TechnologyManager);
		if (cmpTechnologyManager)
		{
			if (cmpTechnologyManager.IsTechnologyResearched("phase_empire"))
				phase = "empire";
			else if (cmpTechnologyManager.IsTechnologyResearched("phase_city"))
				phase = "city";
			else if (cmpTechnologyManager.IsTechnologyResearched("phase_town"))
				phase = "town";
			else if (cmpTechnologyManager.IsTechnologyResearched("phase_village"))
				phase = "village";
		}

		let allies = [];
		let mutualAllies = [];
		let neutrals = [];
		let enemies = [];

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
			"cheatsEnabled": cmpPlayer.GetCheatsEnabled(),
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

	let cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
	if (cmpRangeManager)
		ret.circularMap = cmpRangeManager.GetLosCircular();

	let cmpTerrain = Engine.QueryInterface(SYSTEM_ENTITY, IID_Terrain);
	if (cmpTerrain)
		ret.mapSize = cmpTerrain.GetMapSize();

	let cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	ret.timeElapsed = cmpTimer.GetTime();

	let cmpCeasefireManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_CeasefireManager);
	if (cmpCeasefireManager)
	{
		ret.ceasefireActive = cmpCeasefireManager.IsCeasefireActive();
		ret.ceasefireTimeRemaining = ret.ceasefireActive ? cmpCeasefireManager.GetCeasefireStartedTime() + cmpCeasefireManager.GetCeasefireTime() - ret.timeElapsed : 0;
	}

	let cmpCinemaManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_CinemaManager);
	if (cmpCinemaManager)
		ret.cinemaPlaying = cmpCinemaManager.IsPlaying();

	let cmpEndGameManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_EndGameManager);
	ret.victoryConditions = cmpEndGameManager.GetVictoryConditions();
	ret.alliedVictory = cmpEndGameManager.GetAlliedVictory();

	let cmpPopulationCapManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PopulationCapManager);
	ret.populationCapType = cmpPopulationCapManager.GetPopulationCapType();
	ret.populationCap = cmpPopulationCapManager.GetPopulationCap();

	for (let i = 0; i < numPlayers; ++i)
	{
		let cmpPlayerStatisticsTracker = QueryPlayerIDInterface(i, IID_StatisticsTracker);
		if (cmpPlayerStatisticsTracker)
			ret.players[i].statistics = cmpPlayerStatisticsTracker.GetBasicStatistics();
	}

	return ret;
};
