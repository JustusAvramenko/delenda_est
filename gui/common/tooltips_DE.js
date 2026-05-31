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
function attackRateDetails(interval, projectiles, isVolley = false)
{
	if (!interval)
		return "";

	if (projectiles === 0)
		return translate("Garrison to fire arrows");

	// Volley attack (multiple projectiles fired simultaneously)
	if (isVolley && projectiles > 1)
	{
		return sprintf(translate("%(label)s %(time)s, %(projectileLabel)s %(count)s %(unit)s"), {
			"label": headerFont(translate("Interval:")),
			"time": getSecondsString(interval / 1000),
			"projectileLabel": headerFont(translate("Projectiles:")),
			"count": projectiles,
			"unit": unitFont(translate("per attack"))
		});
	}

	// Garrison arrows (multiple projectiles from garrisoned units)
	if (!isVolley && projectiles > 1)
	{
		const projectileString = sprintf(translatePlural("%(projectileCount)s %(projectileName)s", "%(projectileCount)s %(projectileName)s", projectiles), {
			"projectileCount": projectiles,
			"projectileName": unitFont(translatePlural("arrow", "arrows", projectiles))
		});

		const rateString = sprintf(translate("%(projectileString)s / %(time)s"), {
			"projectileString": projectileString,
			"time": getSecondsString(interval / 1000)
		});

		return sprintf(translate("%(label)s %(details)s"), {
			"label": headerFont(translate("Rate:")),
			"details": rateString
		});
	}

	// Single projectile
	return sprintf(translate("%(label)s %(time)s"), {
		"label": headerFont(translate("Interval:")),
		"time": getSecondsString(interval / 1000)
	});
}

function rangeDetails(attackTypeTemplate)
{
	if (!attackTypeTemplate.maxRange)
		return "";

	const rangeTooltipString = {
		"relative": {
			// Translation: For example: Range: 2 to 10 (+2) meters
			"minRange": translate("%(rangeLabel)s %(minRange)s to %(maxRange)s (%(relativeRange)s) %(rangeUnit)s"),
			// Translation: For example: Range: 10 (+2) meters
			"no-minRange": translate("%(rangeLabel)s %(maxRange)s (%(relativeRange)s) %(rangeUnit)s"),
		},
		"non-relative": {
			// Translation: For example: Range: 2 to 10 meters
			"minRange": translate("%(rangeLabel)s %(minRange)s to %(maxRange)s %(rangeUnit)s"),
			// Translation: For example: Range: 10 meters
			"no-minRange": translate("%(rangeLabel)s %(maxRange)s %(rangeUnit)s"),
		}
	};

	const minRange = Math.round(attackTypeTemplate.minRange);
	const maxRange = Math.round(attackTypeTemplate.maxRange);
	const realRange = attackTypeTemplate.elevationAdaptedRange;
	const relativeRange = realRange ? Math.round(realRange - maxRange) : 0;

	return sprintf(rangeTooltipString[relativeRange ? "relative" : "non-relative"][minRange ? "minRange" : "no-minRange"], {
		"rangeLabel": headerFont(translate("Range:")),
		"minRange": minRange,
		"maxRange": maxRange,
		"relativeRange": relativeRange > 0 ? sprintf(translate("+%(number)s"), { "number": relativeRange }) : relativeRange,
		"rangeUnit":
			unitFont(minRange || relativeRange ?
				// Translation: For example "0.5 to 1 meters", "1 (+1) meters" or "1 to 2 (+3) meters"
				translate("meters") :
				translatePlural("meter", "meters", maxRange))
	});
}

function damageDetails(damageTemplate)
{
	if (!damageTemplate)
		return "";

	return g_DamageTypesMetadata.sort(Object.keys(damageTemplate).filter(dmgType => damageTemplate[dmgType])).map(
		dmgType => sprintf(translate("%(damage)s %(damageType)s"), {
			"damage": (+damageTemplate[dmgType]).toFixed(1),
			"damageType": unitFont(translateWithContext("damage type", g_DamageTypesMetadata.getName(dmgType)))
		})).join(commaFont(translate(", ")));
}

