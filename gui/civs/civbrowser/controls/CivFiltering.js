CivBrowserPageControls.prototype.CivFiltering = class
{
	constructor(CivBrowserPage, CivGridBrowser)
	{
		this.CivBrowserPage = CivBrowserPage;
		this.CivGridBrowser = CivGridBrowser;
		this.CivFilters = CivBrowserPage.CivFilters;

		this.searchBox = new LabelledInput("CivBrowserSearchBox")
			.setupEvents(() => this.onChange());
		this.CivType = new LabelledDropdown("CivBrowserCivType")
			.setupEvents(() => this.onCivTypeChange());
		this.CivFilter = new LabelledDropdown("CivBrowserCivFilter")
			.setupEvents(() => this.onChange());

		CivBrowserPage.registerOpenPageHandler(() => this.onOpenPage());
		CivBrowserPage.registerClosePageHandler(() => this.onClosePage());

		this.searchBox.blur();
	}

	onOpenPage()
	{
		let regions = [];

		for (let code in g_CivData)
		{
			let region =
				String(
					g_CivData[code].Region ||
					"Other"
				);

			if (!regions.includes(region))
				regions.push(region);
		}

		regions.sort();

		regions.unshift("All");

		this.CivType.control.list = regions.slice();
		this.CivType.control.list_data = regions.slice();

		this.CivType.select("All");

		this.renderCivFilter();

		setTimeout(() =>
		{
			this.searchBox.control.caption = "";
			this.searchBox.focus();
		}, 0);
	}

	onClosePage()
	{
		this.searchBox.blur();
	}

	onCivTypeChange()
	{
		this.renderCivFilter();
		this.onChange();
	}

	onChange()
	{
		this.CivGridBrowser.updateCivList();
		this.CivGridBrowser.goToPageOfSelected();
	}

	select(filter, type)
	{
		let regions = [];

		for (let code in g_CivData)
		{
			let region =
				String(
					g_CivData[code].Region ||
					"Other"
				);

			if (!regions.includes(region))
				regions.push(region);
		}

		regions.sort();

		regions.unshift("All");

		this.CivType.control.list = regions.slice();
		this.CivType.control.list_data = regions.slice();

		this.CivType.select(type || "All");

		this.renderCivFilter();

		this.CivFilter.select(filter || "All");

		this.CivGridBrowser.updateCivList();
		this.CivGridBrowser.goToPageOfSelected();
	}

	renderCivFilter()
	{
		this.CivFilter.control.list =
			["All"];

		this.CivFilter.control.list_data =
			["All"];
	}

	// TODO: would be nicer to store this state somewhere else.
	getSearchText()
	{
		return this.searchBox.getText() || "";
	}

	getSelectedCivType()
	{
		return this.CivType.getSelected() || "";
	}

	getSelectedCivFilter()
	{
		return this.CivFilter.getSelected() || "";
	}
};
