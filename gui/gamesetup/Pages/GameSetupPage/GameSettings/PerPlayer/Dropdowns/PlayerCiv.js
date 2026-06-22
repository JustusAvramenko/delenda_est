PlayerSettingControls.PlayerCiv = class PlayerCiv extends GameSettingControlDropdown
{
    constructor(...args)
    {
        super(...args);

        g_GameSettings.playerCiv.watch(() => this.rebuild(), ["values", "locked"]);

        this.items = this.getItems(false);
        this.allItems = this.getItems(true);
        this.wasLocked = undefined;
        this.values = prepareForDropdown(this.items);

        this.rebuild();
    }

    setControl()
    {
        this.label = Engine.GetGUIObjectByName("playerCivText[" + this.playerIndex + "]");
        this.dropdown = Engine.GetGUIObjectByName("playerCiv[" + this.playerIndex + "]");
		this.browserButton = Engine.TryGetGUIObjectByName("playerCivBrowser[" + this.playerIndex + "]");
		if (this.browserButton)
		{
			this.browserButton.onPress =
				this.openCivBrowser.bind(this);
		}
    }

	openCivBrowser()
	{

		let page =
			g_SetupWindow.pages.CivBrowserPage;

		if (!page)
		{
			error("CivBrowserPage Not Found");
			return;
		}

		page.selectedPlayer =
			this.playerIndex;

		page.openPage(true);
	}

    onHoverChange()
	{
		const hovered = this.dropdown.hovered;
		this.dropdown.tooltip =
			this.values && this.values.tooltip[hovered] !== undefined ?
				this.values.tooltip[hovered] :
				this.Tooltip;
	}

    rebuild()
	{
		const isLocked = g_GameSettings.playerCiv.locked[this.playerIndex] || this.isSavedGame;
		if (this.wasLocked !== isLocked)
		{
			this.wasLocked = isLocked;
			this.values = prepareForDropdown(isLocked ? this.allItems : this.items);

			this.dropdown.list = this.values.name;
			this.dropdown.list_data = this.values.civ;

			if (!isLocked && g_IsController)
			{
				const current = g_GameSettings.playerCiv.values[this.playerIndex];
				if (current && !this.values.civ.includes(current))
					this.onSelectionChange(0);
			}
		}

		this.render();
	}

    render()
	{
		const isLocked = g_GameSettings.playerCiv.locked[this.playerIndex] || this.isSavedGame;
		this.setEnabled(!isLocked);
		this.setSelectedValue(g_GameSettings.playerCiv.values[this.playerIndex]);
	}

    getItems(allItems)
    {
        const values = [];

        for (const civ in g_CivData)
            if (allItems || g_CivData[civ].SelectableInGameSetup)
                values.push({
                    "name": g_CivData[civ].Name,
                    "autocomplete": g_CivData[civ].Name,
                    "tooltip": g_CivData[civ].History,
                    "civ": civ,
                    "random": false
                });

        values.sort(sortNameIgnoreCase);

        let random_civ_groups = g_RandomCivGroups.map((group) => ({
            'name': setStringTags('Random/' + group.Title,
                group.Color ? { "color": group.Color } : this.RandomItemTags),
            'civ': sprintf('random.%s', group.Code),
            'autocomplete': group.Title,
            'tooltip': group.Tooltip,
            'gui_order': group.GUIOrder,
            'random': true
        })).sort((a, b) => a.gui_order - b.gui_order);

        values.unshift(... random_civ_groups);

        values.unshift({
            "name": setStringTags(this.RandomCivCaption, this.RandomItemTags),
            "autocomplete": this.RandomCivCaption,
            "tooltip": this.RandomCivTooltip,
            "civ": this.RandomCivId,
            'random': true
        });

        return values;
    }

    getAutocompleteEntries()
    {
        return this.values.autocomplete;
    }

    onSelectionChange(itemIdx)
	{
		if (!this.values || !this.values.civ || itemIdx < 0 || itemIdx >= this.values.civ.length)
			return;

		g_GameSettings.playerCiv.setValue(this.playerIndex, this.values.civ[itemIdx]);
		this.gameSettingsController.setNetworkInitAttributes();
	}
};

PlayerSettingControls.PlayerCiv.prototype.Tooltip =
    translate("Choose the civilization for this player.");

PlayerSettingControls.PlayerCiv.prototype.RandomCivCaption =
    translateWithContext("civilization", "Random");

PlayerSettingControls.PlayerCiv.prototype.RandomCivId =
    "random";

PlayerSettingControls.PlayerCiv.prototype.RandomCivTooltip =
    translate("Picks one civilization at random when the game starts.");

PlayerSettingControls.PlayerCiv.prototype.AutocompleteOrder = 90;