function InitGame(settings)
{
	// No settings when loading a map in Atlas, so do nothing
	if (!settings)
	{
		// Map dependent initialisations of components (i.e. garrisoned units)
		Engine.BroadcastMessage(MT_InitGame, {});
		return;
	}

	if (settings.ExploreMap)
	{
		let cmpRangeManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager);
		for (let i = 1; i < settings.PlayerData.length; ++i)
			cmpRangeManager.ExploreAllTiles(i);
	}

		if (settings.AllyMap)
	{
		for (let i = 1; i < settings.PlayerData.length; ++i)
		{
			let cmpPlayer = QueryPlayerIDInterface(i);
			let cmpTechnologyManager = Engine.QueryInterface(cmpPlayer.entity, IID_TechnologyManager);
			if (cmpTechnologyManager)
			{
				cmpTechnologyManager.ResearchTechnology(cmpPlayer.template.SharedLosTech);
				cmpPlayer.UpdateSharedLos();
			}
		}
	}

	// Sandbox, Very Easy, Easy, Medium, Hard, Very Hard
	// rate apply on resource stockpiling as gathering and trading
	// time apply on building, upgrading, packing, training and technologies
	let rate = [ 0.42, 0.56, 0.75, 1.00, 1.25, 1.56 ];
	let time = [ 1.40, 1.25, 1.10, 1.00, 1.00, 1.00 ];
	let cmpModifiersManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_ModifiersManager);
	let cmpAIManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_AIManager);
	for (let i = 0; i < settings.PlayerData.length; ++i)
	{
		let cmpPlayer = QueryPlayerIDInterface(i);
		cmpPlayer.SetCheatsEnabled(!!settings.CheatsEnabled);

		if (settings.PlayerData[i] && !!settings.PlayerData[i].AI)
		{
			let AIDiff = +settings.PlayerData[i].AIDiff;
			cmpAIManager.AddPlayer(settings.PlayerData[i].AI, i, AIDiff, settings.PlayerData[i].AIBehavior || "random");
			cmpPlayer.SetAI(true);
			AIDiff = Math.min(AIDiff, rate.length - 1);
			cmpModifiersManager.AddModifiers("AI Bonus", {
				"ResourceGatherer/BaseSpeed": [{ "affects": ["Unit", "Structure"], "multiply": rate[AIDiff] }],
				"Trader/GainMultiplier": [{ "affects": ["Unit", "Structure"], "multiply": rate[AIDiff] }],
				"Cost/BuildTime": [{ "affects": ["Unit", "Structure"], "multiply": time[AIDiff] }],
			}, cmpPlayer.entity);
		}
	}
	// Map or player data (handicap...) dependent initialisations of components (i.e. garrisoned units)
	Engine.BroadcastMessage(MT_InitGame, {});

	cmpAIManager.TryLoadSharedComponent();
	cmpAIManager.RunGamestateInit();
}

Engine.RegisterGlobal("InitGame", InitGame);
