UnitAI.prototype.OnAttacked = function(msg)
{
	if (msg.fromStatusEffect)
		return;

	const cmpUnitAI = Engine.QueryInterface(msg.attacker, IID_UnitAI);
	if (cmpUnitAI && cmpUnitAI.IsDangerousAnimal())
		this.CallPlayerOwnedEntitiesFunctionInRange("RespondToTargetedEntities", [[msg.attacker], true], 60);

	this.UnitFsm.ProcessMessage(this, { "type": "Attacked", "data": msg });
};

/**
 * Try to respond appropriately given our current stance,
 * given a list of entities that match our stance's target criteria.
 * Returns true if it responded.
 */
UnitAI.prototype.RespondToTargetedEntities = function(ents, dangerousAnimal = false)
{
	if (!ents.length)
		return false;

	if (this.GetStance().respondChase)
		return this.AttackVisibleEntity(ents);

	if (this.GetStance().respondStandGround)
		return this.AttackVisibleEntity(ents);

	if (this.GetStance().respondHoldGround)
		return this.AttackEntityInZone(ents);

	if (this.GetStance().respondFlee)
	{
		if (dangerousAnimal)  // <<<<<<<< This has changed. Makes units respond to attacking animals.
			return this.AttackVisibleEntity(ents);
		if (this.order && this.order.type == "Flee")
			this.orderQueue.shift();
		this.PushOrderFront("Flee", { "target": ents[0], "force": false });
		return true;
	}

	return false;
};

UnitAI.prototype.GetQueryRange = function(iid)
{
	const ret = { "min": 0, "max": 0 };

	const cmpVision = Engine.QueryInterface(this.entity, IID_Vision);
	if (!cmpVision)
		return ret;
	const visionRange = cmpVision.GetRange();

	if (iid === IID_Vision)
	{
		ret.max = visionRange;
		return ret;
	}

	if (this.GetStance().respondStandGround)
	{
		const range = this.GetRange(iid);
		if (!range)
			return ret;
		ret.min = range.min;
		ret.max = Math.min(range.max, visionRange);
	}
	else if (this.GetStance().respondChase)
		ret.max = visionRange * 0.85; // <<<<<<<< This has changed. Stops units from berserking after any enemy unit in vision range.
	else if (this.GetStance().respondHoldGround)
	{
		const range = this.GetRange(iid);
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

	const cmpAttack = Engine.QueryInterface(this.entity, IID_Attack);
	if (!cmpAttack)
		return false;

	const attackfilter = function(e) {
		if (!cmpAttack.CanAttack(e))
			return false;

		const cmpOwnership = Engine.QueryInterface(e, IID_Ownership);
		if (cmpOwnership && cmpOwnership.GetOwner() > 0)
			return true;

		const cmpUnitAI = Engine.QueryInterface(e, IID_UnitAI);
		return cmpUnitAI && !cmpUnitAI.IsAnimal(); // <<<<<<<< This has changed. Stops units from auto-attacking animals, such as lions.
	};

	const entsByPreferences = {};
	const preferences = [];
	const entsWithoutPref = [];
	for (let ent of ents)
	{
		if (!attackfilter(ent))
			continue;
		const pref = cmpAttack.GetPreference(ent);
		// If we match our best preference, we can try responding right away.
		// This makes some common cases fast, like most soldiers having 'Human' as best preference,
		// or ships having 'Ship'. And if there are no such targets, this doesn't do much more work.
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
		for (let pref of preferences)
			if (this.RespondToTargetedEntities(entsByPreferences[pref]))
				return true;
	}

	return this.RespondToTargetedEntities(entsWithoutPref);
};
