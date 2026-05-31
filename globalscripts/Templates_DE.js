/**
 * Loads files for random civ selection.
 *
 */
function loadRandomCivFiles()
{
	let randomGroups = [];

	for (let filename of Engine.ListDirectoryFiles("simulation/data/settings/random_groups/", "*.json", false))
	{
		let data = Engine.ReadJSONFile(filename);

		randomGroups.push(data);
	}// end for let filename

	return randomGroups;
}// end loadCivFiles


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

function GetTemplateDataHelper(template, player, auraTemplates, resources, modifiers = {})
{
	// Return data either from template (in tech tree) or sim state (ingame).
	// @param {string} value_path - Route to the value within the template.
	// @param {string} mod_key - Modification key, if not the same as the value_path.
	// @param {number} default_value - A value to use if one is not specified in the template.
	const getEntityValue = function(value_path, mod_key, default_value = 0)
	{
		return GetModifiedTemplateDataValue(template, value_path, mod_key, player, modifiers, default_value);
	};

	const ret = {};

	if (template.Resistance)
	{
		// Don't show Foundation resistance.
		ret.resistance = {};
		if (template.Resistance.Entity)
		{
			if (template.Resistance.Entity.Damage)
			{
				ret.resistance.Damage = {};
				for (const damageType in template.Resistance.Entity.Damage)
					ret.resistance.Damage[damageType] = getEntityValue("Resistance/Entity/Damage/" + damageType);
			}
			if (template.Resistance.Entity.Capture)
				ret.resistance.Capture = getEntityValue("Resistance/Entity/Capture");
			if (template.Resistance.Entity.ApplyStatus)
			{
				ret.resistance.ApplyStatus = {};
				for (const statusEffect in template.Resistance.Entity.ApplyStatus)
					ret.resistance.ApplyStatus[statusEffect] = {
						"blockChance": getEntityValue("Resistance/Entity/ApplyStatus/" + statusEffect + "/BlockChance"),
						"duration": getEntityValue("Resistance/Entity/ApplyStatus/" + statusEffect + "/Duration")
					};
			}
		}
	}

	const getAttackEffects = (temp, path) =>
	{
		const effects = {};
		if (temp.Capture)
			effects.Capture = getEntityValue(path + "/Capture");

		if (temp.Damage)
		{
			effects.Damage = {};
			for (const damageType in temp.Damage)
				effects.Damage[damageType] = getEntityValue(path + "/Damage/" + damageType);
		}

		if (temp.ApplyStatus)
			effects.ApplyStatus = temp.ApplyStatus;

		return effects;
	};

	if (template.Attack)
	{
		ret.attack = {};
		for (const type in template.Attack)
		{
			const getAttackStat = function(stat)
			{
				return getEntityValue("Attack/" + type + "/" + stat);
			};

			ret.attack[type] = {
				"attackName": {
					"name": template.Attack[type].AttackName._string || template.Attack[type].AttackName,
					"context": template.Attack[type].AttackName["@context"]
				},
				"minRange": getAttackStat("MinRange"),
				"maxRange": getAttackStat("MaxRange"),
				"yOrigin": getAttackStat("Origin/Y")
			};

			ret.attack[type].elevationAdaptedRange = Math.sqrt(ret.attack[type].maxRange *
				(2 * ret.attack[type].yOrigin + ret.attack[type].maxRange));

			ret.attack[type].repeatTime = getAttackStat("RepeatTime");
			if (template.Attack[type].Projectile)
				ret.attack[type].projectileCount = template.Attack[type].Projectile.Count ?
					+template.Attack[type].Projectile.Count : 1;
			if (template.Attack[type].Projectile)
				ret.attack[type].friendlyFire = template.Attack[type].Projectile.FriendlyFire == "true";

			Object.assign(ret.attack[type], getAttackEffects(template.Attack[type], "Attack/" + type));

			if (template.Attack[type].Splash)
			{
				ret.attack[type].splash = {
					"friendlyFire": template.Attack[type].Splash.FriendlyFire != "false",
					"shape": template.Attack[type].Splash.Shape,
				};
				Object.assign(ret.attack[type].splash, getAttackEffects(template.Attack[type].Splash, "Attack/" + type + "/Splash"));
			}
		}
	}

	if (template.DeathDamage)
	{
		ret.deathDamage = {
			"friendlyFire": template.DeathDamage.FriendlyFire != "false",
		};

		Object.assign(ret.deathDamage, getAttackEffects(template.DeathDamage, "DeathDamage"));
	}

	if (template.Auras && auraTemplates)
	{
		ret.auras = {};
		for (const auraID of template.Auras._string.split(/\s+/))
			ret.auras[auraID] = GetAuraDataHelper(auraTemplates[auraID]);
	}

	if (template.BuildingAI)
		ret.buildingAI = {
			"defaultArrowCount": Math.round(getEntityValue("BuildingAI/DefaultArrowCount")),
			"garrisonArrowMultiplier": getEntityValue("BuildingAI/GarrisonArrowMultiplier"),
			"maxArrowCount": Math.round(getEntityValue("BuildingAI/MaxArrowCount"))
		};

	if (template.BuildRestrictions)
	{
		// required properties
		ret.buildRestrictions = {
			"placementType": template.BuildRestrictions.PlacementType,
			"territory": template.BuildRestrictions.Territory,
			"category": template.BuildRestrictions.Category,
		};

		// optional properties
		if (template.BuildRestrictions.Distance)
		{
			ret.buildRestrictions.distance = {
				"fromClass": template.BuildRestrictions.Distance.FromClass,
			};

			if (template.BuildRestrictions.Distance.MinDistance)
				ret.buildRestrictions.distance.min = getEntityValue("BuildRestrictions/Distance/MinDistance");

			if (template.BuildRestrictions.Distance.MaxDistance)
				ret.buildRestrictions.distance.max = getEntityValue("BuildRestrictions/Distance/MaxDistance");
		}
	}

	if (template.TrainingRestrictions)
	{
		ret.trainingRestrictions = {
			"category": template.TrainingRestrictions.Category
		};
		if (template.TrainingRestrictions.MatchLimit)
			ret.trainingRestrictions.matchLimit = +template.TrainingRestrictions.MatchLimit;
	}

	if (template.Cost)
	{
		ret.cost = {};
		for (const resCode in template.Cost.Resources)
			ret.cost[resCode] = getEntityValue("Cost/Resources/" + resCode);

		if (template.Cost.Population)
			ret.cost.population = getEntityValue("Cost/Population");

		if (template.Cost.BuildTime)
			ret.cost.time = getEntityValue("Cost/BuildTime");
	}

	if (template.Footprint)
	{
		ret.footprint = { "height": template.Footprint.Height };

		if (template.Footprint.Square)
			ret.footprint.square = {
				"width": +template.Footprint.Square["@width"],
				"depth": +template.Footprint.Square["@depth"]
			};
		else if (template.Footprint.Circle)
			ret.footprint.circle = { "radius": +template.Footprint.Circle["@radius"] };
		else
			warn("GetTemplateDataHelper(): Unrecognized Footprint type");
	}

	if (template.Garrisonable)
		ret.garrisonable = {
			"size": getEntityValue("Garrisonable/Size")
		};

	if (template.GarrisonHolder)
	{
		ret.garrisonHolder = {
			"buffHeal": getEntityValue("GarrisonHolder/BuffHeal")
		};

		if (template.GarrisonHolder.Max)
			ret.garrisonHolder.capacity = getEntityValue("GarrisonHolder/Max");
	}

	if (template.Heal)
		ret.heal = {
			"health": getEntityValue("Heal/Health"),
			"range": getEntityValue("Heal/Range"),
			"interval": getEntityValue("Heal/Interval")
		};

	if (template.ResourceGatherer)
	{
		ret.resourceGatherRates = {};
		const baseSpeed = getEntityValue("ResourceGatherer/BaseSpeed");
		for (const type in template.ResourceGatherer.Rates)
			ret.resourceGatherRates[type] = getEntityValue("ResourceGatherer/Rates/"+ type) * baseSpeed;
	}

	if (template.ResourceDropsite)
		ret.resourceDropsite = {
			"types": template.ResourceDropsite.Types.split(" ")
		};

	if (template.ResourceTrickle)
	{
		ret.resourceTrickle = {
			"interval": +template.ResourceTrickle.Interval,
			"rates": {}
		};
		for (const type in template.ResourceTrickle.Rates)
			ret.resourceTrickle.rates[type] = getEntityValue("ResourceTrickle/Rates/" + type);
	}

	if (template.Loot)
	{
		ret.loot = {};
		for (const type in template.Loot)
			ret.loot[type] = getEntityValue("Loot/"+ type);
	}

	if (template.Obstruction)
	{
		ret.obstruction = {
			"active": ("" + template.Obstruction.Active == "true"),
			"blockMovement": ("" + template.Obstruction.BlockMovement == "true"),
			"blockPathfinding": ("" + template.Obstruction.BlockPathfinding == "true"),
			"blockFoundation": ("" + template.Obstruction.BlockFoundation == "true"),
			"blockConstruction": ("" + template.Obstruction.BlockConstruction == "true"),
			"disableBlockMovement": ("" + template.Obstruction.DisableBlockMovement == "true"),
			"disableBlockPathfinding": ("" + template.Obstruction.DisableBlockPathfinding == "true"),
			"shape": {}
		};

		if (template.Obstruction.Static)
		{
			ret.obstruction.shape.type = "static";
			ret.obstruction.shape.width = +template.Obstruction.Static["@width"];
			ret.obstruction.shape.depth = +template.Obstruction.Static["@depth"];
		}
		else if (template.Obstruction.Unit)
		{
			ret.obstruction.shape.type = "unit";
			ret.obstruction.shape.radius = +template.Obstruction.Unit["@radius"];
		}
		else
			ret.obstruction.shape.type = "cluster";
	}

	if (template.Pack)
		ret.pack = {
			"state": template.Pack.State,
			"time": getEntityValue("Pack/Time"),
		};

	if (template.Population && template.Population.Bonus)
		ret.population = {
			"bonus": getEntityValue("Population/Bonus")
		};

	if (template.Health)
		ret.health = Math.round(getEntityValue("Health/Max"));

	if (template.Identity)
	{
		ret.selectionGroupName = template.Identity.SelectionGroupName;
		ret.name = {
			"specific": (template.Identity.SpecificName || template.Identity.GenericName),
			"generic": template.Identity.GenericName
		};
		ret.icon = template.Identity.Icon;
		ret.tooltip = template.Identity.Tooltip;
		ret.requirements = template.Identity.Requirements;
		ret.visibleIdentityClasses = GetVisibleIdentityClasses(template.Identity);
		ret.nativeCiv = template.Identity.Civ;
	}

	if (template.UnitMotion)
	{
		const walkSpeed = getEntityValue("UnitMotion/WalkSpeed");
		ret.speed = {
			"walk": walkSpeed,
			"run": walkSpeed,
			"acceleration": getEntityValue("UnitMotion/Acceleration")
		};
		if (template.UnitMotion.RunMultiplier)
			ret.speed.run *= getEntityValue("UnitMotion/RunMultiplier");
	}

	if (template.Upgrade)
	{
		ret.upgrades = [];
		for (const upgradeName in template.Upgrade)
		{
			const upgrade = template.Upgrade[upgradeName];

			const cost = {};
			if (upgrade.Cost)
				for (const res in upgrade.Cost)
					cost[res] = getEntityValue("Upgrade/" + upgradeName + "/Cost/" + res, "Upgrade/Cost/" + res);
			if (upgrade.Time)
				cost.time = getEntityValue("Upgrade/" + upgradeName + "/Time", "Upgrade/Time");

			ret.upgrades.push({
				"entity": upgrade.Entity,
				"tooltip": upgrade.Tooltip,
				"cost": cost,
				"icon": upgrade.Icon,
				"requirements": upgrade.Requirements
			});
		}
	}

	if (template.Researcher)
	{
		ret.techCostMultiplier = {};
		for (const res of resources.GetCodes().concat(["time"]))
			ret.techCostMultiplier[res] = getEntityValue("Researcher/TechCostMultiplier/" + res, null, 1);
	}

	if (template.Trader)
		ret.trader = {
			"GainMultiplier": getEntityValue("Trader/GainMultiplier")
		};

	if (template.Treasure)
	{
		ret.treasure = {
			"collectTime": getEntityValue("Treasure/CollectTime"),
			"resources": {}
		};
		for (const resource in template.Treasure.Resources)
			ret.treasure.resources[resource] = getEntityValue("Treasure/Resources/" + resource);
	}

	if (template.TurretHolder)
		ret.turretHolder = {
			"turretPoints": template.TurretHolder.TurretPoints
		};

	if (template.Upkeep)
	{
		ret.upkeep = {
			"interval": +template.Upkeep.Interval,
			"rates": {}
		};
		for (const type in template.Upkeep.Rates)
			ret.upkeep.rates[type] = getEntityValue("Upkeep/Rates/" + type);
	}

	if (template.WallSet)
	{
		ret.wallSet = {
			"templates": {
				"tower": template.WallSet.Templates.Tower,
				"gate": template.WallSet.Templates.Gate,
				"fort": template.WallSet.Templates.Fort || "structures/" + template.Identity.Civ + "/fortress",
				"long": template.WallSet.Templates.WallLong,
				"medium": template.WallSet.Templates.WallMedium,
				"short": template.WallSet.Templates.WallShort
			},
			"maxTowerOverlap": +template.WallSet.MaxTowerOverlap,
			"minTowerOverlap": +template.WallSet.MinTowerOverlap
		};
		if (template.WallSet.Templates.WallEnd)
			ret.wallSet.templates.end = template.WallSet.Templates.WallEnd;
		if (template.WallSet.Templates.WallCurves)
			ret.wallSet.templates.curves = template.WallSet.Templates.WallCurves.split(/\s+/);
	}

	if (template.WallPiece)
		ret.wallPiece = {
			"length": +template.WallPiece.Length,
			"angle": +(template.WallPiece.Orientation || 1) * Math.PI,
			"indent": +(template.WallPiece.Indent || 0),
			"bend": +(template.WallPiece.Bend || 0) * Math.PI
		};

	return ret;
}
