/**
 * Stores civ settings for all players.
 */
GameSettings.prototype.Attributes.PlayerCiv = class PlayerCiv extends GameSetting
{
	init()
	{
		// NB: watchers aren't auto-triggered when modifying array elements.
		this.values = [];
		this.locked = [];
		this.settings.playerCount.watch(() => this.maybeUpdate(), ["nbPlayers"]);
		this.settings.map.watch(() => this.onMapChange(), ["map"]);
	}

	toInitAttributes(attribs)
	{
		if (!attribs.settings.PlayerData)
			attribs.settings.PlayerData = [];
		while (attribs.settings.PlayerData.length < this.values.length)
			attribs.settings.PlayerData.push({});
		for (let i in this.values)
			if (this.values[i])
				attribs.settings.PlayerData[i].Civ = this.values[i];
	}

	fromInitAttributes(attribs)
	{
		if (!this.getLegacySetting(attribs, "PlayerData"))
			return;
		let pData = this.getLegacySetting(attribs, "PlayerData");
		if (this.values.length < pData.length)
			this._resize(pData.length);
		for (let i in pData)
			if (pData[i] && pData[i].Civ)
				this.setValue(i, pData[i].Civ);
	}

	_resize(nb)
	{
		while (this.values.length > nb)
		{
			this.values.pop();
			this.locked.pop();
		}
		while (this.values.length < nb)
		{
			this.values.push("random");
			this.locked.push(false);
		}
	}

	onMapChange()
	{
		// Reset.
		if (this.settings.map.type == "scenario" ||
			this.getMapSetting("PlayerData") &&
			this.getMapSetting("PlayerData").some(data => data && data.Civ))
		{
			this._resize(0);
			this.maybeUpdate();
		}
		else
		{
			this.locked = this.locked.map(x => false);
			this.trigger("locked");
		}
	}

	maybeUpdate()
	{
		this._resize(this.settings.playerCount.nbPlayers);
		this.values.forEach((c, i) => this._set(i, c));
		this.trigger("values");
	}

	pickRandomItems()
	{
		const civs = Object.keys(this.settings.civData).filter(civ => this.settings.civData[civ].SelectableInGameSetup);

		let picked = false;
		for (let i in this.values)
		{
			let [randomId, randomCivCode] = this.values[i].split('.');
			if (randomId !== 'random')
				continue;
			picked = true;

			if (randomCivCode)
			{
				// TODO: check if array.find works with 0ad javascript engine
				let civGroup = g_RandomCivGroups.find((group) => group.Code === randomCivCode);
				if (civGroup)
				{
					let sumWeights = (() => {
						let val = 0;
						for (let key in civGroup.Weights)
							val += civGroup.Weights[key];
						return val;
					})();
					let choiceVal = sumWeights * Math.random();
					for (let civ in civGroup.Weights) {
						if (civGroup.Weights[civ] >= choiceVal) {
							this.values[i] = civ;
							break;
						}
						choiceVal -= civGroup.Weights[civ];
					}// end for civ
					continue;
				}
			}

			this.values[i] = pickRandom(civs);

		}
		if (picked)
			this.trigger("values");

		return picked;
	}

	_getMapData(i)
	{
		let data = this.settings.map.data;
		if (!data || !data.settings || !data.settings.PlayerData)
			return undefined;
		if (data.settings.PlayerData.length <= i)
			return undefined;
		return data.settings.PlayerData[i].Civ;
	}

	_set(playerIndex, value)
	{
		let map = this._getMapData(playerIndex);
		if (!!map)
		{
			this.values[playerIndex] = map;
			this.locked[playerIndex] = true;
		}
		else
		{
			this.values[playerIndex] = value;
			this.locked[playerIndex] = this.settings.map.type == "scenario";
		}
	}

	setValue(playerIndex, val)
	{
		this._set(playerIndex, val);
		this.trigger("values");
	}

	swap(sourceIndex, targetIndex)
	{
		[this.values[sourceIndex], this.values[targetIndex]] = [this.values[targetIndex], this.values[sourceIndex]];
		[this.locked[sourceIndex], this.locked[targetIndex]] = [this.locked[targetIndex], this.locked[sourceIndex]];
		this.trigger("values");
	}
};
