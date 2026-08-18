UnitAI.prototype.OnAttacked = function(msg)
{
	if (msg.fromStatusEffect)
		return;
	//<<<<<<<< Added to make nearby friendly units mob an attacking animal within 40 meters. 
	const cmpUnitAI = Engine.QueryInterface(msg.attacker, IID_UnitAI);
	if (cmpUnitAI && cmpUnitAI.IsDangerousAnimal())
		this.CallPlayerOwnedEntitiesFunctionInRange("RespondToTargetedEntities", [[msg.attacker], true], 40);
    //<<<<<<<<
	this.UnitFsm.ProcessMessage(this, { "type": "Attacked", "data": msg });
};

UnitAI.prototype.GetQueryRange = function(iid)
{
	const ret = { "min": 0, "max": 0, "base": 0, "parabolic": false };

	const cmpVision = Engine.QueryInterface(this.entity, IID_Vision);
	if (!cmpVision)
		return ret;
	const visionRange = cmpVision.GetRange();

	if (iid === IID_Vision)
	{
		ret.max = visionRange;
		return ret;
	}

	const range = this.GetRange(iid);
	if (!range)
		return ret;

	// The query range depends on stance because it represents the distance at which
	// the unit should "notice" an enemy and potentially start moving toward it.

	// In all stances, always spot targets within effective attack/heal range.
	Object.assign(ret, range);

	let nonParabolicMax = 0;
	if (this.GetStance().respondChase)
		// Chase: Always spot targets within vision range, so we can chase them.
		nonParabolicMax = visionRange * 0.85; // <<<<<<<< This has changed. Stops units from berserking after any enemy unit in vision range.
	else if (this.GetStance().respondHoldGround)
		// HoldGround: willing to move a bit, so spot targets within attack range + half vision.
		nonParabolicMax = Math.min(range.max + visionRange / 2, visionRange);

	// StandGround: nonParabolicMax stays 0, using only parabolic range.

	// We probably have stance 'passive' and we wouldn't have a range,
	// but as it is the default for healers we need to set it to something sane.
	else if (iid === IID_Heal)
		nonParabolicMax = visionRange;

	if (ret.parabolic)
		ret.base = nonParabolicMax;
	else
		ret.max = nonParabolicMax;

	return ret;
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
		return cmpUnitAI && !cmpUnitAI.IsAnimal(); // <<<<<<<< This has changed. Stops units from auto-attacking animals.
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