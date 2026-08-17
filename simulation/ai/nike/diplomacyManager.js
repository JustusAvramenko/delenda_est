import { aiWarn } from "simulation/ai/common-api/utils.js";
import * as chat from "simulation/ai/nike/chatHelper.js";

/**
 * Manage the diplomacy:
 *     update our cooperative trait
 *     sent tribute to allies
 *     decide which player to turn against in "Last Man Standing" mode
 *     respond to diplomacy requests
 *     send diplomacy requests to other players (rarely)
 */

/**
 * If a player sends us an ally or neutral request, an Object in this.receivedDiplomacyRequests will be created
 * that includes the request status, and the amount and type of the resource tribute (if any)
 * that they must send in order for us to accept their request.
 * In addition, a message will be sent if the player has not sent us a tribute within a minute.
 * If two minutes pass without a tribute, we will decline their request.
 *
 * If we send a diplomacy request to another player, an Object in this.sentDiplomacyRequests will be created,
 * which consists of the requestType (i.e. "ally" or "neutral") and the timeSent. A chat message will be sent
 * to the other player, and AI players will actually be informed of the request by a DiplomacyRequest event
 * sent through AIInterface. It is expected that the other player will change their diplomacy stance to the stance
 * that we suggested within a period of time, or else the request will be deleted from this.sentDiplomacyRequests.
 * When @c deserialized is true, do not call any random function inside constructor as that would cause oos.
 */
export class DiplomacyManager
{
	constructor(Config, deserialized)
	{
		this.Config = Config;
		this.nextTributeUpdate = 90;
		this.nextTributeRequest = new Map();
		this.nextTributeRequest.set("all", 240);
		this.betrayLapseTime = -1;
		this.waitingToBetray = false;
		this.betrayWeighting = 150;
		this.receivedDiplomacyRequests = new Map();
		this.sentDiplomacyRequests = new Map();
		this.sentDiplomacyRequestLapseTime = deserialized ? 175 : randFloat(130, 220);
	}

	/**
	 * If there are any players that are allied/neutral with us but we are not allied/neutral with them,
	 * treat this situation like an ally/neutral request.
	 */
	init(gameState)
	{
		this.lastManStandingCheck(gameState);

		for (let i = 1; i < gameState.sharedScript.playersData.length; ++i)
		{
			if (i === PlayerID)
				continue;

			if (gameState.isPlayerMutualAlly(i))
				this.receivedDiplomacyRequests.set(i, { "requestType": "ally", "status": "accepted" });
			else if (gameState.sharedScript.playersData[i].isAlly[PlayerID])
				this.handleDiplomacyRequest(gameState, i, "ally");
			else if (gameState.sharedScript.playersData[i].isNeutral[PlayerID] && gameState.isPlayerEnemy(i))
				this.handleDiplomacyRequest(gameState, i, "neutral");
		}
	}

