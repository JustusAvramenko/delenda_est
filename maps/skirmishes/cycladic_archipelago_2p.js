Trigger.prototype.SpawnUnits = function()
{
	var intruders = TriggerHelper.SpawnUnitsFromTriggerPoints(
			pickRandom(["A", "B", "C", "D"]), "gaia/treasure/special_argo", this.Count, 1);
}
