/**
 * attack-move, changed PlaySound GuiInterfaceCall from order_move to order_attack
 */

var g_UnitActions =
{
	"move":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "walk",
				"entities": selection,
				"x": target.x,
				"z": target.z,
				"queued": queued,
				"pushFront": pushFront,
				"formation": g_AutoFormation.getDefault()
			});

			DrawTargetMarker(target);

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_walk",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!entState.unitAI)
				return false;
			return { "possible": true };
		},
		"hotkeyActionCheck": function(target, selection)
		{
			return Engine.HotkeyIsPressed("session.move") &&
				this.actionCheck(target, selection);
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("move", target, selection);
			return actionInfo.possible && {
				"type": "move",
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 12,
	},

	"attack-move":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			let targetClasses;
			if (Engine.HotkeyIsPressed("session.attackmoveUnit"))
				targetClasses = { "attack": ["Unit"] };
			else
				targetClasses = { "attack": ["Unit", "Structure"] };

			Engine.PostNetworkCommand({
				"type": "attack-walk",
				"entities": selection,
				"x": target.x,
				"z": target.z,
				"targetClasses": targetClasses,
				"queued": queued,
				"pushFront": pushFront,
				"formation": g_AutoFormation.getNull()
			});

			DrawTargetMarker(target);

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_attack",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!entState.unitAI)
				return false;
			return { "possible": true };
		},
		"hotkeyActionCheck": function(target, selection)
		{
			return isAttackMovePressed() &&
				this.actionCheck(target, selection);
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("attack-move", target, selection);
			return actionInfo.possible && {
				"type": "attack-move",
				"cursor": "action-attack-move",
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 30,
	},

	"capture":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "attack",
				"entities": selection,
				"target": action.target,
				"allowCapture": true,
				"queued": queued,
				"pushFront": pushFront,
				"formation": g_AutoFormation.getNull()
			});

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_attack",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!entState.attack || !targetState || !targetState.capturePoints)
				return false;

			return {
				"possible": Engine.GuiInterfaceCall("CanAttack", {
					"entity": entState.id,
					"target": targetState.id,
					"types": ["Capture"]
				})
			};
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("capture", target, selection);
			return actionInfo.possible && {
				"type": "capture",
				"cursor": "action-capture",
				"target": target,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 9,
	},

	"attack":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "attack",
				"entities": selection,
				"target": action.target,
				"queued": queued,
				"pushFront": pushFront,
				"allowCapture": false,
				"formation": g_AutoFormation.getNull()
			});

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_attack",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!entState.attack || !targetState || !targetState.hitpoints)
				return false;

			return {
				"possible": Engine.GuiInterfaceCall("CanAttack", {
					"entity": entState.id,
					"target": targetState.id,
					"types": ["!Capture"]
				})
			};
		},
		"hotkeyActionCheck": function(target, selection)
		{
			return Engine.HotkeyIsPressed("session.attack") &&
				this.actionCheck(target, selection);
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("attack", target, selection);
			return actionInfo.possible && {
				"type": "attack",
				"cursor": "action-attack",
				"target": target,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 10,
	},

	"call-to-arms": {
		"execute": function(target, action, selection, queued, pushFront)
		{
			let targetClasses;
			if (Engine.HotkeyIsPressed("session.attackmoveUnit"))
				targetClasses = { "attack": ["Unit"] };
			else
				targetClasses = { "attack": ["Unit", "Structure"] };
			Engine.PostNetworkCommand({
				"type": "call-to-arms",
				"entities": selection,
				"target": target,
				"targetClasses": targetClasses,
				"queued": queued,
				"pushFront": pushFront,
				"allowCapture": true,
				"formation": g_AutoFormation.getNull()
			});
			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			return { "possible": !!entState.unitAI };
		},
		"actionCheck": function(target, selection)
		{
			const actionInfo = getActionInfo("call-to-arms", target, selection);
			return actionInfo.possible && {
				"type": "call-to-arms",
				"cursor": "action-attack",
				"target": target,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"hotkeyActionCheck": function(target, selection)
		{
			return Engine.HotkeyIsPressed("session.calltoarms") &&
				this.actionCheck(target, selection);
		},
		"preSelectedActionCheck": function(target, selection)
		{
			return preSelectedAction == ACTION_CALLTOARMS &&
				this.actionCheck(target, selection);
		},
		"specificness": 50,
	},

	"patrol":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "patrol",
				"entities": selection,
				"x": target.x,
				"z": target.z,
				"target": action.target,
				"targetClasses": { "attack": g_PatrolTargets },
				"queued": queued,
				"allowCapture": false,
				"formation": g_AutoFormation.getDefault()
			});

			DrawTargetMarker(target);

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_patrol",
				"entity": action.firstAbleEntity
			});
			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!entState.unitAI || !entState.unitAI.canPatrol)
				return false;

			return { "possible": true };
		},
		"hotkeyActionCheck": function(target, selection)
		{
			return Engine.HotkeyIsPressed("session.patrol") &&
				this.actionCheck(target, selection);
		},
		"preSelectedActionCheck": function(target, selection)
		{
			return preSelectedAction == ACTION_PATROL &&
				this.actionCheck(target, selection);
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("patrol", target, selection);
			return actionInfo.possible && {
				"type": "patrol",
				"cursor": "action-patrol",
				"target": target,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 37,
	},

	"heal":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "heal",
				"entities": selection,
				"target": action.target,
				"queued": queued,
				"pushFront": pushFront,
				"formation": g_AutoFormation.getNull()
			});

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_heal",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!entState.heal || !targetState ||
			    !hasClass(targetState, "Unit") || !targetState.needsHeal ||
			    !playerCheck(entState, targetState, ["Player", "Ally"]) ||
			    entState.id == targetState.id) // Healers can't heal themselves.
				return false;

			let unhealableClasses = entState.heal.unhealableClasses;
			if (MatchesClassList(targetState.identity.classes, unhealableClasses))
				return false;

			let healableClasses = entState.heal.healableClasses;
			if (!MatchesClassList(targetState.identity.classes, healableClasses))
				return false;

			return { "possible": true };
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("heal", target, selection);
			return actionInfo.possible && {
				"type": "heal",
				"cursor": "action-heal",
				"target": target,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 7,
	},

	// "Fake" action to check if an entity can be ordered to "construct"
	// which is handled differently from repair as the target does not exist.
	"construct":
	{
		"preSelectedActionCheck": function(target, selection)
		{
			let state = GetEntityState(selection[0]);
			if (state && state.builder &&
			        target && target.constructor && target.constructor.name == "PlacementSupport")
				return { "type": "construct" };
			return false;
		},
		"specificness": 0,
	},

	"repair":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "repair",
				"entities": selection,
				"target": action.target,
				"autocontinue": true,
				"queued": queued,
				"pushFront": pushFront,
				"formation": g_AutoFormation.getNull()
			});

			Engine.GuiInterfaceCall("PlaySound", {
				"name": action.foundation ? "order_build" : "order_repair",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!entState.builder || !targetState ||
			    !targetState.needsRepair && !targetState.foundation ||
			    !playerCheck(entState, targetState, ["Player", "Ally"]))
				return false;

			return {
				"possible": true,
				"foundation": targetState.foundation
			};
		},
		"preSelectedActionCheck": function(target, selection)
		{
			return preSelectedAction == ACTION_REPAIR && (this.actionCheck(target, selection) || {
				"type": "none",
				"cursor": "action-repair-disabled",
				"target": null
			});
		},
		"hotkeyActionCheck": function(target, selection)
		{
			return Engine.HotkeyIsPressed("session.repair") &&
				this.actionCheck(target, selection);
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("repair", target, selection);
			return actionInfo.possible && {
				"type": "repair",
				"cursor": "action-repair",
				"target": target,
				"foundation": actionInfo.foundation,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 11,
	},

	"gather":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "gather",
				"entities": selection,
				"target": action.target,
				"queued": queued,
				"pushFront": pushFront,
				"formation": g_AutoFormation.getNull()
			});

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_gather",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!entState.resourceGatherRates ||
				!targetState || !targetState.resourceSupply)
				return false;

			let resource;
			if (entState.resourceGatherRates[targetState.resourceSupply.type.generic + "." + targetState.resourceSupply.type.specific])
				resource = targetState.resourceSupply.type.specific;
			else if (entState.resourceGatherRates[targetState.resourceSupply.type.generic])
				resource = targetState.resourceSupply.type.generic;
			if (!resource)
				return false;

			return {
				"possible": true,
				"cursor": "action-gather-" + resource
			};
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("gather", target, selection);
			return actionInfo.possible && {
				"type": "gather",
				"cursor": actionInfo.cursor,
				"target": target,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 1,
	},

	"returnresource":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "returnresource",
				"entities": selection,
				"target": action.target,
				"queued": queued,
				"pushFront": pushFront,
				"formation": g_AutoFormation.getNull()
			});

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_gather",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!targetState || !targetState.resourceDropsite)
				return false;

			let playerState = GetSimState().players[entState.player];
			if (playerState.hasSharedDropsites && targetState.resourceDropsite.shared)
			{
				if (!playerCheck(entState, targetState, ["Player", "MutualAlly"]))
					return false;
			}
			else if (!playerCheck(entState, targetState, ["Player"]))
				return false;

			if (!entState.resourceCarrying || !entState.resourceCarrying.length)
				return false;

			let carriedType = entState.resourceCarrying[0].type;
			if (targetState.resourceDropsite.types.indexOf(carriedType) == -1)
				return false;

			return {
				"possible": true,
				"cursor": "action-return-" + carriedType
			};
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("returnresource", target, selection);
			return actionInfo.possible && {
				"type": "returnresource",
				"cursor": actionInfo.cursor,
				"target": target,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 2,
	},

	"cancel-setup-trade-route":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "cancel-setup-trade-route",
				"entities": selection,
				"target": action.target,
				"queued": queued
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!targetState || targetState.foundation || !entState.trader || !targetState.market ||
			    playerCheck(entState, targetState, ["Enemy"]) ||
			    !(targetState.market.land && hasClass(entState, "Organic") ||
			      targetState.market.naval && hasClass(entState, "Ship")))
				return false;

			let tradingDetails = Engine.GuiInterfaceCall("GetTradingDetails", {
				"trader": entState.id,
				"target": targetState.id
			});

			if (!tradingDetails || !tradingDetails.type)
				return false;

			if (tradingDetails.type == "is first" && !tradingDetails.hasBothMarkets)
				return {
					"possible": true,
					"tooltip": translate("This is the origin trade market.\nRight-click to cancel trade route.")
				};
			return false;
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("cancel-setup-trade-route", target, selection);
			return actionInfo.possible && {
				"type": "cancel-setup-trade-route",
				"cursor": "action-cancel-setup-trade-route",
				"tooltip": actionInfo.tooltip,
				"target": target,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 2,
	},

	"setup-trade-route":
	{
		"execute": function(target, action, selection, queued)
		{
			Engine.PostNetworkCommand({
				"type": "setup-trade-route",
				"entities": selection,
				"target": action.target,
				"source": null,
				"route": null,
				"queued": queued,
				"formation": g_AutoFormation.getNull()
			});

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_trade",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!targetState || targetState.foundation || !entState.trader || !targetState.market ||
			    playerCheck(entState, targetState, ["Enemy"]) ||
			    !(targetState.market.land && hasClass(entState, "Organic") ||
			      targetState.market.naval && hasClass(entState, "Ship")))
				return false;

			let tradingDetails = Engine.GuiInterfaceCall("GetTradingDetails", {
				"trader": entState.id,
				"target": targetState.id
			});

			if (!tradingDetails)
				return false;

			let tooltip;
			switch (tradingDetails.type)
			{
			case "is first":
				tooltip = translate("Origin trade market.") + "\n";
				if (tradingDetails.hasBothMarkets)
					tooltip += sprintf(translate("Gain: %(gain)s"), {
						"gain": getTradingTooltip(tradingDetails.gain)
					});
				else
					return false;
				break;

			case "is second":
				tooltip = translate("Destination trade market.") + "\n" +
					sprintf(translate("Gain: %(gain)s"), {
						"gain": getTradingTooltip(tradingDetails.gain)
					});
				break;

			case "set first":
				tooltip = translate("Right-click to set as origin trade market");
				break;

			case "set second":
				if (tradingDetails.gain.traderGain == 0)
					return {
						"possible": true,
						"tooltip": setStringTags(translate("This market is too close to the origin market."), g_DisabledTags),
						"disabled": true
					};

				tooltip = translate("Right-click to set as destination trade market.") + "\n" +
					sprintf(translate("Gain: %(gain)s"), {
						"gain": getTradingTooltip(tradingDetails.gain)
					});
				break;
			}

			return {
				"possible": true,
				"tooltip": tooltip
			};
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("setup-trade-route", target, selection);
			if (actionInfo.disabled)
				return {
					"type": "none",
					"cursor": "action-setup-trade-route-disabled",
					"target": null,
					"tooltip": actionInfo.tooltip
				};

			return actionInfo.possible && {
				"type": "setup-trade-route",
				"cursor": "action-setup-trade-route",
				"tooltip": actionInfo.tooltip,
				"target": target,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 0,
	},

	"occupy-turret":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "occupy-turret",
				"entities": selection,
				"target": action.target,
				"queued": queued,
				"pushFront": pushFront,
				"formation": g_AutoFormation.getNull()
			});

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_garrison",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!entState.turretable || !targetState || !targetState.turretHolder ||
			    !playerCheck(entState, targetState, ["Player", "MutualAlly"]))
				return false;

			if (!targetState.turretHolder.turretPoints.find(point =>
				!point.allowedClasses || MatchesClassList(entState.identity.classes, point.allowedClasses)))
				return false;

			let occupiedTurrets = targetState.turretHolder.turretPoints.filter(point => point.entity != null);
			let tooltip = sprintf(translate("Current turrets: %(occupied)s/%(capacity)s"), {
				"occupied": occupiedTurrets.length,
				"capacity": targetState.turretHolder.turretPoints.length
			});

			if (occupiedTurrets.length == targetState.turretHolder.turretPoints.length)
				tooltip = coloredText(tooltip, "orange");

			return {
				"possible": true,
				"tooltip": tooltip
			};
		},
		"preSelectedActionCheck": function(target, selection)
		{
			return preSelectedAction == ACTION_OCCUPY_TURRET && (this.actionCheck(target, selection) || {
				"type": "none",
				"cursor": "action-occupy-turret-disabled",
				"target": null
			});
		},
		"hotkeyActionCheck": function(target, selection)
		{
			return Engine.HotkeyIsPressed("session.occupyturret") &&
				this.actionCheck(target, selection);
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("occupy-turret", target, selection);
			return actionInfo.possible && {
				"type": "occupy-turret",
				"cursor": "action-occupy-turret",
				"tooltip": actionInfo.tooltip,
				"target": target,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 21,
	},

	"garrison":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "garrison",
				"entities": selection,
				"target": action.target,
				"queued": queued,
				"pushFront": pushFront,
				"formation": g_AutoFormation.getNull()
			});

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_garrison",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!entState.garrisonable || !targetState || !targetState.garrisonHolder ||
			    !playerCheck(entState, targetState, ["Player", "MutualAlly"]))
				return false;

			let tooltip = sprintf(translate("Current garrison: %(garrisoned)s/%(capacity)s"), {
				"garrisoned": targetState.garrisonHolder.occupiedSlots,
				"capacity": targetState.garrisonHolder.capacity
			});

			let extraCount = entState.garrisonable.size;
			if (entState.garrisonHolder)
				extraCount += entState.garrisonHolder.occupiedSlots;

			if (targetState.garrisonHolder.occupiedSlots + extraCount > targetState.garrisonHolder.capacity)
				tooltip = coloredText(tooltip, "orange");

			if (!MatchesClassList(entState.identity.classes, targetState.garrisonHolder.allowedClasses))
				return false;

			return {
				"possible": true,
				"tooltip": tooltip
			};
		},
		"preSelectedActionCheck": function(target, selection)
		{
			return preSelectedAction == ACTION_GARRISON && (this.actionCheck(target, selection) || {
				"type": "none",
				"cursor": "action-garrison-disabled",
				"target": null
			});
		},
		"hotkeyActionCheck": function(target, selection)
		{
			return Engine.HotkeyIsPressed("session.garrison") &&
				this.actionCheck(target, selection);

		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("garrison", target, selection);
			return actionInfo.possible && {
				"type": "garrison",
				"cursor": "action-garrison",
				"tooltip": actionInfo.tooltip,
				"target": target,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 20,
	},

	"guard":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "guard",
				"entities": selection,
				"target": action.target,
				"queued": queued,
				"pushFront": pushFront,
				"formation": g_AutoFormation.getNull()
			});

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_guard",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!targetState || !targetState.guard || entState.id == targetState.id ||
			    !playerCheck(entState, targetState, ["Player", "Ally"]) ||
			    !entState.unitAI || !entState.unitAI.canGuard)
				return false;

			return { "possible": true };
		},
		"preSelectedActionCheck": function(target, selection)
		{
			return preSelectedAction == ACTION_GUARD && (this.actionCheck(target, selection) || {
				"type": "none",
				"cursor": "action-guard-disabled",
				"target": null
			});
		},
		"hotkeyActionCheck": function(target, selection)
		{
			return Engine.HotkeyIsPressed("session.guard") &&
				this.actionCheck(target, selection);
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("guard", target, selection);
			return actionInfo.possible && {
				"type": "guard",
				"cursor": "action-guard",
				"target": target,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 40,
	},

	"collect-treasure":
	{
		"execute": function(target, action, selection, queued)
		{
			Engine.PostNetworkCommand({
				"type": "collect-treasure",
				"entities": selection,
				"target": action.target,
				"queued": queued,
				"formation": g_AutoFormation.getNull()
			});

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_collect_treasure",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!entState.treasureCollector ||
				!targetState || !targetState.treasure)
				return false;

			return {
				"possible": true,
				"cursor": "action-collect-treasure"
			};
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("collect-treasure", target, selection);
			return actionInfo.possible && {
				"type": "collect-treasure",
				"cursor": actionInfo.cursor,
				"target": target,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 1,
	},

	"remove-guard":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "remove-guard",
				"entities": selection,
				"target": action.target,
				"queued": queued,
				"pushFront": pushFront
			});

			Engine.GuiInterfaceCall("PlaySound", {
				"name": "order_guard",
				"entity": action.firstAbleEntity
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!entState.unitAI || !entState.unitAI.isGuarding)
				return false;
			return { "possible": true };
		},
		"hotkeyActionCheck": function(target, selection)
		{
			return Engine.HotkeyIsPressed("session.guard") &&
				this.actionCheck(target, selection);
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("remove-guard", target, selection);
			return actionInfo.possible && {
				"type": "remove-guard",
				"cursor": "action-remove-guard",
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 41,
	},

	"set-rallypoint":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			// if there is a position set in the action then use this so that when setting a
			// rally point on an entity it is centered on that entity
			if (action.position)
				target = action.position;

			Engine.PostNetworkCommand({
				"type": "set-rallypoint",
				"entities": selection,
				"x": target.x,
				"z": target.z,
				"data": action.data,
				"queued": queued
			});

			// Display rally point at the new coordinates, to avoid display lag
			Engine.GuiInterfaceCall("DisplayRallyPoint", {
				"entities": selection,
				"x": target.x,
				"z": target.z,
				"queued": queued
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!entState.rallyPoint)
				return false;

			// Don't allow the rally point to be set on any of the currently selected entities (used for unset)
			// except if the autorallypoint hotkey is pressed and the target can produce entities.
			if (targetState && (!Engine.HotkeyIsPressed("session.autorallypoint") ||
			    !targetState.trainer ||
			    !targetState.trainer.entities.length))
				for (const ent of g_Selection.toList())
					if (targetState.id == ent)
						return false;

			let tooltip;
			let disabled = false;
			// default to walking there (or attack-walking if hotkey pressed)
			let data = { "command": "walk" };
			let cursor = "";

			if (isAttackMovePressed())
			{
				let targetClasses;
				if (Engine.HotkeyIsPressed("session.attackmoveUnit"))
					targetClasses = { "attack": ["Unit"] };
				else
					targetClasses = { "attack": ["Unit", "Structure"] };

				data.command = "attack-walk";
				data.targetClasses = targetClasses;
				cursor = "action-attack-move";
			}

			if (Engine.HotkeyIsPressed("session.repair") && targetState &&
			    (targetState.needsRepair || targetState.foundation) &&
			    playerCheck(entState, targetState, ["Player", "Ally"]))
			{
				data.command = "repair";
				data.target = targetState.id;
				cursor = "action-repair";
			}
			else if (targetState && targetState.garrisonHolder &&
			    playerCheck(entState, targetState, ["Player", "MutualAlly"]))
			{
				data.command = "garrison";
				data.target = targetState.id;
				cursor = "action-garrison";

				tooltip = sprintf(translate("Current garrison: %(garrisoned)s/%(capacity)s"), {
					"garrisoned": targetState.garrisonHolder.occupiedSlots,
					"capacity": targetState.garrisonHolder.capacity
				});

				if (targetState.garrisonHolder.occupiedSlots >=
				    targetState.garrisonHolder.capacity)
					tooltip = coloredText(tooltip, "orange");
			}
			else if (targetState && targetState.turretHolder &&
			    playerCheck(entState, targetState, ["Player", "MutualAlly"]))
			{
				data.command = "occupy-turret";
				data.target = targetState.id;
				cursor = "action-garrison";

				let occupiedTurrets = targetState.turretHolder.turretPoints.filter(point => point.entity != null);
				tooltip = sprintf(translate("Current turrets: %(occupied)s/%(capacity)s"), {
					"occupied": occupiedTurrets.length,
					"capacity": targetState.turretHolder.turretPoints.length
				});

				if (occupiedTurrets.length >= targetState.turretHolder.turretPoints.length)
					tooltip = coloredText(tooltip, "orange");
			}
			else if (targetState && targetState.resourceSupply)
			{
				let resourceType = targetState.resourceSupply.type;
				cursor = "action-gather-" + resourceType.specific;

				data.command = "gather-near-position";
				data.resourceType = resourceType;
				data.resourceTemplate = targetState.template;
				if (!targetState.speed)
				{
					data.command = "gather";
					data.target = targetState.id;
				}
			}
			else if (targetState && targetState.treasure)
			{
				cursor = "action-collect-treasure";
				data.command = "collect-treasure-near-position";
				if (!targetState.speed)
				{
					data.command = "collect-treasure";
					data.target = targetState.id;
				}
			}
			else if (entState.market && targetState && targetState.market &&
			         entState.id != targetState.id &&
			         (!entState.market.naval || targetState.market.naval) &&
			         !playerCheck(entState, targetState, ["Enemy"]))
			{
				// Find a trader (if any) that this structure can train.
				let trader;
				if (entState.trainer?.entities?.length)
					for (let i = 0; i < entState.trainer.entities.length; ++i)
						if ((trader = GetTemplateData(entState.trainer.entities[i]).trader))
							break;

				let traderData = {
					"firstMarket": entState.id,
					"secondMarket": targetState.id,
					"template": trader
				};

				let gain = Engine.GuiInterfaceCall("GetTradingRouteGain", traderData);
				if (gain)
				{
					data.command = "trade";
					data.target = traderData.secondMarket;
					data.source = traderData.firstMarket;
					cursor = "action-setup-trade-route";

					if (gain.traderGain)
						tooltip = translate("Right-click to establish a default route for new traders.") + "\n" +
							sprintf(
								trader ?
									translate("Gain: %(gain)s") :
									translate("Expected gain: %(gain)s"),
								{ "gain": getTradingTooltip(gain) });
					else
					{
						disabled = true;
						tooltip = setStringTags(translate("This market is too close to the origin market."), g_DisabledTags);
						cursor = "action-setup-trade-route-disabled";
					}
				}
			}
			else if (targetState && (targetState.needsRepair || targetState.foundation) && playerCheck(entState, targetState, ["Ally"]))
			{
				data.command = "repair";
				data.target = targetState.id;
				cursor = "action-repair";
			}
			else if (targetState && playerCheck(entState, targetState, ["Enemy"]))
			{
				data.target = targetState.id;
				data.command = "attack";
				cursor = "action-attack";
			}

			return {
				"possible": true,
				"data": data,
				"position": targetState && targetState.position,
				"cursor": cursor,
				"disabled": disabled,
				"tooltip": tooltip
			};

		},
		"hotkeyActionCheck": function(target, selection)
		{
			// Hotkeys are checked in the actionInfo.
			return this.actionCheck(target, selection);
		},
		"actionCheck": function(target, selection)
		{
			// We want commands to units take precedence.
			if (selection.some(ent => {
				let entState = GetEntityState(ent);
				return entState && !!entState.unitAI;
			}))
				return false;

			let actionInfo = getActionInfo("set-rallypoint", target, selection);
			if (actionInfo.disabled)
				return {
					"type": "none",
					"cursor": actionInfo.cursor,
					"target": null,
					"tooltip": actionInfo.tooltip
				};

			return actionInfo.possible && {
				"type": "set-rallypoint",
				"cursor": actionInfo.cursor,
				"data": actionInfo.data,
				"tooltip": actionInfo.tooltip,
				"position": actionInfo.position,
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 6,
	},

	"unset-rallypoint":
	{
		"execute": function(target, action, selection, queued, pushFront)
		{
			Engine.PostNetworkCommand({
				"type": "unset-rallypoint",
				"entities": selection
			});

			// Remove displayed rally point
			Engine.GuiInterfaceCall("DisplayRallyPoint", {
				"entities": []
			});

			return true;
		},
		"getActionInfo": function(entState, targetState)
		{
			if (!targetState ||
				entState.id != targetState.id || entState.unitAI ||
				!entState.rallyPoint || !entState.rallyPoint.position)
				return false;

			return { "possible": true };
		},
		"actionCheck": function(target, selection)
		{
			let actionInfo = getActionInfo("unset-rallypoint", target, selection);
			return actionInfo.possible && {
				"type": "unset-rallypoint",
				"cursor": "action-unset-rally",
				"firstAbleEntity": actionInfo.entity
			};
		},
		"specificness": 11,
	},

	// This is a "fake" action to show a failure cursor
	// when only uncontrollable entities are selected.
	"uncontrollable":
	{
		"execute": function(target, action, selection, queued)
		{
			return true;
		},
		"actionCheck": function(target, selection)
		{
			// Only show this action if all entities are marked uncontrollable.
			let playerState = g_SimState.players[g_ViewedPlayer];
			if (playerState && playerState.controlsAll || selection.some(ent => {
				let entState = GetEntityState(ent);
				return entState && entState.identity && entState.identity.controllable;
			}))
				return false;

			return {
				"type": "none",
				"cursor": "cursor-no",
				"tooltip": translatePlural("This entity cannot be controlled.", "These entities cannot be controlled.", selection.length)
			};
		},
		"specificness": 100,
	},

	"none":
	{
		"execute": function(target, action, selection, queued)
		{
			return true;
		},
		"specificness": 100,
	},
};
