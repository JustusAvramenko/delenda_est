import * as filters from "simulation/ai/common-api/filters.js";
import { ResourcesManager } from "simulation/ai/common-api/resources.js";
import { aiWarn } from "simulation/ai/common-api/utils.js";
import { Queue } from "simulation/ai/nike/queue.js";
import { Worker } from "simulation/ai/nike/worker.js";

/**
 * This takes the input queues and picks which items to fund with resources until no more resources are left to distribute.
 *
 * Currently this manager keeps accounts for each queue, split between the 4 main resources
 *
 * Each time resources are available (ie not in any account), it is split between the different queues
 * Mostly based on priority of the queue, and existing needs.
 * Each turn, the queue Manager checks if a queue can afford its next item, then it does.
 *
 * A consequence of the system it's not really revertible. Once a queue has an account of 500 food, it'll keep it
 * If for some reason the AI stops getting new food, and this queue lacks, say, wood, no other queues will
 * be able to benefit form the 500 food (even if they only needed food).
 * This is not to annoying as long as all goes well. If the AI loses many workers, it starts being problematic.
 *
 * It also has the effect of making the AI more or less always sit on a few hundreds resources since most queues
 * get some part of the total, and if all queues have 70% of their needs, nothing gets done
 * Particularly noticeable when phasing: the AI often overshoots by a good 200/300 resources before starting.
 *
 * This system should be improved. It's probably not flexible enough.
 */

function sortQueues(queueArrays, priorities)
{
	queueArrays.sort((a, b) =>
	{
		const priorityDifference = priorities[b[0]] - priorities[a[0]];
		if (priorityDifference !== 0)
			return priorityDifference;
		if (b[0] < a[0])
			return 1;
		if (b[0] > a[0])
			return -1;
		return 0;
	});
}

export class QueueManager
{
	constructor(Config, queues)
	{
		this.Config = Config;
		this.queues = queues;
		this.priorities = {};
		for (const i in Config.priorities)
			this.priorities[i] = Config.priorities[i];
		this.accounts = {};

		// the sorting is updated on priority change.
		this.queueArrays = [];
		for (const q in this.queues)
		{
			this.accounts[q] = new ResourcesManager();
			this.queueArrays.push([q, this.queues[q]]);
		}
		sortQueues(this.queueArrays, this.priorities);
	}

	getAvailableResources(gameState)
	{
		const resources = gameState.getResources();
		for (const key in this.queues)
			resources.subtract(this.accounts[key]);
		return resources;
	}

	getTotalAccountedResources()
	{
		const resources = new ResourcesManager();
		for (const key in this.queues)
			resources.add(this.accounts[key]);
		return resources;
	}

	currentNeeds(gameState)
	{
		const needed = new ResourcesManager();
		// queueArrays because it's faster.
		for (const q of this.queueArrays)
		{
			const queue = q[1];
			if (!queue.hasQueuedUnits() || !queue.plans[0].isGo(gameState))
				continue;
			const costs = queue.plans[0].getCost();
			needed.add(costs);
		}
		// get out current resources, not removing accounts.
		const current = gameState.getResources();
		for (const res of Resources.GetCodes())
			needed[res] = Math.max(0, needed[res] - current[res]);

		return needed;
	}

