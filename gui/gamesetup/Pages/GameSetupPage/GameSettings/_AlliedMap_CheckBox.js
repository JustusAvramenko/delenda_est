// This needs loading before GameSettingsLayout, so filename begins with "_".
GameSettingControls.AlliedMap = class extends GameSettingControlCheckbox
{
	onMapChange(mapData)
	{
		let mapValue =
			mapData &&
			mapData.settings &&
			mapData.settings.AllyMap || undefined;

		if (mapValue !== undefined && mapValue != g_GameAttributes.settings.AllyMap)
		{
			g_GameAttributes.settings.AllyMap = mapValue;
			this.gameSettingsControl.updateGameAttributes();
		}
	}

	onGameAttributesChange()
	{
		if (!g_GameAttributes.mapType)
			return;

		if (g_GameAttributes.settings.AllyMap === undefined)
		{
			g_GameAttributes.settings.AllyMap = !!g_GameAttributes.settings.RevealMap;
			this.gameSettingsControl.updateGameAttributes();
		}
		else if (g_GameAttributes.settings.RevealMap &&
		    !g_GameAttributes.settings.AllyMap)
		{
			g_GameAttributes.settings.AllyMap = true;
			this.gameSettingsControl.updateGameAttributes();
		}
	}

	onGameAttributesBatchChange()
	{
		if (!g_GameAttributes.mapType)
			return;

		this.setChecked(g_GameAttributes.settings.AllyMap);
		this.setEnabled(g_GameAttributes.mapType != "scenario" && !g_GameAttributes.settings.RevealMap);
	}

	onPress(checked)
	{
		g_GameAttributes.settings.AllyMap = checked;
		this.gameSettingsControl.updateGameAttributes();
		this.gameSettingsControl.setNetworkGameAttributes();
	}
};

GameSettingControls.AlliedMap.prototype.TitleCaption =
	// Translation: Make sure to differentiate between the revealed map and  settings!
	translate("Allied Vision");

GameSettingControls.AlliedMap.prototype.Tooltip =
	// Translation: Make sure to differentiate between the revealed map and  settings!
	translate("Toggle allied vision (see what your allies see without researching Cartography).");
