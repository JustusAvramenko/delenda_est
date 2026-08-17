import { SquareVectorDistance, aiWarn } from "simulation/ai/common-api/utils.js";

/** returns true if this unit should be considered as a siege unit */
export function isSiegeUnit(ent)
{
	return ent.hasClasses(["Siege", "Elephant+Melee"]);
}

/** returns true if this unit should be considered as "fast". */
export function isFastMoving(ent)
{
	// TODO: use clever logic based on walkspeed comparisons.
	return ent.hasClass("FastMoving");
}

/** returns some sort of DPS * health factor. If you specify a class, it'll use the modifiers against that class too. */
export function getMaxStrength(ent, debugLevel, DamageTypeImportance, againstClass)
{
	let strength = 0;
	const attackTypes = ent.attackTypes();
	const damageTypes = Object.keys(DamageTypeImportance);
	if (!attackTypes)
		return strength;

	for (const type of attackTypes)
	{
		if (type == "Slaughter")
			continue;

		const attackStrength = ent.attackStrengths(type);
		for (const str in attackStrength)
		{
			let val = parseFloat(attackStrength[str]);
			if (againstClass)
				val *= ent.getMultiplierAgainst(type, againstClass);
			if (DamageTypeImportance[str])
				strength += DamageTypeImportance[str] * val / damageTypes.length;
			else if (debugLevel > 0)
			{
				aiWarn("Nike: " + str + " unknown attackStrength in getMaxStrength (please add " +
					str + "  to config.js).");
			}
		}

		const attackRange = ent.attackRange(type);
		if (attackRange)
			strength += attackRange.max * 0.0125;

		const attackTimes = ent.attackTimes(type);
		for (const str in attackTimes)
		{
			const val = parseFloat(attackTimes[str]);
			switch (str)
			{
			case "repeat":
				strength += val / 100000;
				break;
			case "prepare":
				strength -= val / 100000;
				break;
			default:
				aiWarn("Nike: " + str + " unknown attackTimes in getMaxStrength");
			}
		}
	}

	const resistanceStrength = ent.resistanceStrengths();

	if (resistanceStrength.Damage)
		for (const str in resistanceStrength.Damage)
		{
			const val = +resistanceStrength.Damage[str];
			if (DamageTypeImportance[str])
				strength += DamageTypeImportance[str] * val / damageTypes.length;
			else if (debugLevel > 0)
				aiWarn("Nike: " + str + " unknown resistanceStrength in getMaxStrength " +
					"(please add " + str + "  to config.js).");
		}

	// ToDo: Add support for StatusEffects and Capture.

	return strength * ent.maxHitpoints() / 100.0;
}

/** Get access and cache it (except for units as it can change) in metadata if not already done */
export function getLandAccess(gameState, ent)
{
	if (ent.hasClass("Unit"))
	{
		const pos = ent.position();
		if (!pos)
		{
			const holder = getHolder(gameState, ent);
			if (holder)
				return getLandAccess(gameState, holder);

			aiWarn("Nike error: entity without position, but not garrisoned");
			dumpEntity(ent);
			return undefined;
		}
		return gameState.ai.accessibility.getAccessValue(pos);
	}

	let access = ent.getMetadata(PlayerID, "access");
	if (!access)
	{
		access = gameState.ai.accessibility.getAccessValue(ent.position());
		// Docks are sometimes not as expected
		if (access < 2 && ent.buildPlacementType() == "shore")
		{
			let halfDepth = 0;
			if (ent.get("Footprint/Square"))
				halfDepth = +ent.get("Footprint/Square/@depth") / 2;
			else if (ent.get("Footprint/Circle"))
				halfDepth = +ent.get("Footprint/Circle/@radius");
			const entPos = ent.position();
			const cosa = Math.cos(ent.angle());
			const sina = Math.sin(ent.angle());
			for (let d = 3; d < halfDepth; d += 3)
			{
				const pos = [ entPos[0] - d * sina,
					entPos[1] - d * cosa];
				access = gameState.ai.accessibility.getAccessValue(pos);
				if (access > 1)
					break;
			}
		}
		ent.setMetadata(PlayerID, "access", access);
	}
	return access;
}

