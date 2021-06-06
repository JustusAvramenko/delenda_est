{
	let registerWatchersOld = GameDescription.prototype.registerWatchers;
	GameDescription.prototype.registerWatchers = function () {
		registerWatchersOld.call(this);
		let update = () => this.updateGameDescription();
		g_GameSettings.mapExploration.watch(update, ["allied"]);
	}
}
