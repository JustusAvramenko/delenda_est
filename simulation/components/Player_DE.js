/**
 * Which units will be shown with special icons at the top.
 */
var panelEntityClasses = "Hero Relic Minister"; // << THIS HAS CHANGED.

Player.prototype.Init = function()
{
	this.playerID = undefined;
	this.name = undefined;	// Define defaults elsewhere (supporting other languages).
	this.civ = undefined;
	this.color = undefined;
	this.diplomacyColor = undefined;
	this.displayDiplomacyColor = false;
	this.popUsed = 0; // Population of units owned or trained by this player.
	this.popBonuses = 0; // Sum of population bonuses of player's entities.
	this.maxPop = 500; // Maximum population.<< THIS HAS CHANGED.
	this.trainingBlocked = false; // Indicates whether any training queue is currently blocked.
	this.resourceCount = {};
	this.resourceGatherers = {};
	this.tradingGoods = []; // Goods for next trade-route and its probabilities * 100.
	this.team = -1;	// Team number of the player, players on the same team will always have ally diplomatic status. Also this is useful for team emblems, scoring, etc.
	this.teamsLocked = false;
	this.state = "active"; // Game state. One of "active", "defeated", "won".
	this.diplomacy = [];	// Array of diplomatic stances for this player with respect to other players (including gaia and self).
	this.sharedDropsites = false;
	this.formations = [];
	this.startCam = undefined;
	this.controlAllUnits = false;
	this.isAI = false;
	this.cheatsEnabled = false;
	this.panelEntities = [];
	this.resourceNames = {};
	this.disabledTemplates = {};
	this.disabledTechnologies = {};
	this.spyCostMultiplier = +this.template.SpyCostMultiplier;
	this.barterEntities = [];
	this.barterMultiplier = {
		"buy": clone(this.template.BarterMultiplier.Buy),
		"sell": clone(this.template.BarterMultiplier.Sell)
	};

	// Initial resources.
	let resCodes = Resources.GetCodes();
	for (let res of resCodes)
	{
		this.resourceCount[res] = 500; // << THIS HAS CHANGED.
		this.resourceNames[res] = Resources.GetResource(res).name;
		this.resourceGatherers[res] = 0;
	}
	// Trading goods probability in steps of 5.
	let resTradeCodes = Resources.GetTradableCodes();
	let quotient = Math.floor(20 / resTradeCodes.length);
	let remainder = 20 % resTradeCodes.length;
	for (let i in resTradeCodes)
		this.tradingGoods.push({
			"goods": resTradeCodes[i],
			"proba": 5 * (quotient + (+i < remainder ? 1 : 0))
		});
};
