import { emergency as chatEmergency } from "simulation/ai/nike/chatHelper.js";

/**
 * Checks for emergencies and acts accordingly
 */
export class EmergencyManager
{
	referencePopulation = 0;
	referenceStructureCount = 0;
	numRoots = 0;
	hasEmergency = false;

	constructor(Config)
	{
		this.Config = Config;
	}

	init(gameState)
	{
		this.referencePopulation = gameState.getPopulation();
		this.referenceStructureCount = gameState.getOwnStructures().length;
		this.numRoots = this.rootCount(gameState);
	}

	update(gameState)
	{
		if (this.hasEmergency)
		{
			this.emergencyUpdate(gameState);
			return;
		}
		const pop = gameState.getPopulation();
		const nStructures = gameState.getOwnStructures().length;
		const nRoots = this.rootCount(gameState);
		const factors = this.Config.emergencyValues;
		if (((pop / this.referencePopulation) < factors.population || pop == 0) &&
			((nStructures / this.referenceStructureCount) < factors.structures || nStructures == 0))
			this.setEmergency(gameState, true);
		else if ((nRoots / this.numRoots) <= factors.roots || (nRoots == 0 && this.numRoots != 0))
			this.setEmergency(gameState, true);

		if (pop > this.referencePopulation || this.hasEmergency)
			this.referencePopulation = pop;
		if (nStructures > this.referenceStructureCount || this.hasEmergency)
			this.referenceStructureCount = nStructures;
		if (nRoots > this.numRoots || this.hasEmergency)
			this.numRoots = nRoots;
	}

	emergencyUpdate(gameState)
	{
		const pop = gameState.getPopulation();
		const nStructures = gameState.getOwnStructures().length;
		const nRoots = this.rootCount(gameState);
		const factors = this.Config.emergencyValues;

		if ((pop > this.referencePopulation * 1.2 &&
			nStructures > this.referenceStructureCount * 1.2) ||
			nRoots > this.numRoots)
		{
			this.setEmergency(gameState, false);
			this.referencePopulation = pop;
			this.referenceStructureCount = nStructures;
			this.numRoots = nRoots;
		}
	}

	rootCount(gameState)
	{
		let roots = 0;
		gameState.getOwnStructures().toEntityArray().forEach(ent =>
		{
			if (ent?.get("TerritoryInfluence")?.Root === "true")
				roots++;
		});
		return roots;
	}

	setEmergency(gameState, enable)
	{
		this.hasEmergency = enable;
		chatEmergency(gameState, enable);
	}

	Serialize()
	{
		return {
			"referencePopulation": this.referencePopulation,
			"referenceStructureCount": this.referenceStructureCount,
			"numRoots": this.numRoots,
			"hasEmergency": this.hasEmergency
		};
	}

	Deserialize(data)
	{
		for (const key in data)
			this[key] = data[key];
	}
}
