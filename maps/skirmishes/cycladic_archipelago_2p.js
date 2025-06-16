Trigger.prototype.SpawnUnits = function()
{
	var argoTreasures = TriggerHelper.SpawnUnitsFromTriggerPoints(
		pickRandom(["A", "B", "C", "D"]), "gaia/treasure/special_argo", this.unitsForSpawn, 0);
};

{
	const cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	cmpTrigger.unitsForSpawn = 1; // spawn 1 unit
	cmpTrigger.RegisterTrigger("OnInitGame", "SpawnUnits", { "enabled": true }); // at match initialization
}