/** Sea access always cached as it never changes */
export function getSeaAccess(gameState, ent)
{
	let sea = ent.getMetadata(PlayerID, "sea");
	if (!sea)
	{
		sea = gameState.ai.accessibility.getAccessValue(ent.position(), true);
		// Docks are sometimes not as expected
		if (sea < 2 && ent.buildPlacementType() == "shore")
		{
			const entPos = ent.position();
			const cosa = Math.cos(ent.angle());
			const sina = Math.sin(ent.angle());
			for (let d = 3; d < 15; d += 3)
			{
				const pos = [ entPos[0] + d * sina,
					entPos[1] + d * cosa];
				sea = gameState.ai.accessibility.getAccessValue(pos, true);
				if (sea > 1)
					break;
			}
		}
		ent.setMetadata(PlayerID, "sea", sea);
	}
	return sea;
}

export function setSeaAccess(gameState, ent)
{
	getSeaAccess(gameState, ent);
}

/** Decide if we should try to capture (returns true) or destroy (return false) */
export function allowCapture(gameState, ent, target)
{
	if (!target.isCapturable() || !ent.canCapture(target))
		return false;
	if (target.isInvulnerable())
		return true;
	// always try to recapture capture points from an allied, except if it's decaying
	if (gameState.isPlayerAlly(target.owner()))
		return !target.decaying();

	let antiCapture = target.defaultRegenRate();
	if (target.isGarrisonHolder())
	{
		const garrisonRegenRate = target.garrisonRegenRate();
		for (const garrisonedEntity of target.garrisoned())
			antiCapture += garrisonRegenRate * (gameState.getEntityById(garrisonedEntity)?.captureStrength() || 0);
	}

	if (target.decaying())
		antiCapture -= target.territoryDecayRate();

	let capture;
	const capturableTargets = gameState.ai.HQ.capturableTargets;
	if (!capturableTargets.has(target.id()))
	{
		capture = ent.captureStrength() * getAttackBonus(ent, target, "Capture");
		capturableTargets.set(target.id(), { "strength": capture, "ents": new Set([ent.id()]) });
	}
	else
	{
		const capturable = capturableTargets.get(target.id());
		if (!capturable.ents.has(ent.id()))
		{
			capturable.strength += ent.captureStrength() * getAttackBonus(ent, target, "Capture");
			capturable.ents.add(ent.id());
		}
		capture = capturable.strength;
	}
	capture *= 1 / (0.1 + 0.9*target.healthLevel());
	const sumCapturePoints = target.capturePoints().reduce((a, b) => a + b);
	if (target.hasDefensiveFire() && target.isGarrisonHolder() && target.garrisoned())
		return capture > antiCapture + sumCapturePoints/50;
	return capture > antiCapture + sumCapturePoints/80;
}

export function getAttackBonus(ent, target, type)
{
	let attackBonus = 1;
	if (!ent.get("Attack/" + type) || !ent.get("Attack/" + type + "/Bonuses"))
		return attackBonus;
	const bonuses = ent.get("Attack/" + type + "/Bonuses");
	for (const key in bonuses)
	{
		const bonus = bonuses[key];
		if (bonus.Civ && bonus.Civ !== target.civ())
			continue;
		if (!bonus.Classes || target.hasClasses(bonus.Classes))
			attackBonus *= bonus.Multiplier;
	}
	return attackBonus;
}