	/**
	 * Check if any allied needs help (tribute) and sent it if we have enough resource
	 * or ask for a tribute if we are in need and one ally can help
	 */
	tributes(gameState)
	{
		this.nextTributeUpdate = gameState.ai.elapsedTime + 30;
		const resTribCodes = Resources.GetTributableCodes();
		if (!resTribCodes.length)
			return;
		const totalResources = gameState.getResources();
		const availableResources = gameState.ai.queueManager.getAvailableResources(gameState);
		let mostNeeded;
		for (let i = 1; i < gameState.sharedScript.playersData.length; ++i)
		{
			if (i === PlayerID || !gameState.isPlayerAlly(i) || gameState.ai.HQ.attackManager.defeated[i])
				continue;
			const donor = gameState.getAlliedVictory() || gameState.getEntities(i).length < gameState.getOwnEntities().length;
			const allyResources = gameState.sharedScript.playersData[i].resourceCounts;
			const allyPop = gameState.sharedScript.playersData[i].popCount;
			const tribute = {};
			let toSend = false;
			for (const res of resTribCodes)
			{
				if (donor && availableResources[res] > 200 && allyResources[res] < 0.2 * availableResources[res])
				{
					tribute[res] = Math.floor(0.3*availableResources[res] - allyResources[res]);
					toSend = true;
				}
				else if (donor && allyPop < Math.min(30, 0.5*gameState.getPopulation()) && totalResources[res] > 500 && allyResources[res] < 100)
				{
					tribute[res] = 100;
					toSend = true;
				}
				else if (this.Config.chat && availableResources[res] === 0 && allyResources[res] > totalResources[res] + 600)
				{
					if (gameState.ai.elapsedTime < this.nextTributeRequest.get("all"))
						continue;
					if (this.nextTributeRequest.has(res) && gameState.ai.elapsedTime < this.nextTributeRequest.get(res))
						continue;
					if (!mostNeeded)
						mostNeeded = gameState.ai.HQ.pickMostNeededResources(gameState, resTribCodes);
					for (let k = 0; k < mostNeeded.length; ++k)
					{
						if (mostNeeded[k].type == res && mostNeeded[k].wanted > 0)
						{
							this.nextTributeRequest.set("all", gameState.ai.elapsedTime + 90);
							this.nextTributeRequest.set(res, gameState.ai.elapsedTime + 240);
							chat.requestTribute(gameState, res);
							if (this.Config.debug > 1)
								aiWarn("Tribute on " + res + " requested to player " + i);
							break;
						}
					}
				}
			}
			if (!toSend)
				continue;
			if (this.Config.debug > 1)
				aiWarn("Tribute " + uneval(tribute) + " sent to player " + i);
			if (this.Config.chat)
				chat.sentTribute(gameState, i);
			Engine.PostCommand(PlayerID, { "type": "tribute", "player": i, "amounts": tribute });
		}
	}