	// calculate the gather rates we'd want to be able to start all elements in our queues
	// TODO: many things.
	wantedGatherRates(gameState)
	{
		// default values for first turn when we have not yet set our queues.
		if (gameState.ai.playedTurn === 0)
		{
			const ret = {};
			for (const res of Resources.GetCodes())
				ret[res] = this.Config.queues.firstTurn[res] || this.Config.queues.firstTurn.default;
			return ret;
		}

		// get out current resources, not removing accounts.
		const current = gameState.getResources();
		// short queue is the first item of a queue, assumed to be ready in 30s
		// medium queue is the second item of a queue, assumed to be ready in 60s
		// long queue contains the isGo=false items, assumed to be ready in 300s
		const totalShort = {};
		const totalMedium = {};
		const totalLong = {};
		for (const res of Resources.GetCodes())
		{
			totalShort[res] = this.Config.queues.short[res] || this.Config.queues.short.default;
			totalMedium[res] = this.Config.queues.medium[res] || this.Config.queues.medium.default;
			totalLong[res] = this.Config.queues.long[res] || this.Config.queues.long.default;
		}
		let total;
		// queueArrays because it's faster.
		for (const q of this.queueArrays)
		{
			const queue = q[1];
			if (queue.paused)
				continue;
			for (let j = 0; j < queue.length(); ++j)
			{
				if (j > 1)
					break;
				const cost = queue.plans[j].getCost();
				if (queue.plans[j].isGo(gameState))
				{
					if (j === 0)
						total = totalShort;
					else
						total = totalMedium;
				}
				else
					total = totalLong;
				for (const type in total)
					total[type] += cost[type];
				if (!queue.plans[j].isGo(gameState))
					break;
			}
		}
		// global rates
		const rates = {};
		let diff;
		for (const res of Resources.GetCodes())
		{
			if (current[res] > 0)
			{
				diff = Math.min(current[res], totalShort[res]);
				totalShort[res] -= diff;
				current[res] -= diff;
				if (current[res] > 0)
				{
					diff = Math.min(current[res], totalMedium[res]);
					totalMedium[res] -= diff;
					current[res] -= diff;
					if (current[res] > 0)
						totalLong[res] -= Math.min(current[res], totalLong[res]);
				}
			}
			rates[res] = totalShort[res]/30 + totalMedium[res]/60 + totalLong[res]/300;
		}

		return rates;
	}

	printQueues(gameState)
	{
		let numWorkers = 0;
		gameState.getOwnUnits().forEach(ent =>
		{
			if (ent.getMetadata(PlayerID, "role") === Worker.ROLE_WORKER &&
				ent.getMetadata(PlayerID, "plan") === undefined)
			{
				numWorkers++;
			}
		});
		aiWarn("---------- QUEUES ------------ with pop " + gameState.getPopulation() + " and workers " +
			numWorkers);
		for (const i in this.queues)
		{
			const q = this.queues[i];
			if (q.hasQueuedUnits())
			{
				aiWarn(i + ": ( with priority " + this.priorities[i] +" and accounts " +
					uneval(this.accounts[i]) +")");
				aiWarn(" while maxAccountWanted(0.6) is " + uneval(q.maxAccountWanted(gameState, 0.6)));
			}
			for (const plan of q.plans)
			{
				let qStr = "     " + plan.type + " ";
				if (plan.number)
					qStr += "x" + plan.number;
				qStr += "   isGo " + plan.isGo(gameState);
				aiWarn(qStr);
			}
		}
		aiWarn("Accounts");
		for (const p in this.accounts)
			aiWarn(p + ": " + uneval(this.accounts[p]));
		aiWarn("Current Resources: " + uneval(gameState.getResources()));
		aiWarn("Available Resources: " + uneval(this.getAvailableResources(gameState)));
		aiWarn("Wanted Gather Rates: " + uneval(gameState.ai.HQ.GetWantedGatherRates(gameState)));
		aiWarn("Current Gather Rates: " + uneval(gameState.ai.HQ.GetCurrentGatherRates(gameState)));
		aiWarn("Most needed resources: " + uneval(gameState.ai.HQ.pickMostNeededResources(gameState)));
		aiWarn("------------------------------------");
	}

	clear()
	{
		for (const i in this.queues)
			this.queues[i].empty();
	}

	/**
	 * set accounts of queue i from the unaccounted resources
	 */
	setAccounts(gameState, cost, i)
	{
		const available = this.getAvailableResources(gameState);
		for (const res of Resources.GetCodes())
		{
			if (this.accounts[i][res] >= cost[res])
				continue;
			this.accounts[i][res] += Math.min(available[res], cost[res] - this.accounts[i][res]);
		}
	}

	/**
	 * transfer accounts from queue i to queue j
	 */
	transferAccounts(cost, i, j)
	{
		for (const res of Resources.GetCodes())
		{
			if (this.accounts[j][res] >= cost[res])
				continue;
			const diff = Math.min(this.accounts[i][res], cost[res] - this.accounts[j][res]);
			this.accounts[i][res] -= diff;
			this.accounts[j][res] += diff;
		}
	}

