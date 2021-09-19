BuildingAI.prototype.OnRangeUpdate = function(msg)
{

	var cmpAttack = Engine.QueryInterface(this.entity, IID_Attack);
	if (!cmpAttack)
		return;

	// Target enemy units except animals.
	if (msg.tag == this.gaiaUnitsQuery)
	{
		msg.added = msg.added.filter(e => {
			let cmpUnitAI = Engine.QueryInterface(e, IID_UnitAI);
			return cmpUnitAI && (!cmpUnitAI.IsAnimal()); // << THIS HAS CHANGED.
		});
	}
	else if (msg.tag != this.enemyUnitsQuery)
		return;

	// Add new targets.
	for (let entity of msg.added)
		if (cmpAttack.CanAttack(entity))
			this.targetUnits.push(entity);

	// Remove targets outside of vision-range.
	for (let entity of msg.removed)
	{
		let index = this.targetUnits.indexOf(entity);
		if (index > -1)
			this.targetUnits.splice(index, 1);
	}

	if (this.targetUnits.length)
		this.StartTimer();
};
