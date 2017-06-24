var PETRA = function(m)
{

/** Ensure that all requirements are met when phasing up*/
m.HQ.prototype.checkPhaseRequirements = function(gameState, queues)
{
	if (gameState.getNumberOfPhases() == this.currentPhase)
		return;

	let requirements = gameState.getPhaseEntityRequirements(this.currentPhase + 1);
	let plan;
	let queue;
	for (let entityReq of requirements)
	{
		// Village requirements are met elsewhere by constructing more houses
		if (entityReq.class === "Village" || entityReq.class === "NotField")
			continue;
		if (gameState.getOwnEntitiesByClass(entityReq.class, true).length >= entityReq.count)
			continue;
		switch (entityReq.class)
		{
		case "Town":
			if (!queues.economicBuilding.hasQueuedUnits() && !queues.militaryBuilding.hasQueuedUnits() &&
			    !queues.defenseBuilding.hasQueuedUnits())
			{
				if (!gameState.getOwnEntitiesByClass("BarterMarket", true).hasEntities() &&
				    this.canBuild(gameState, "structures/{civ}_market"))
				{
					plan = new m.ConstructionPlan(gameState, "structures/{civ}_market");
					queue = "economicBuilding";
					break;
				}
				if (!gameState.getOwnEntitiesByClass("Temple", true).hasEntities() &&
				    this.canBuild(gameState, "structures/{civ}_temple"))
				{
					let plan = new m.ConstructionPlan(gameState, "structures/{civ}_temple");
					queue = "economicBuilding";
					break;
				}
				if (!gameState.getOwnEntitiesByClass("Blacksmith", true).hasEntities() &&
				    this.canBuild(gameState, "structures/{civ}_blacksmith"))
				{
					plan = new m.ConstructionPlan(gameState, "structures/{civ}_blacksmith");
					queue = "militaryBuilding";
					break;
				}
				if (this.canBuild(gameState, "structures/{civ}_defense_tower"))
				{
					plan = new m.ConstructionPlan(gameState, "structures/{civ}_defense_tower");
					queue = "defenseBuilding";
					break;
				}
			}
			break;
		case "Vesta":
			if (!queues.economicBuilding.hasQueuedUnits() && this.canBuild(gameState, "structures/{civ}_temple_vesta"))
			{
				plan = new m.ConstructionPlan(gameState, "structures/{civ}_temple_vesta");
				queue = "economicBuilding";
			}
			break;
		case "Arch":
			if (!queues.economicBuilding.hasQueuedUnits() && this.canBuild(gameState, "structures/{civ}_arch"))
			{
				plan = new m.ConstructionPlan(gameState, "structures/{civ}_arch");
				queue = "economicBuilding";
			}
			break;
		case "ImperialCourt":
			if (!queues.economicBuilding.hasQueuedUnits() && this.canBuild(gameState, "structures/{civ}_government_center"))
			{
				plan = new m.ConstructionPlan(gameState, "structures/{civ}_government_center");
				queue = "economicBuilding";
			}
			break;
		case "CultStatue":
			if (!queues.economicBuilding.hasQueuedUnits() && this.canBuild(gameState, "template_structure_special_statue"))
			{
				plan = new m.ConstructionPlan(gameState, "template_structure_special_statue");
				queue = "economicBuilding";
			}
			break;
		case "Wonder":
			if (!queues.wonder.hasQueuedUnits() && this.canBuild(gameState, "structures/{civ}_wonder"))
			{
				plan = new m.ConstructionPlan(gameState, "structures/{civ}_wonder");
				queues.wonder.addPlan(plan);
				gameState.ai.queueManager.changePriority("majorTech", 400);
				plan.queueToReset = "majorTech"
				queues.wonder.addPlan(plan);
				return;
			}
			break;
		default:
			API3.warn("Petra: requirement " + entityReq.class + " for phase " + this.phasing + " not taken into account");
		}

		if (plan)
		{
			gameState.ai.queueManager.changePriority(queue, 1000);
			plan.queueToReset = queue;
			queues[queue].addPlan(plan);
			return;
		}
	}
};

return m;

}(PETRA)
