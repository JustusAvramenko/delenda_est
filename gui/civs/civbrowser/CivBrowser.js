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

		this.CivList = this.loadCivs();
		this.Regions = ["All"];

		for (let civ of this.CivList)
		{
			if (!this.Regions.includes(civ.Region))
				this.Regions.push(civ.Region);
		}

		this.Regions.sort();
	}

	loadCivs()
	{
		let civs = [];

		for (let code in g_CivData)
		{
			let civ = g_CivData[code];

			civs.push({
				"file": code,
				"code": code,

				"name": civ.Name || code,

				"description": civ.History || "",

				"icon": civ.Emblem || "",

				"Region": civ.Region || "Other",

				"CivType": civ.Region || "Other",

				"filter": "default",

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