	checkEvents(gameState, events)
	{
		// Increase slowly the cooperative personality trait either when we receive tribute from our allies
		// or if our allies attack enemies inside our territory
		for (const evt of events.TributeExchanged)
		{
			if (evt.to === PlayerID && !gameState.isPlayerAlly(evt.from) && this.receivedDiplomacyRequests.has(evt.from))
			{
				const request = this.receivedDiplomacyRequests.get(evt.from);
				if (request.status === "waitingForTribute" && request.type in evt.amounts)
				{
					request.wanted -= evt.amounts[request.type];

					if (request.wanted <= 0)
					{
						if (this.Config.debug > 1)
						{
							aiWarn("Player " + uneval(evt.from) +
								" has sent the required tribute amount");
						}

						this.changePlayerDiplomacy(gameState, evt.from, request.requestType);
						request.status = "accepted";
					}
					else if (evt.amounts[request.type] > 0)
					{
						// Reset the warning sent to the player that reminds them to speed up the tributes
						request.warnTime = gameState.ai.elapsedTime + 60;
						request.sentWarning = false;
					}
				}
			}

			if (evt.to !== PlayerID || !gameState.isPlayerAlly(evt.from))
				continue;
			let tributes = 0;
			for (const key in evt.amounts)
			{
				if (key === "food")
					tributes += evt.amounts[key];
				else
					tributes += 2*evt.amounts[key];
			}
			this.Config.personality.cooperative = Math.min(1, this.Config.personality.cooperative + 0.0001 * tributes);
		}

		for (const evt of events.Attacked)
		{
			const target = gameState.getEntityById(evt.target);
			if (!target || !target.position() ||
				gameState.ai.HQ.territoryMap.getOwner(target.position()) !== PlayerID ||
				!gameState.isPlayerEnemy(target.owner()))
				continue;
			const attacker = gameState.getEntityById(evt.attacker);
			if (!attacker || attacker.owner() === PlayerID || !gameState.isPlayerAlly(attacker.owner()))
				continue;
			this.Config.personality.cooperative = Math.min(1, this.Config.personality.cooperative + 0.003);
		}

		if (events.DiplomacyChanged.length || events.PlayerDefeated.length || events.CeasefireEnded.length)
			this.lastManStandingCheck(gameState);

		for (const evt of events.PlayerDefeated)
		{
			this.receivedDiplomacyRequests.delete(evt.playerId);
			this.sentDiplomacyRequests.delete(evt.playerId);
		}

		for (const evt of events.DiplomacyChanged)
		{
			if (evt.otherPlayer !== PlayerID)
				continue;

			if (this.sentDiplomacyRequests.has(evt.player)) // If another player has accepted a diplomacy request we sent
			{
				const sentRequest = this.sentDiplomacyRequests.get(evt.player);
				if (gameState.sharedScript.playersData[evt.player].isAlly[PlayerID] && sentRequest.requestType === "ally" ||
				    gameState.sharedScript.playersData[evt.player].isNeutral[PlayerID] && sentRequest.requestType === "neutral")
					this.changePlayerDiplomacy(gameState, evt.player, sentRequest.requestType);

				// Just remove the request if the other player switched their stance to a different and/or more negative state
				// TODO: Keep this send request and take it into account for later diplomacy changes (maybe be less inclined to offer to this player)
				this.sentDiplomacyRequests.delete(evt.player);
				continue;
			}

			const request = this.receivedDiplomacyRequests.get(evt.player);
			if (request !== undefined &&
			   (!gameState.sharedScript.playersData[evt.player].isAlly[PlayerID] && request.requestType === "ally" ||
			     gameState.sharedScript.playersData[evt.player].isEnemy[PlayerID] && request.requestType === "neutral"))
			{
				// a player that had requested to be allies changed their stance with us
				if (request.status === "accepted")
					request.status = "allianceBroken";
				else if (request.status !== "allianceBroken")
					request.status = "declinedRequest";
			}
			else if (gameState.sharedScript.playersData[evt.player].isAlly[PlayerID] && gameState.isPlayerEnemy(evt.player))
			{
				const response = request !== undefined && (request.status === "declinedRequest" || request.status === "allianceBroken") ?
					"decline" : "declineSuggestNeutral";
				chat.answerRequestDiplomacy(gameState, evt.player, "ally", response);
			}
			else if (gameState.sharedScript.playersData[evt.player].isAlly[PlayerID] && gameState.isPlayerNeutral(evt.player))
				this.handleDiplomacyRequest(gameState, evt.player, "ally");
			else if (gameState.sharedScript.playersData[evt.player].isNeutral[PlayerID] && gameState.isPlayerEnemy(evt.player))
				this.handleDiplomacyRequest(gameState, evt.player, "neutral");
		}

		// These events will only be sent by other AI players
		for (const evt of events.DiplomacyRequest)
		{
			if (evt.player !== PlayerID)
				continue;

			this.handleDiplomacyRequest(gameState, evt.source, evt.to);
			const request = this.receivedDiplomacyRequests.get(evt.source);
			if (this.Config.debug > 0)
			{
				aiWarn("Responding to diplomacy request from AI player " + evt.source + " with " +
					uneval(request));
			}

			// Our diplomacy will have changed already if the response was "accept"
			if (request.status === "waitingForTribute")
			{
				Engine.PostCommand(PlayerID, {
					"type": "tribute-request",
					"source": PlayerID,
					"player": evt.source,
					"resourceWanted": request.wanted,
					"resourceType": request.type
				});
			}
		}

		// An AI player we sent a diplomacy request to demanded we send them a tribute
		for (const evt of events.TributeRequest)
		{
			if (evt.player !== PlayerID)
				continue;

			const availableResources = gameState.ai.queueManager.getAvailableResources(gameState);
			// TODO: Save this event and wait until we get more resources if we don't have enough
			if (evt.resourceWanted < availableResources[evt.resourceType])
			{
				const responseTribute = {};
				responseTribute[evt.resourceType] = evt.resourceWanted;
				if (this.Config.debug > 0)
				{
					aiWarn("Responding to tribute request from AI player " + evt.source + " with " +
						uneval(responseTribute));
				}
				Engine.PostCommand(PlayerID, { "type": "tribute", "player": evt.source, "amounts": responseTribute });
				this.nextTributeUpdate = gameState.ai.elapsedTime + 15;
			}
		}
	}

