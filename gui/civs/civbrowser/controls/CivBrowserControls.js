class CivBrowserPageControls
{
	constructor(CivBrowserPage, CivGridBrowser)
	{
		for (let name in this)
			this[name] = new this[name](CivBrowserPage, CivGridBrowser);

		this.CivBrowserPage = CivBrowserPage;
		this.CivGridBrowser = CivGridBrowser;

		this.setupButtons();
	}

	setupButtons()
	{
		this.pickRandom = Engine.GetGUIObjectByName("CivBrowserPagePickRandom");
		this.pickRandom.onPress = () => {
			let index = randIntInclusive(0, this.CivGridBrowser.itemCount - 1);
			this.CivGridBrowser.setSelectedIndex(index);
			this.CivGridBrowser.goToPageOfSelected();
		};

		this.select = Engine.GetGUIObjectByName("CivBrowserPageSelect");
		this.select.onPress = () => this.onSelect();

		this.close = Engine.GetGUIObjectByName("CivBrowserPageClose");
		this.close.onPress = () => this.CivBrowserPage.closePage();

		this.CivBrowserPage.registerOpenPageHandler(this.onOpenPage.bind(this));
		this.CivGridBrowser.registerSelectionChangeHandler(() => this.onSelectionChange());
	}

	onOpenPage(allowSelection)
	{
		this.pickRandom.hidden = !allowSelection;
		this.select.hidden = !allowSelection;

		const usedCaptions = allowSelection ? CivBrowserPageControls.Captions.cancel :
			CivBrowserPageControls.Captions.close;

		this.close.caption = usedCaptions.caption;
		this.close.tooltip = colorizeHotkey(usedCaptions.tooltip, "cancel");
	}

	onSelectionChange()
	{
		this.select.enabled = this.CivGridBrowser.selected != -1;
	}

	onSelect()
	{
		this.CivBrowserPage.submitCivSelection();
	}

	static Captions =
	{
		"close":
		{
			"caption": translate("Close"),
			"tooltip": translate("%(hotkey)s: Close Civ browser.")
		},
		"cancel":
		{
			"caption": translate("Cancel"),
			"tooltip": translate("%(hotkey)s: Close Civ browser and discard the selection.")
		}
	};
}