	/**
	 * distribute the resources between the different queues according to their priorities
	 */
	distributeResources(gameState)
	{
		const availableRes = this.getAvailableResources(gameState);
		for (const res of Resources.GetCodes())
		{
			if (availableRes[res] < 0)    // rescale the accounts if we've spent resources already accounted (e.g. by bartering)
			{
				const total = gameState.getResources()[res];
				const scale = total / (total - availableRes[res]);
				availableRes[res] = total;
				for (const j in this.queues)
				{
					this.accounts[j][res] = Math.floor(scale * this.accounts[j][res]);
					availableRes[res] -= this.accounts[j][res];
				}
			}

			if (!availableRes[res])
			{
				this.switchResource(gameState, res);
				continue;
			}

			let totalPriority = 0;
			const tempPrio = {};
			const maxNeed = {};
			// Okay so this is where it gets complicated.
			// If a queue requires "res" for the next elements (in the queue)
			// And the account is not high enough for it.
			// Then we add it to the total priority.
			// To try and be clever, we don't want a long queue to hog all resources. So two things:
			//	-if a queue has enough of resource X for the 1st element, its priority is decreased (factor 2).
			//	-queues accounts are capped at "resources for the first + 60% of the next"
			// This avoids getting a high priority queue with many elements hogging all of one resource
			// uselessly while it awaits for other resources.
			for (const j in this.queues)
			{
				// returns exactly the correct amount, ie 0 if we're not go.
				const queueCost = this.queues[j].maxAccountWanted(gameState, 0.6);
				if (this.queues[j].hasQueuedUnits() && this.accounts[j][res] < queueCost[res] && !this.queues[j].paused)
				{
					// adding us to the list of queues that need an update.
					tempPrio[j] = this.priorities[j];
					maxNeed[j] = queueCost[res] - this.accounts[j][res];
					// if we have enough of that resource for our first item in the queue, diminish our priority.
					if (this.accounts[j][res] >= this.queues[j].getNext().getCost()[res])
						tempPrio[j] /= 2;

					if (tempPrio[j])
						totalPriority += tempPrio[j];
				}
				else if (this.accounts[j][res] > queueCost[res])
				{
					availableRes[res] += this.accounts[j][res] - queueCost[res];
					this.accounts[j][res] = queueCost[res];
				}
			}
			// Now we allow resources to the accounts. We can at most allow "TempPriority/totalpriority*available"
			// But we'll sometimes allow less if that would overflow.
			let available = availableRes[res];
			let missing = false;
			for (const j in tempPrio)
			{
				// we'll add at much what can be allowed to this queue.
				let toAdd = Math.floor(availableRes[res] * tempPrio[j]/totalPriority);
				if (toAdd >= maxNeed[j])
					toAdd = maxNeed[j];
				else
					missing = true;
				this.accounts[j][res] += toAdd;
				maxNeed[j] -= toAdd;
				available -= toAdd;
			}
			if (missing && available > 0)   // distribute the rest (due to floor) in any queue
			{
				for (const j in tempPrio)
				{
					const toAdd = Math.min(maxNeed[j], available);
					this.accounts[j][res] += toAdd;
					available -= toAdd;
					if (available <= 0)
						break;
				}
			}
			if (available < 0)
				aiWarn("Nike: problem with remaining " + res + " in queueManager " + available);
		}
	}

