GameSettingControls.AlliedView = class AlliedView extends GameSettingControlCheckbox
{
	constructor(...args)
	{
		super(...args);
		g_GameSettings.mapExploration.watch(() => this.render(), ["allied"]);
		g_GameSettings.map.watch(() => this.render(), ["type"]);
		this.render();
	}

	render()
	{
		this.setEnabled(g_GameSettings.map.type != "scenario");
		this.setChecked(g_GameSettings.mapExploration.allied);
	}

	onPress(checked)
	{
		g_GameSettings.mapExploration.setAllied(checked);
		this.gameSettingsController.setNetworkInitAttributes();
	}
};

GameSettingControls.AlliedView.prototype.TitleCaption =
	translate("Allied View");

GameSettingControls.AlliedView.prototype.Tooltip =
	translate("Toggle allied view (see what your allies see).");
