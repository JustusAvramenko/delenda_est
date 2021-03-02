/**
 * Sets an additional map label, map preview image and describes the chosen gamesettings more closely.
 *
 * Requires g_GameAttributes and g_VictoryConditions.
 */
function getGameDescriptionList(mapCache)
{
	let titles = [];
	if (!g_GameAttributes.settings.VictoryConditions.length)
		titles.push({
			"label": translateWithContext("victory condition", "Endless Game"),
			"value": translate("No winner will be determined, even if everyone is defeated.")
		});

	for (let victoryCondition of g_VictoryConditions)
	{
		if (g_GameAttributes.settings.VictoryConditions.indexOf(victoryCondition.Name) == -1)
			continue;

		let title = translateVictoryCondition(victoryCondition.Name);
		if (victoryCondition.Name == "wonder")
		{
			let wonderDuration = Math.round(g_GameAttributes.settings.WonderDuration);
			title = sprintf(
				translatePluralWithContext(
					"victory condition",
					"Wonder (%(min)s minute)",
					"Wonder (%(min)s minutes)",
					wonderDuration
				),
				{ "min": wonderDuration });
		}

		let isCaptureTheRelic = victoryCondition.Name == "capture_the_relic";
		if (isCaptureTheRelic)
		{
			let relicDuration = Math.round(g_GameAttributes.settings.RelicDuration);
			title = sprintf(
				translatePluralWithContext(
					"victory condition",
					"Capture the Relic (%(min)s minute)",
					"Capture the Relic (%(min)s minutes)",
					relicDuration
				),
				{ "min": relicDuration });
		}

		titles.push({
			"label": title,
			"value": victoryCondition.Description
		});

		if (isCaptureTheRelic)
			titles.push({
				"label": translate("Relic Count"),
				"value": Math.round(g_GameAttributes.settings.RelicCount)
			});

		if (victoryCondition.Name == "regicide")
			if (g_GameAttributes.settings.RegicideGarrison)
				titles.push({
					"label": translate("Hero Garrison"),
					"value": translate("Heroes can be garrisoned.")
				});
			else
				titles.push({
					"label": translate("Exposed Heroes"),
					"value": translate("Heroes cannot be garrisoned and they are vulnerable to raids.")
				});
	}

	if (g_GameAttributes.settings.RatingEnabled &&
	    g_GameAttributes.settings.PlayerData.length == 2)
		titles.push({
			"label": translate("Rated game"),
			"value": translate("When the winner of this match is determined, the lobby score will be adapted.")
		});

	if (g_GameAttributes.settings.LockTeams)
		titles.push({
			"label": translate("Locked Teams"),
			"value": translate("Players can't change the initial teams.")
		});
	else
		titles.push({
			"label": translate("Diplomacy"),
			"value": translate("Players can make alliances and declare war on allies.")
		});

	if (g_GameAttributes.settings.LastManStanding)
		titles.push({
			"label": translate("Last Man Standing"),
			"value": translate("Only one player can win the game. If the remaining players are allies, the game continues until only one remains.")
		});
	else
		titles.push({
			"label": translate("Allied Victory"),
			"value": translate("If one player wins, his or her allies win too. If one group of allies remains, they win.")
		});

	let ceasefire = Math.round(g_GameAttributes.settings.Ceasefire);
	titles.push({
		"label": translate("Ceasefire"),
		"value":
			ceasefire == 0 ?
				translate("disabled") :
				sprintf(translatePlural(
					"For the first minute, other players will stay neutral.",
					"For the first %(min)s minutes, other players will stay neutral.",
					ceasefire),
				{ "min": ceasefire })
	});

	if (g_GameAttributes.map == "random")
		titles.push({
			"label": translateWithContext("Map Selection", "Random Map"),
			"value": translate("Randomly select a map from the list.")
		});
	else
	{
		titles.push({
			"label": translate("Map Name"),
			"value": mapCache.translateMapName(
				mapCache.getTranslatableMapName(g_GameAttributes.mapType, g_GameAttributes.map, g_GameAttributes))
		});

		titles.push({
			"label": translate("Map Description"),
			"value": mapCache.getTranslatedMapDescription(g_GameAttributes.mapType, g_GameAttributes.map)
		});
	}

	titles.push({
		"label": translate("Map Type"),
		"value": g_MapTypes.Title[g_MapTypes.Name.indexOf(g_GameAttributes.mapType)]
	});

	if (g_GameAttributes.mapType == "random")
	{
		let mapSize = g_MapSizes.Name[g_MapSizes.Tiles.indexOf(g_GameAttributes.settings.Size)];
		if (mapSize)
			titles.push({
				"label": translate("Map Size"),
				"value": mapSize
			});
	}

	if (g_GameAttributes.settings.Biome)
	{
		let biome = g_Settings.Biomes.find(b => b.Id == g_GameAttributes.settings.Biome);
		titles.push({
			"label": biome ? biome.Title : translateWithContext("biome", "Random Biome"),
			"value": biome ? biome.Description : translate("Randomly select a biome from the list.")
		});
	}

	if (g_GameAttributes.settings.TriggerDifficulty !== undefined)
	{
		let triggerDifficulty = g_Settings.TriggerDifficulties.find(difficulty => difficulty.Difficulty == g_GameAttributes.settings.TriggerDifficulty);
		titles.push({
			"label": triggerDifficulty.Title,
			"value": triggerDifficulty.Tooltip
		});
	}

	if (g_GameAttributes.settings.Nomad !== undefined)
		titles.push({
			"label": g_GameAttributes.settings.Nomad ? translate("Nomad Mode") : translate("Civic Centers"),
			"value":
				g_GameAttributes.settings.Nomad ?
					translate("Players start with only few units and have to find a suitable place to build their city.") :
					translate("Players start with a Civic Center.")
		});

	if (g_GameAttributes.settings.StartingResources !== undefined)
		titles.push({
			"label": translate("Starting Resources"),
			"value":
				g_GameAttributes.settings.PlayerData &&
				g_GameAttributes.settings.PlayerData.some(pData => pData && pData.Resources !== undefined) ?
					translateWithContext("starting resources", "Per Player") :
					sprintf(translate("%(startingResourcesTitle)s (%(amount)s)"), {
						"startingResourcesTitle":
							g_StartingResources.Title[
								g_StartingResources.Resources.indexOf(
									g_GameAttributes.settings.StartingResources)],
						"amount": g_GameAttributes.settings.StartingResources
					})
		});

	if (g_GameAttributes.settings.PopulationCap !== undefined)
		titles.push({
			"label": translate("Population Limit"),
			"value":
				g_GameAttributes.settings.PlayerData &&
				g_GameAttributes.settings.PlayerData.some(pData => pData && pData.PopulationLimit !== undefined) ?
					translateWithContext("population limit", "Per Player") :
					g_PopulationCapacities.Title[
						g_PopulationCapacities.Population.indexOf(
							g_GameAttributes.settings.PopulationCap)]
		});

	titles.push({
		"label": translate("Treasures"),
		"value": g_GameAttributes.settings.DisableTreasures ?
			translateWithContext("treasures", "Disabled") :
			translateWithContext("treasures", "As defined by the map.")
	});

	titles.push({
		"label": translate("Revealed Map"),
		"value": g_GameAttributes.settings.RevealMap
	});

	titles.push({
		"label": translate("Explored Map"),
		"value": g_GameAttributes.settings.ExploreMap
	});

	titles.push({
		"label": translate("Cheats"),
		"value": g_GameAttributes.settings.CheatsEnabled
	});

	return titles
}

function modDescriptions(mapCache, titles) {
	titles.push({
		"label": translate("Allied Map"),
		"value": g_GameAttributes.settings.AllyMap
	});
    return titles;
}

function getGameDescription(mapCache) {
	let titles = getGameDescriptionList(mapCache);
    titles = modDescriptions(mapCache, titles);
	return titles.map(title => sprintf(translate("%(label)s %(details)s"), {
		"label": coloredText(title.label, g_DescriptionHighlight),
		"details":
			title.value === true ? translateWithContext("gamesetup option", "enabled") :
				title.value || translateWithContext("gamesetup option", "disabled")
	})).join("\n");
}

