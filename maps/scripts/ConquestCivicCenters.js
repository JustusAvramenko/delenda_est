{
    let cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
    cmpTrigger.ConquestAddVictoryCondition({
        "classFilter": "CivilCentre",
        "defeatReason": markForTranslation("%(player)s has been defeated (lost all Civic Centers).")
    });
}
