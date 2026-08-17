import { BaseAI } from "simulation/ai/common-api/baseAI.js";
import { Entity } from "simulation/ai/common-api/entity.js";
import { Config } from "simulation/ai/nike/config.js";
import { Headquarters } from "simulation/ai/nike/headquarters.js";
import { Queue } from "simulation/ai/nike/queue.js";
import { QueueManager } from "simulation/ai/nike/queueManager.js";
import { gameAnalysis } from "simulation/ai/nike/startingStrategy.js";

export class NikeBot extends BaseAI
{
	constructor(settings)
	{
		super(settings);

		// played turn, because Nike doesn't play every turn.
		this.turn = 0;
		this.playedTurn = 0;
		this.elapsedTime = 0;

		this.uniqueIDs = {
			"armies": 1,	// starts at 1 to allow easier tests on armies ID existence
			"bases": 1,	// base manager ID starts at one because "0" means "no base" on the map
			"plans": 0,	// training/building/research plans
			"transports": 1	// transport plans start at 1 because 0 might be used as none
		};

		this.Config = new Config(settings.difficulty, settings.behavior);

		this.savedEvents = {};
	}

	CustomInit(gameState)
	{
		if (this.isDeserialized)
		{
			// WARNING: the deserializations should not modify the metadatas infos inside their init functions
			this.canPlay = this.data.canPlay;
			this.turn = this.data.turn;
			this.playedTurn = this.data.playedTurn;
			this.elapsedTime = this.data.elapsedTime;
			this.savedEvents = this.data.savedEvents;
			for (const key in this.savedEvents)
			{
				for (const i in this.savedEvents[key])
				{
					const evt = this.savedEvents[key][i];
					const evtmod = {};
					for (const keyevt in evt)
					{
						evtmod[keyevt] = evt[keyevt];
						this.savedEvents[key][i] = evtmod;
					}
				}
			}

			this.Config.Deserialize(this.data.config);

			this.queueManager = new QueueManager(this.Config, {});
			this.queueManager.Deserialize(gameState, this.data.queueManager);
			this.queues = this.queueManager.queues;

			this.HQ = new Headquarters(this.Config, true);
			this.HQ.init(gameState, this.queues);
			this.HQ.Deserialize(gameState, this.data.HQ);

			this.uniqueIDs = this.data.uniqueIDs;
			this.isDeserialized = false;
			this.data = undefined;

			// initialisation needed after the completion of the deserialization
			this.HQ.postinit(gameState);
		}
		else
		{
			this.Config.setConfig(gameState);

			// this.queues can only be modified by the queue manager or things will go awry.
			this.queues = {};
			for (const i in this.Config.priorities)
				this.queues[i] = new Queue();

			this.queueManager = new QueueManager(this.Config, this.queues);

			this.HQ = new Headquarters(this.Config, false);

			this.HQ.init(gameState, this.queues);

			// Try to analyze our starting position and set a strategy.
			this.canPlay = gameAnalysis(this.HQ, gameState);
		}
	}

	OnUpdate(sharedScript)
	{
		if (this.isDeserialized)
			this.Init(PlayerID, sharedScript);

		if (this.gameFinished || this.gameState.playerData.state == "defeated")
			return;

		for (const i in sharedScript.events)
		{
			if (i == "AIMetadata")   // not used inside nike
				continue;
			if (this.savedEvents[i] !== undefined)
				this.savedEvents[i] = this.savedEvents[i].concat(sharedScript.events[i]);
			else
				this.savedEvents[i] = sharedScript.events[i];
		}

		// Run the update every n turns, offset depending on player ID to balance the load
		this.elapsedTime = this.gameState.getTimeElapsed() / 1000;
		if (!this.playedTurn || (this.turn + this.player) % 8 == 5)
		{
			Engine.ProfileStart("NikeBot bot (player " + this.player +")");

			this.playedTurn++;

			if (!this.canPlay)
			{
				Engine.ProfileStop();
				return;
			}

			this.HQ.update(this.gameState, this.queues, this.savedEvents);

			this.queueManager.update(this.gameState);

			for (const i in this.savedEvents)
				this.savedEvents[i] = [];

			Engine.ProfileStop();
		}

		this.turn++;
	}

	Serialize()
	{
		if (this.isDeserialized)
			return this.data;

		const savedEvents = {};
		for (const key in this.savedEvents)
		{
			savedEvents[key] = this.savedEvents[key].slice();
			for (const i in savedEvents[key])
			{
				if (!savedEvents[key][i])
					continue;
				const evt = savedEvents[key][i];
				const evtmod = {};
				for (const keyevt in evt)
					evtmod[keyevt] = evt[keyevt];
				savedEvents[key][i] = evtmod;
			}
		}

		return {
			"canPlay": this.canPlay,
			"uniqueIDs": this.uniqueIDs,
			"turn": this.turn,
			"playedTurn": this.playedTurn,
			"elapsedTime": this.elapsedTime,
			"savedEvents": savedEvents,
			"config": this.Config.Serialize(),
			"queueManager": this.queueManager.Serialize(),
			"HQ": this.HQ.Serialize()
		};
	}

	Deserialize(data, sharedScript)
	{
		this.isDeserialized = true;
		this.data = data;
	}
}