/** Makes the worker deposit the currently carried resources at the closest accessible dropsite */
export function returnResources(gameState, ent)
{
	if (!ent.resourceCarrying() || !ent.resourceCarrying().length || !ent.position())
		return false;

	const resource = ent.resourceCarrying()[0].type;

	let closestDropsite;
	let distmin = Math.min();
	const access = getLandAccess(gameState, ent);
	const dropsiteCollection = gameState.playerData.hasSharedDropsites ?
		gameState.getAnyDropsites(resource) : gameState.getOwnDropsites(resource);
	for (const dropsite of dropsiteCollection.values())
	{
		if (!dropsite.position())
			continue;
		const owner = dropsite.owner();
		// owner !== PlayerID can only happen when hasSharedDropsites === true, so no need to test it again
		if (owner !== PlayerID && (!dropsite.isSharedDropsite() || !gameState.isPlayerMutualAlly(owner)))
			continue;
		if (getLandAccess(gameState, dropsite) != access)
			continue;
		const dist = SquareVectorDistance(ent.position(), dropsite.position());
		if (dist > distmin)
			continue;
		distmin = dist;
		closestDropsite = dropsite;
	}

	if (!closestDropsite)
		return false;
	ent.returnResources(closestDropsite);
	return true;
}

/** is supply full taking into account gatherers affected during this turn */
export function isSupplyFull(gameState, ent)
{
	return ent.isFull() === true ||
		ent.resourceSupplyNumGatherers() + gameState.ai.HQ.basesManager.GetTCGatherer(ent.id()) >= ent.maxGatherers();
}

/**
 * Get the best base (in terms of distance and accessIndex) for an entity.
 * It should be on the same accessIndex for structures.
 * If nothing found, return the noBase for units and undefined for structures.
 * If exclude is given, we exclude the base with ID = exclude.
 */
export function getBestBase(gameState, ent, onlyConstructedBase = false, exclude = false)
{
	let pos = ent.position();
	let accessIndex;
	if (!pos)
	{
		const holder = getHolder(gameState, ent);
		if (!holder || !holder.position())
		{
			aiWarn("Nike error: entity without position, but not garrisoned");
			dumpEntity(ent);
			return gameState.ai.HQ.basesManager.baselessBase();
		}
		pos = holder.position();
		accessIndex = getLandAccess(gameState, holder);
	}
	else
		accessIndex = getLandAccess(gameState, ent);

	let distmin = Math.min();
	let dist;
	let bestbase;
	for (const base of gameState.ai.HQ.baseManagers())
	{
		if (base.ID == gameState.ai.HQ.basesManager.baselessBase().ID || exclude && base.ID == exclude)
			continue;
		if (onlyConstructedBase && (!base.anchor || base.anchor.foundationProgress() !== undefined))
			continue;
		if (ent.hasClass("Structure") && base.accessIndex != accessIndex)
			continue;
		if (base.anchor && base.anchor.position())
			dist = SquareVectorDistance(base.anchor.position(), pos);
		else
		{
			let found = false;
			for (const structure of base.buildings.values())
			{
				if (!structure.position())
					continue;
				dist = SquareVectorDistance(structure.position(), pos);
				found = true;
				break;
			}
			if (!found)
				continue;
		}
		if (base.accessIndex != accessIndex)
			dist += 50000000;
		if (!base.anchor)
			dist += 50000000;
		if (dist > distmin)
			continue;
		distmin = dist;
		bestbase = base;
	}
	if (!bestbase && !ent.hasClass("Structure"))
		bestbase = gameState.ai.HQ.basesManager.baselessBase();
	return bestbase;
}

export function getHolder(gameState, ent)
{
	for (const holder of gameState.getEntities().values())
	{
		if (holder.isGarrisonHolder() && holder.garrisoned().indexOf(ent.id()) !== -1)
			return holder;
	}
	return undefined;
}

/** return the template of the built foundation if a foundation, otherwise return the entity itself */
export function getBuiltEntity(gameState, ent)
{
	if (ent.foundationProgress() !== undefined)
		return gameState.getBuiltTemplate(ent.templateName());

	return ent;
}

/**
 * return true if it is not worth finishing this building (it would surely decay)
 * TODO implement the other conditions
 */
