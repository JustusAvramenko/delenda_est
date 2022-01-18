UnitAI.prototype.GetQueryRange = function(iid)
{
	let ret = { "min": 0, "max": 0 };

	let cmpVision = Engine.QueryInterface(this.entity, IID_Vision);
	if (!cmpVision)
		return ret;
	let visionRange = cmpVision.GetRange();

	if (iid === IID_Vision)
	{
		ret.max = visionRange;
		return ret;
	}

	if (this.GetStance().respondStandGround)
	{
		let range = this.GetRange(iid);
		if (!range)
			return ret;
		ret.min = range.min;
		ret.max = Math.min(range.max, visionRange);
	}
	else if (this.GetStance().respondChase)
		ret.max = visionRange * 0.85; // << This has changed. Stops units from berserking after any enemy unit in vision range.
	else if (this.GetStance().respondHoldGround)
	{
		let range = this.GetRange(iid);
		if (!range)
			return ret;
		ret.max = Math.min(range.max + visionRange / 2, visionRange);
	}
	// We probably have stance 'passive' and we wouldn't have a range,
	// but as it is the default for healers we need to set it to something sane.
	else if (iid === IID_Heal)
		ret.max = visionRange;

	return ret;
};

UnitAI.prototype.AttackEntitiesByPreference = function(ents)
{
	if (!ents.length)
		return false;

	let cmpAttack = Engine.QueryInterface(this.entity, IID_Attack);
	if (!cmpAttack)
		return false;

	let attackfilter = function(e) {
		if (!cmpAttack.CanAttack(e))
			return false;

		let cmpOwnership = Engine.QueryInterface(e, IID_Ownership);
		if (cmpOwnership && cmpOwnership.GetOwner() > 0)
			return true;

		let cmpUnitAI = Engine.QueryInterface(e, IID_UnitAI);
		return cmpUnitAI && (!cmpUnitAI.IsAnimal()); // << This has changed. Stops units from auto-attacking animals, such as lions.
	};

	let entsByPreferences = {};
	let preferences = [];
	let entsWithoutPref = [];
	for (let ent of ents)
	{
		if (!attackfilter(ent))
			continue;
		let pref = cmpAttack.GetPreference(ent);
		if (pref === null || pref === undefined)
			entsWithoutPref.push(ent);
		else if (!entsByPreferences[pref])
		{
			preferences.push(pref);
			entsByPreferences[pref] = [ent];
		}
		else
			entsByPreferences[pref].push(ent);
	}

	if (preferences.length)
	{
		preferences.sort((a, b) => a - b);
		for (let pref of preferences)
			if (this.RespondToTargetedEntities(entsByPreferences[pref]))
				return true;
	}

	return this.RespondToTargetedEntities(entsWithoutPref);
};
