import { ResourcesManager } from "simulation/ai/common-api/resources.js";
import { aiWarn } from "simulation/ai/common-api/utils.js";

/**
 * Common functions and variables to all queue plans.
 */

export class QueuePlan
{
	constructor(gameState, type, metadata)
	{
		this.type = gameState.applyCiv(type);
		this.metadata = metadata;

		this.template = gameState.getTemplate(this.type);
		if (!this.template)
			throw new Error("Tried to add the inexisting template " + this.type + " to Nike.");
		this.ID = gameState.ai.uniqueIDs.plans++;
		this.cost = new ResourcesManager(this.template.cost());
		this.number = 1;
		this.category = "";
	}

	/** Check the content of this queue */
	isInvalid(gameState)
	{
		return false;
	}

	/** if true, the queue manager will begin increasing this plan's account. */
	isGo(gameState)
	{
		return true;
	}

	/** can we start this plan immediately? */
	canStart(gameState)
	{
		return false;
	}

	/** process the plan. */
	start(gameState)
	{
		// should call onStart.
	}

	getCost()
	{
		const costs = new ResourcesManager();
		costs.add(this.cost);
		if (this.number !== 1)
			costs.multiply(this.number);
		return costs;
	}

	/**
	 * On Event functions.
	 * Can be used to do some specific stuffs
	 * Need to be updated to actually do something if you want them to.
	 * this is called by "Start" if it succeeds.
	 */
	onStart(gameState)
	{
	}
}
