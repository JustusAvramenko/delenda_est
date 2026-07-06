class CivBrowser
{
	constructor(CivCache, CivFilters, setupWindow = undefined)
	{
		this.openPageHandlers = new Set();
		this.closePageHandlers = new Set();

		this.CivCache = CivCache;
		this.CivFilters = CivFilters;

		this.CivData = g_CivData;

		this.CivBrowserPage =
			Engine.GetGUIObjectByName(
				"CivBrowserPage"
			);

		this.CivBrowserPageDialog =
			Engine.GetGUIObjectByName(
				"CivBrowserPageDialog"
			);

		this.CivGridBrowser =
			new CivGridBrowser(
				this,
				setupWindow
			);

		this.controls =
			new CivBrowserPageControls(
				this,
				this.CivGridBrowser
			);

		this.open = false;
		this.selectedPlayer = 0;

		this.closePageCallback = data =>
		{
			this.closePage();

			Engine.SwitchGuiPage(
				data[Engine.openRequest].page,
				data[Engine.openRequest].argument
			);
		};


		this.CivList = this.loadCivs();
		this.Regions = ["All"];

		for (let civ of this.CivList)
		{
			if (!this.Regions.includes(civ.Region))
				this.Regions.push(civ.Region);
		}

		this.Regions.sort();

		this.Cultures = ["All"];

		for (let civ of this.CivList)
		{
			for (let culture of civ.Culture)
				if (!this.Cultures.includes(culture))
					this.Cultures.push(culture);
		}

		this.Cultures.sort();
	}

	loadCivs()
	{
		let civs = [];

		for (let code in g_CivData)
		{
			let civ = g_CivData[code];

			if (civ.SelectableInGameSetup === false)
				continue;

			civs.push({
				"file": code,
				"code": code,

				"name": civ.Name || code,

				"description": civ.History || "",

				"icon": civ.Emblem || "",

				"Region": String(civ.Region || "Unknown"),

				"Culture": Array.isArray(civ.Culture) ?
					civ.Culture :
					[civ.Culture || "Other"],

				"civData": civ
			});
		}

		civs.sort((a, b) =>
			String(a.name).localeCompare(
				String(b.name)
			)
		);

		return civs;
	}

	submitCivSelection()
	{
		let civ =
			this.CivGridBrowser.getSelected();

		if (!civ)
			return;

		let player =
			this.selectedPlayer ?? 0;


		g_GameSettings.playerCiv.setValue(
			player,
			civ.file
		);

		this.closePage();
	}

	registerOpenPageHandler(handler)
	{
		this.openPageHandlers.add(
			handler
		);
	}

	registerClosePageHandler(handler)
	{
		this.closePageHandlers.add(
			handler
		);
	}



	openPage(allowSelection)
	{
		if (this.open)
			return;

		for (let handler of this.openPageHandlers)
			handler(allowSelection);

		this.allowSelection =
			allowSelection;

		this.open = true;
	}

	closePage()
	{
		if (!this.open)
			return;

		for (let handler of this.closePageHandlers)
			handler();

		this.open = false;
	}
}