	/**
	 * If the "Last Man Standing" option is enabled, check if the only remaining players are allies or neutral.
	 * If so, turn against the strongest first, but be more likely to first turn against neutral players, if there are any.
	 */
	lastManStandingCheck(gameState)
	{
		if (gameState.sharedScript.playersData[PlayerID].teamsLocked || gameState.isCeasefireActive() ||
		    gameState.getAlliedVictory() && gameState.hasAllies())
			return;

		if (gameState.hasEnemies())
		{
			this.waitingToBetray = false;
			return;
		}

		if (!gameState.hasAllies() && !gameState.hasNeutrals())
			return;

		// wait a bit before turning
		if (!this.waitingToBetray)
		{
			this.betrayLapseTime = gameState.ai.elapsedTime + randFloat(10, 110);
			this.waitingToBetray = true;
			return;
		}

		// do not turn against a player yet if we are not strong enough
		if (gameState.getOwnUnits().length < 50)
		{
			this.betrayLapseTime += 60;
			return;
		}

		let playerToTurnAgainst;
		let max = 0;

		// count the amount of entities remaining players have
		for (let i = 1; i < gameState.sharedScript.playersData.length; ++i)
		{
			if (i === PlayerID || gameState.ai.HQ.attackManager.defeated[i])
				continue;

			let turnFactor = gameState.getEntities(i).length;

			if (gameState.isPlayerNeutral(i)) // be more inclined to turn against neutral players
				turnFactor += this.betrayWeighting;

			if (gameState.getVictoryConditions().has("wonder"))
			{
				const wonder = gameState.getEnemyStructures(i).filter(filters.byClass("Wonder"))[0];
				if (wonder)
				{
					const wonderProgess = wonder.foundationProgress();
					if (wonderProgess === undefined)
					{
						playerToTurnAgainst = i;
						break;
					}
					turnFactor += wonderProgess * 2.5 + this.betrayWeighting;
				}
			}

			if (gameState.getVictoryConditions().has("capture_the_relic"))
			{
				const relicsCount = gameState.updatingGlobalCollection("allRelics",
					filters.byClass("Relic")).filter(relic => relic.owner() === i).length;
				turnFactor += relicsCount * this.betrayWeighting;
			}

			if (turnFactor < max)
				continue;

			max = turnFactor;
			playerToTurnAgainst = i;
		}

		if (playerToTurnAgainst)
		{
			this.changePlayerDiplomacy(gameState, playerToTurnAgainst, "enemy");
			const request = this.receivedDiplomacyRequests.get(playerToTurnAgainst);
			if (request && request.status !== "allianceBroken")
			{
				if (request.status === "waitingForTribute")
					chat.answerRequestDiplomacy(gameState, playerToTurnAgainst, request.requestType, "decline");
				request.status = request.status === "accepted" ? "allianceBroken" : "declinedRequest";
			}
			// If we had sent this player a diplomacy request, just rescind it
			this.sentDiplomacyRequests.delete(playerToTurnAgainst);
		}
		this.betrayLapseTime = -1;
		this.waitingToBetray = false;
	}