export function isNotWorthBuilding(gameState, ent)
{
	if (gameState.ai.HQ.territoryMap.getOwner(ent.position()) !== PlayerID)
	{
		const buildTerritories = ent.buildTerritories();
		if (buildTerritories && (!buildTerritories.length || buildTerritories.length === 1 && buildTerritories[0] === "own"))
			return true;
	}
	return false;
}

/**
 * Check if the straight line between the two positions crosses an enemy territory
 */
export function isLineInsideEnemyTerritory(gameState, pos1, pos2, step=70)
{
	const n = Math.floor(Math.sqrt(SquareVectorDistance(pos1, pos2))/step) + 1;
	const stepx = (pos2[0] - pos1[0]) / n;
	const stepy = (pos2[1] - pos1[1]) / n;
	for (let i = 1; i < n; ++i)
	{
		const pos = [pos1[0]+i*stepx, pos1[1]+i*stepy];
		const owner = gameState.ai.HQ.territoryMap.getOwner(pos);
		if (owner && gameState.isPlayerEnemy(owner))
			return true;
	}
	return false;
}

export function gatherTreasure(gameState, ent, water = false)
{
	if (!gameState.ai.HQ.treasures.hasEntities())
		return false;
	if (!ent || !ent.position())
		return false;
	if (!ent.isTreasureCollector())
		return false;
	let treasureFound;
	let distmin = Math.min();
	const access = water ? getSeaAccess(gameState, ent) : getLandAccess(gameState, ent);
	for (const treasure of gameState.ai.HQ.treasures.values())
	{
		// let some time for the previous gatherer to reach the treasure before trying again
		const lastGathered = treasure.getMetadata(PlayerID, "lastGathered");
		if (lastGathered && gameState.ai.elapsedTime - lastGathered < 20)
			continue;
		if (!water && access != getLandAccess(gameState, treasure))
			continue;
		if (water && access != getSeaAccess(gameState, treasure))
			continue;
		const territoryOwner = gameState.ai.HQ.territoryMap.getOwner(treasure.position());
		if (territoryOwner != 0 && !gameState.isPlayerAlly(territoryOwner))
			continue;
		const dist = SquareVectorDistance(ent.position(), treasure.position());
		if (dist > 120000 || territoryOwner != PlayerID && dist > 14000) // AI has no LOS, so restrict it a bit
			continue;
		if (dist > distmin)
			continue;
		distmin = dist;
		treasureFound = treasure;
	}
	if (!treasureFound)
		return false;
	treasureFound.setMetadata(PlayerID, "lastGathered", gameState.ai.elapsedTime);
	ent.collectTreasure(treasureFound);
	ent.setMetadata(PlayerID, "treasure", treasureFound.id());
	return true;
}

export function dumpEntity(ent)
{
	if (!ent)
		return;
	aiWarn(" >>> id " + ent.id() + " name " + ent.genericName() + " pos " + ent.position() + " state " +
		ent.unitAIState());
	aiWarn(" base " + ent.getMetadata(PlayerID, "base") + " >>> role " +
		ent.getMetadata(PlayerID, "role") + " subrole " + ent.getMetadata(PlayerID, "subrole"));
	aiWarn("owner " + ent.owner() + " health " + ent.hitpoints() + " healthMax " + ent.maxHitpoints() +
		" foundationProgress " + ent.foundationProgress());
	aiWarn(" garrisoning " + ent.getMetadata(PlayerID, "garrisoning") + " garrisonHolder " +
		ent.getMetadata(PlayerID, "garrisonHolder") + " plan " + ent.getMetadata(PlayerID, "plan") +
		" transport " + ent.getMetadata(PlayerID, "transport"));
	aiWarn(" stance " + ent.getStance() + " transporter " + ent.getMetadata(PlayerID, "transporter") +
		" gather-type " + ent.getMetadata(PlayerID, "gather-type") + " target-foundation " +
		ent.getMetadata(PlayerID, "target-foundation") + " PartOfArmy " +
		ent.getMetadata(PlayerID, "PartOfArmy"));
}