	switchResource(gameState, res)
	{
		// We have no available resources, see if we can't "compact" them in one queue.
		// compare queues 2 by 2, and if one with a higher priority could be completed by our amount, give it.
		// TODO: this isn't perfect compression.
		for (const j in this.queues)
		{
			if (!this.queues[j].hasQueuedUnits() || this.queues[j].paused)
				continue;

			const queue = this.queues[j];
			const queueCost = queue.maxAccountWanted(gameState, 0);
			if (this.accounts[j][res] >= queueCost[res])
				continue;

			for (const i in this.queues)
			{
				if (i === j)
					continue;
				const otherQueue = this.queues[i];
				if (this.priorities[i] >= this.priorities[j] || otherQueue.switched !== 0)
					continue;
				if (this.accounts[j][res] + this.accounts[i][res] < queueCost[res])
					continue;

				const diff = queueCost[res] - this.accounts[j][res];
				this.accounts[j][res] += diff;
				this.accounts[i][res] -= diff;
				++otherQueue.switched;
				if (this.Config.debug > 2)
				{
					aiWarn("switching queue " + res + " from " + i + " to " + j + " in amount " +
						diff);
				}
				break;
			}
		}
	}

	// Start the next item in the queue if we can afford it.
	startNextItems(gameState)
	{
		for (const q of this.queueArrays)
		{
			const name = q[0];
			const queue = q[1];
			if (queue.hasQueuedUnits() && !queue.paused)
			{
				const item = queue.getNext();
				if (this.accounts[name].canAfford(item.getCost()) && item.canStart(gameState))
				{
					// canStart may update the cost because of the costMultiplier so we must check it again
					if (this.accounts[name].canAfford(item.getCost()))
					{
						this.finishingTime = gameState.ai.elapsedTime;
						this.accounts[name].subtract(item.getCost());
						queue.startNext(gameState);
						queue.switched = 0;
					}
				}
			}
			else if (!queue.hasQueuedUnits())
			{
				this.accounts[name].reset();
				queue.switched = 0;
			}
		}
	}

	update(gameState)
	{
		Engine.ProfileStart("Queue Manager");

		for (const i in this.queues)
		{
			this.queues[i].check(gameState);  // do basic sanity checks on the queue
			if (this.priorities[i] > 0)
				continue;
			aiWarn("QueueManager received bad priorities, please report this error: " +
				uneval(this.priorities));
			this.priorities[i] = 1;  // TODO: make the Queue Manager not die when priorities are zero.
		}

		// Pause or unpause queues depending on the situation
		this.checkPausedQueues(gameState);

		// Let's assign resources to plans that need them
		this.distributeResources(gameState);

		// Start the next item in the queue if we can afford it.
		this.startNextItems(gameState);

		if (this.Config.debug > 1 && gameState.ai.playedTurn%50 === 0)
			this.printQueues(gameState);

		Engine.ProfileStop();
	}

	// Recovery system: if short of workers after an attack, pause (and reset) some queues to favor worker training
	checkPausedQueues(gameState)
	{
		const numWorkers = gameState.countOwnEntitiesAndQueuedWithRole(Worker.ROLE_WORKER);
		const workersMin = Math.min(Math.max(12, 24 * this.Config.popScaling), this.Config.Economy.popPhase2);
		for (const q in this.queues)
		{
			let toBePaused = false;
			if (!gameState.ai.HQ.hasPotentialBase())
				toBePaused = q != "dock" && q != "civilCentre";
			else if (numWorkers < workersMin / 3)
				toBePaused = q != "citizenSoldier" && q != "villager" && q != "emergency";
			else if (numWorkers < workersMin * 2 / 3)
				toBePaused = q == "civilCentre" || q == "economicBuilding" ||
					q == "militaryBuilding" || q == "defenseBuilding" || q == "healer" ||
					q == "majorTech" || q == "minorTech" || q.indexOf("plan_") != -1;
			else if (numWorkers < workersMin)
				toBePaused = q == "civilCentre" || q == "defenseBuilding" ||
					q == "majorTech" || q.indexOf("_siege") != -1 || q.indexOf("_champ") != -1;

			if (toBePaused)
			{
				if (q == "field" && gameState.ai.HQ.needFarm &&
					!gameState.getOwnStructures().filter(filters.byClass("Field")).hasEntities())
				{
					toBePaused = false;
				}
				if (q == "corral" && gameState.ai.HQ.needCorral &&
					!gameState.getOwnStructures().filter(filters.byClass("Field")).hasEntities())
				{
					toBePaused = false;
				}
				if (q == "dock" && gameState.ai.HQ.needFish &&
					!gameState.getOwnStructures().filter(filters.byClass("Dock")).hasEntities())
				{
					toBePaused = false;
				}
				if (q == "ships" && gameState.ai.HQ.needFish &&
					!gameState.ai.HQ.navalManager.ships.filter(filters.byClass("FishingBoat"))
						.hasEntities())
				{
					toBePaused = false;
				}
			}

			const queue = this.queues[q];
			if (!queue.paused && toBePaused)
			{
				queue.paused = true;
				this.accounts[q].reset();
			}
			else if (queue.paused && !toBePaused)
				queue.paused = false;

			// And reduce the batch sizes of attack queues
			if (q.indexOf("plan_") != -1 && numWorkers < workersMin && queue.plans[0])
			{
				queue.plans[0].number = 1;
				if (queue.plans[1])
					queue.plans[1].number = 1;
			}
		}
	}

