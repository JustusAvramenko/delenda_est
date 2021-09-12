{
	let initOld = GameSettings.prototype.Attributes.MapExploration.prototype.init;
	GameSettings.prototype.Attributes.MapExploration.prototype.init = function () {
		initOld.call(this);
		this.allied = false;
	}

	let toInitAttributesOld = GameSettings.prototype.Attributes.MapExploration.prototype.toInitAttributes;
	GameSettings.prototype.Attributes.MapExploration.prototype.toInitAttributes = function (attribs) {
		toInitAttributesOld.call(this, attribs);
		attribs.settings.AllyView = this.allied;
	}

	let fromInitAttributesOld = GameSettings.prototype.Attributes.MapExploration.prototype.fromInitAttributes;
	GameSettings.prototype.Attributes.MapExploration.prototype.fromInitAttributes = function (attribs) {
		fromInitAttributesOld.call(this, attribs);
		this.allied = !!this.getLegacySetting(attribs, "AllyView");
	}

	let onMapChangeOld = GameSettings.prototype.Attributes.MapExploration.prototype.onMapChange;
	GameSettings.prototype.Attributes.MapExploration.prototype.onMapChange = function (mapData) {
		onMapChangeOld.call(this, mapData);
		this.setRevealed(this.getMapSetting("AllyView"));
	}

	let setRevealedOld = GameSettings.prototype.Attributes.MapExploration.prototype.setRevealed;
	GameSettings.prototype.Attributes.MapExploration.prototype.setRevealed = function (enabled) {
		setRevealedOld.call(this, enabled);
		this.allied = this.allied || enabled;
	}

	GameSettings.prototype.Attributes.MapExploration.prototype.setAllied = function (enabled) {
		this.allied = enabled;
		this.revealed = this.revealed && this.allied;
	}

}