	/**
	 * Do not become allies with a player if the game would be over.
	 * Overall, be reluctant to become allies with any one player, but be more likely to accept neutral requests.
	 */
	handleDiplomacyRequest(gameState, player, requestType)
	{
		if (gameState.sharedScript.playersData[PlayerID].teamsLocked)
			return;
		let response;
		let requiredTribute;
		const request = this.receivedDiplomacyRequests.get(player);
		const moreEnemiesThanAllies = gameState.getEnemies().length > gameState.getMutualAllies().length;

		// For any given diplomacy request be likely to permanently decline
		if (!request && gameState.getPlayerCiv() !== gameState.getPlayerCiv(player) && randBool(0.6) ||
		    !moreEnemiesThanAllies || gameState.ai.HQ.attackManager.currentEnemyPlayer === player)
		{
			this.receivedDiplomacyRequests.set(player, { "requestType": requestType, "status": "declinedRequest" });
			response = "decline";
		}
		else if (request && request.status !== "accepted" && request.requestType !== "ally")
		{
			if (request.status === "declinedRequest")
				response = "decline";
			else if (request.status === "allianceBroken") // Previous alliance was broken, so decline
				response = "declineRepeatedOffer";
			else if (request.status === "waitingForTribute")
			{
				response = "waitingForTribute";
				requiredTribute = request;
			}
		}
		else if (requestType === "ally" && gameState.getEntities(player).length < gameState.getOwnEntities().length && randBool(0.4) ||
			   requestType === "neutral" && moreEnemiesThanAllies && randBool(0.8))
		{
			response = "accept";
			this.changePlayerDiplomacy(gameState, player, requestType);
			this.receivedDiplomacyRequests.set(player, { "requestType": requestType, "status": "accepted" });
		}
		else
		{
			// Try to request a tribute.
			// If a resource is not tributable, do not request it.
			// If no resources are tributable, decline.
			const resTribCodes = Resources.GetTributableCodes();
			if (resTribCodes.length)
			{
				requiredTribute = gameState.ai.HQ.pickMostNeededResources(gameState, resTribCodes)[0];
				response = "acceptWithTribute";
				requiredTribute.wanted = Math.max(1000, gameState.getOwnUnits().length * (requestType === "ally" ? 10 : 5));
				this.receivedDiplomacyRequests.set(player, {
					"status": "waitingForTribute",
					"wanted": requiredTribute.wanted,
					"type": requiredTribute.type,
					"warnTime": gameState.ai.elapsedTime + 60,
					"sentWarning": false,
					"requestType": requestType
				});
			}
			else
			{
				this.receivedDiplomacyRequests.set(player, { "requestType": requestType, "status": "declinedRequest" });
				response = "decline";
			}
		}
		chat.answerRequestDiplomacy(gameState, player, requestType, response, requiredTribute);
	}

	changePlayerDiplomacy(gameState, player, newDiplomaticStance)
	{
		if (gameState.isPlayerEnemy(player) && (newDiplomaticStance === "ally" || newDiplomaticStance === "neutral"))
			gameState.ai.HQ.attackManager.cancelAttacksAgainstPlayer(gameState, player);
		Engine.PostCommand(PlayerID, { "type": "diplomacy", "player": player, "to": newDiplomaticStance });
		if (this.Config.debug > 1)
			aiWarn("diplomacy stance with player " + player + " is now " + newDiplomaticStance);
		if (this.Config.chat)
			chat.newDiplomacy(gameState, player, newDiplomaticStance);
	}

	checkRequestedTributes(gameState)
	{
		for (const [player, data] of this.receivedDiplomacyRequests)
			if (data.status === "waitingForTribute" && gameState.ai.elapsedTime > data.warnTime)
			{
				if (data.sentWarning)
				{
					this.receivedDiplomacyRequests.delete(player);
					chat.answerRequestDiplomacy(gameState, player, data.requestType, "decline");
				}
				else
				{
					data.sentWarning = true;
					data.warnTime = gameState.ai.elapsedTime + 60;
					chat.answerRequestDiplomacy(gameState, player, data.requestType, "waitingForTribute", {
						"wanted": data.wanted,
						"type": data.type
					});
				}
			}
	}