function captureDetails(captureTemplate)
{
	if (!captureTemplate)
		return "";

	return sprintf(translate("%(amount)s %(name)s"), {
		"amount": (+captureTemplate).toFixed(1),
		"name": unitFont(translateWithContext("damage type", "Capture"))
	});
}

function splashDetails(splashTemplate)
{
	const splashLabel = sprintf(headerFont(translate("%(splashShape)s Splash")), {
		"splashShape": translate(splashTemplate.shape)
	});
	let splashDamageTooltip = sprintf(translate("%(label)s: %(effects)s"), {
		"label": splashLabel,
		"effects": attackEffectsDetails(splashTemplate)
	});

	if (g_AlwaysDisplayFriendlyFire || splashTemplate.friendlyFire)
		splashDamageTooltip += commaFont(translate(", ")) + sprintf(translate("Friendly Fire: %(enabled)s"), {
			"enabled": splashTemplate.friendlyFire ? translate("Yes") : translate("No")
		});

	return splashDamageTooltip;
}

function applyStatusDetails(applyStatusTemplate)
{
	if (!applyStatusTemplate)
		return "";

	return sprintf(translate("gives %(name)s"), {
		"name": Object.keys(applyStatusTemplate).map(x =>
			unitFont(translateWithContext("status effect", g_StatusEffectsMetadata.getName(x)))
		).join(commaFont(translate(", "))),
	});
}

function attackEffectsDetails(attackTypeTemplate)
{
	if (!attackTypeTemplate)
		return "";

	const effects = [
		captureDetails(attackTypeTemplate.Capture || undefined),
		damageDetails(attackTypeTemplate.Damage || undefined),
		applyStatusDetails(attackTypeTemplate.ApplyStatus || undefined)
	];
	return effects.filter(effect => effect).join(commaFont(translate(", ")));
}

function getAttackTooltip(template)
{
	if (!template.attack)
		return "";

	const tooltips = [];
	for (const attackType in template.attack)
	{
		// Slaughter is used to kill animals, so do not show it.
		if (attackType == "Slaughter")
			continue;

		const attackTypeTemplate = template.attack[attackType];
		const attackLabel = sprintf(headerFont(translate("%(attackType)s")), {
			"attackType": translateWithContext(attackTypeTemplate.attackName.context || "Name of an attack, usually the weapon.", attackTypeTemplate.attackName.name)
		});

		const isVolley = !!(attackTypeTemplate.projectileCount && attackTypeTemplate.projectileCount > 1);

		// Get projectile count - either volley size or garrison arrows
		let projectiles;
		if (isVolley)
			projectiles = attackTypeTemplate.projectileCount;
		else if (template.buildingAI)
			projectiles = template.buildingAI.arrowCount || template.buildingAI.defaultArrowCount;

		const splashTemplate = attackTypeTemplate.splash;

		// Show the effects of status effects below.
		let statusEffectsDetails = [];
		if (attackTypeTemplate.ApplyStatus)
			for (const status in attackTypeTemplate.ApplyStatus)
				statusEffectsDetails.push("\n" + g_Indent + g_Indent + getStatusEffectsTooltip(status, attackTypeTemplate.ApplyStatus[status], true));
		statusEffectsDetails = statusEffectsDetails.join("");

		tooltips.push(sprintf(translate("%(attackLabel)s: %(effects)s, %(range)s, %(rate)s%(statusEffects)s%(splash)s"), {
			"attackLabel": attackLabel,
			"effects": attackEffectsDetails(attackTypeTemplate),
			"range": rangeDetails(attackTypeTemplate),
			"rate": attackRateDetails(attackTypeTemplate.repeatTime, projectiles, isVolley),
			"splash": splashTemplate ? "\n" + g_Indent + g_Indent + splashDetails(splashTemplate) : "",
			"statusEffects": statusEffectsDetails
		}));
	}

	return sprintf(translate("%(label)s\n%(details)s"), {
		"label": headerFont(translate("Attack:")),
		"details": g_Indent + tooltips.join("\n" + g_Indent)
	});
}


/**
 * Fixes icon position in tooltips. Remove once #8920 is committed!
 */

function resourceIcon(resource)
{
	return `[icon="icon_${resource}"]`;
}
