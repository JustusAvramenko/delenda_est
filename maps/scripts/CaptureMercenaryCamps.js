{
	let cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
	cmpTrigger.ConquestAddVictoryCondition({
		"classFilter": "CivilCentre+!Foundation",
		"defeatReason": markForTranslation("%(player)s has been defeated (lost all Civic Centers).")
	});
	cmpTrigger.ConquestAddVictoryCondition({
		"classFilter": "ConquestCritical CivilCentre+!Foundation",
		"defeatReason": markForTranslation("%(player)s has been defeated (lost all Civic Centers and critical units and structures).")
	});
}
