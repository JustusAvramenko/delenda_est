var cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
cmpTrigger.conquestClassFilter = "CivilCentre";
cmpTrigger.conquestDefeatReason = markForTranslation("%(player)s has been defeated (lost all Civic Centers).");

var data = {"enabled": true};
cmpTrigger.RegisterTrigger("OnOwnershipChanged", "ConquestHandlerOwnerShipChanged", data);
cmpTrigger.RegisterTrigger("OnStructureBuilt", "ConquestAddStructure", data);

cmpTrigger.DoAfterDelay(0, "ConquestStartGameCount", null);
