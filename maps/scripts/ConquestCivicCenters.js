{
	let cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	cmpTrigger.conquestClassFilter = "CivilCentre";
	cmpTrigger.conquestDefeatReason = markForTranslation("%(player)s has been defeated (lost all Civic Centers).");
}
