Formation.prototype.LoadFormation = function(newTemplate)
{
	const newFormation = ChangeEntityTemplate(this.entity, newTemplate);
	let cmpVisual = Engine.QueryInterface(newFormation, IID_Visual);
	if (cmpVisual)
	{
		const cmpNewOwnership = Engine.QueryInterface(newFormation, IID_Ownership);
		const player = cmpNewOwnership.GetOwner();
		const civ = QueryPlayerIDInterface(player).GetCiv();
		cmpVisual.SetVariant("animationVariant", civ);
	}
	return Engine.QueryInterface(newFormation, IID_UnitAI);
};