	/**
	 * Try to become allies with a player who has a lot of mutual enemies in common with us.
	 * TODO: Possibly let human players demand tributes from AIs who send diplomacy requests.
	 */
	sendDiplomacyRequest(gameState)
	{
		let player;
		let max = 0;
		for (let i = 1; i < gameState.sharedScript.playersData.length; ++i)
		{
			let mutualEnemies = 0;
			const request = this.receivedDiplomacyRequests.get(i); // Do not send to players we have already rejected before
			if (i === PlayerID || gameState.isPlayerMutualAlly(i) || gameState.ai.HQ.attackManager.defeated[i] ||
			    gameState.ai.HQ.attackManager.currentEnemyPlayer === i ||
			    this.sentDiplomacyRequests.get(i) !== undefined || request && request.status === "declinedRequest")
				continue;

			for (let j = 1; j < gameState.sharedScript.playersData.length; ++j)
			{
				if (gameState.sharedScript.playersData[i].isEnemy[j] && gameState.isPlayerEnemy(j) &&
				    !gameState.ai.HQ.attackManager.defeated[j])
					++mutualEnemies;

				if (mutualEnemies < max)
					continue;

				max = mutualEnemies;
				player = i;
			}
		}
		if (!player)
			return;

		const requestType = gameState.isPlayerNeutral(player) ? "ally" : "neutral";

		this.sentDiplomacyRequests.set(player, {
			"requestType": requestType,
			"timeSent": gameState.ai.elapsedTime
		});

		if (this.Config.debug > 0)
			aiWarn("Sending diplomacy request to player " + player + " with " + requestType);
		Engine.PostCommand(PlayerID, { "type": "diplomacy-request", "source": PlayerID, "player": player, "to": requestType });
		chat.newRequestDiplomacy(gameState, player, requestType, "sendRequest");
	}

	checkSentDiplomacyRequests(gameState)
	{
		for (const [player, data] of this.sentDiplomacyRequests)
			if (gameState.ai.elapsedTime > data.timeSent + 60 && !gameState.ai.HQ.saveResources &&
			    gameState.getPopulation() > 70)
			{
				chat.newRequestDiplomacy(gameState, player, data.requestType, "requestExpired");
				this.sentDiplomacyRequests.delete(player);
			}
	}

	update(gameState, events)
	{
		this.checkEvents(gameState, events);

		if (Resources.GetTributableCodes().length && !gameState.ai.HQ.saveResources && gameState.ai.elapsedTime > this.nextTributeUpdate)
			this.tributes(gameState);

		if (this.waitingToBetray && gameState.ai.elapsedTime > this.betrayLapseTime)
			this.lastManStandingCheck(gameState);

		this.checkRequestedTributes(gameState);

		if (gameState.sharedScript.playersData[PlayerID].teamsLocked || gameState.isCeasefireActive())
			return;

		// Be unlikely to send diplomacy requests to other players
		if (gameState.ai.elapsedTime > this.sentDiplomacyRequestLapseTime)
		{
			this.sentDiplomacyRequestLapseTime = gameState.ai.elapsedTime + 300 + randFloat(10, 100);
			const numEnemies = gameState.getEnemies().length;
			// Don't consider gaia
			if (numEnemies > 2 && gameState.getMutualAllies().length < numEnemies - 1 && randBool(0.1))
				this.sendDiplomacyRequest(gameState);
		}

		this.checkSentDiplomacyRequests(gameState);
	}

	Serialize()
	{
		return {
			"nextTributeUpdate": this.nextTributeUpdate,
			"nextTributeRequest": this.nextTributeRequest,
			"betrayLapseTime": this.betrayLapseTime,
			"waitingToBetray": this.waitingToBetray,
			"betrayWeighting": this.betrayWeighting,
			"receivedDiplomacyRequests": this.receivedDiplomacyRequests,
			"sentDiplomacyRequests": this.sentDiplomacyRequests,
			"sentDiplomacyRequestLapseTime": this.sentDiplomacyRequestLapseTime
		};
	}

	Deserialize(data)
	{
		for (const key in data)
			this[key] = data[key];
	}
}