	canAfford(queue, cost)
	{
		if (!this.accounts[queue])
			return false;
		return this.accounts[queue].canAfford(cost);
	}

	pauseQueue(queue, scrapAccounts)
	{
		if (!this.queues[queue])
			return;
		this.queues[queue].paused = true;
		if (scrapAccounts)
			this.accounts[queue].reset();
	}

	unpauseQueue(queue)
	{
		if (this.queues[queue])
			this.queues[queue].paused = false;
	}

	pauseAll(scrapAccounts, but)
	{
		for (const q in this.queues)
		{
			if (q == but)
				continue;
			if (scrapAccounts)
				this.accounts[q].reset();
			this.queues[q].paused = true;
		}
	}

	unpauseAll(but)
	{
		for (const q in this.queues)
			if (q != but)
				this.queues[q].paused = false;
	}


	addQueue(queueName, priority)
	{
		if (this.queues[queueName] !== undefined)
			return;

		this.queues[queueName] = new Queue();
		this.priorities[queueName] = priority;
		this.accounts[queueName] = new ResourcesManager();

		this.queueArrays = [];
		for (const q in this.queues)
			this.queueArrays.push([q, this.queues[q]]);
		sortQueues(this.queueArrays, this.priorities);
	}

	removeQueue(queueName)
	{
		if (this.queues[queueName] === undefined)
			return;

		delete this.queues[queueName];
		delete this.priorities[queueName];
		delete this.accounts[queueName];

		this.queueArrays = [];
		for (const q in this.queues)
			this.queueArrays.push([q, this.queues[q]]);
		sortQueues(this.queueArrays, this.priorities);
	}

	getPriority(queueName)
	{
		return this.priorities[queueName];
	}

	changePriority(queueName, newPriority)
	{
		if (this.Config.debug > 1)
		{
			aiWarn(">>> Priority of queue " + queueName + " changed from " + this.priorities[queueName] +
				" to " + newPriority);
		}
		if (this.queues[queueName] !== undefined)
			this.priorities[queueName] = newPriority;
		sortQueues(this.queueArrays, this.priorities);
	}

	Serialize()
	{
		const accounts = {};
		const queues = {};
		for (const q in this.queues)
		{
			queues[q] = this.queues[q].Serialize();
			accounts[q] = this.accounts[q].Serialize();
			if (this.Config.debug == -100)
			{
				aiWarn("queueManager serialization: queue " + q + " >>> " + uneval(queues[q]) +
					" with accounts " + uneval(accounts[q]));
			}
		}

		return {
			"priorities": this.priorities,
			"queues": queues,
			"accounts": accounts
		};
	}

	Deserialize(gameState, data)
	{
		this.priorities = data.priorities;
		this.queues = {};
		this.accounts = {};

		// the sorting is updated on priority change.
		this.queueArrays = [];
		for (const q in data.queues)
		{
			this.queues[q] = new Queue();
			this.queues[q].Deserialize(gameState, data.queues[q]);
			this.accounts[q] = new ResourcesManager();
			this.accounts[q].Deserialize(data.accounts[q]);
			this.queueArrays.push([q, this.queues[q]]);
		}
		sortQueues(this.queueArrays, data.priorities);
	}
}
