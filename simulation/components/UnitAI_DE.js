UnitAI.prototype.OnAttacked = function(msg)
{
	if (msg.fromStatusEffect)
		return;
	//<<<<<<<< Added in DELENDA EST to make nearby friendly units mob an attacking animal within 30 meters. 
	const cmpUnitAI = Engine.QueryInterface(msg.attacker, IID_UnitAI);
	if (cmpUnitAI && cmpUnitAI.IsDangerousAnimal())
		this.CallPlayerOwnedEntitiesFunctionInRange("RespondToTargetedEntities", [[msg.attacker], true], 30);
    //<<<<<<<<
	this.UnitFsm.ProcessMessage(this, { "type": "Attacked", "data": msg });
};

UnitAI.prototype.GetQueryRange = function(iid)
{
	const cmpVision = Engine.QueryInterface(this.entity, IID_Vision);
	if (!cmpVision)
		return { "min": 0, "max": 0, "base": 0, "parabolic": false };

	const visionRange = cmpVision.GetRange();

	if (iid === IID_Vision)
		return { "min": 0, "max": visionRange, "base": 0, "parabolic": false };

	const range = this.GetRange(iid);
	if (!range)
		return { "min": 0, "max": 0, "base": 0, "parabolic": false };

	// On StandGround, we care only about what we can immediately attack.
	if (this.GetStance().respondStandGround)
		return { "min": range.min, "max": range.max, "base": 0, "parabolic": !!range.parabolic };

	let walkRange = 0;
	if (this.GetStance().respondChase)
		// Chase: Always spot targets within vision range, so we can chase them.
		walkRange = visionRange * 0.85; // <<<<<<<< This has changed in DELENDA EST. Stops units from berserking.
	else if (this.GetStance().respondHoldGround)
		// HoldGround: willing to move a bit, but not to leave the area.
		walkRange = Math.min(range.max + visionRange / 2, visionRange);
	else if (iid === IID_Heal)
		// We probably have stance 'passive' and we wouldn't have a range,
		// but as it is the default for healers we need to set it to something sane.
		walkRange = visionRange;

	// Other stances can move away, so keep the minimum range at 0.
	if (range.parabolic)
		return { "min": 0, "max": range.max, "base": walkRange, "parabolic": true };

	// One radius has to cover both what we can hit and what we would walk to.
	return { "min": 0, "max": Math.max(range.max, walkRange), "base": 0, "parabolic": false };
};

UnitAI.prototype.AttackEntitiesByPreference = function(ents)
{
	if (!ents.length)
		return false;

	const cmpAttack = Engine.QueryInterface(this.entity, IID_Attack);
	if (!cmpAttack)
		return false;

	const attackfilter = function(e)
	{
		if (!cmpAttack.CanAttack(e))
			return false;

		const cmpOwnership = Engine.QueryInterface(e, IID_Ownership);
		if (cmpOwnership && cmpOwnership.GetOwner() > 0)
			return true;

		const cmpUnitAI = Engine.QueryInterface(e, IID_UnitAI);
		return cmpUnitAI && !cmpUnitAI.IsAnimal(); // <<<<<<<< This has changed in DELENDA EST. Stops units from auto-attacking animals.
	};

	const entsByPreferences = {};
	const preferences = [];
	const entsWithoutPref = [];
	for (const ent of ents)
	{
		if (!attackfilter(ent))
			continue;
		const pref = cmpAttack.GetPreference(ent);
		if (pref === 0)
		{
			if (this.RespondToTargetedEntities([ent]))
				return true;
		}
		else if (pref === null || pref === undefined)
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
		for (const pref of preferences)
			if (this.RespondToTargetedEntities(entsByPreferences[pref]))
				return true;
	}

	return this.RespondToTargetedEntities(entsWithoutPref);
};