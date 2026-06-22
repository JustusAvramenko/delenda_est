class CivGridBrowser extends GridBrowser
{
	constructor(CivBrowserPage, setupWindow)
	{
		super(
			Engine.GetGUIObjectByName(
				"CivBrowserContainer"
			)
		);

		this.setupWindow = setupWindow;
		this.CivBrowserPage = CivBrowserPage;

		this.CivList = [];

		this.items = this.container.children.map(
			(imageObject, itemIndex) =>
				new CivGridBrowserItem(
					CivBrowserPage,
					this,
					imageObject,
					itemIndex
				)
		);

		this.CivBrowserPage.registerOpenPageHandler(
			this.onOpenPage.bind(this)
		);

		this.CivBrowserPage.registerClosePageHandler(
			this.onClosePage.bind(this)
		);

		this.CivBrowserPage.CivBrowserPageDialog.onMouseWheelUp =
			() => this.previousPage(false);

		this.CivBrowserPage.CivBrowserPageDialog.onMouseWheelDown =
			() => this.nextPage(false);
	}

	onOpenPage()
	{

		this.updateCivList();

		if (this.CivList.length)
			this.setSelectedIndex(0);

		this.currentPage = 0;

		this.goToPageOfSelected();

		this.container.onWindowResized =
			this.onWindowResized.bind(this);

		Engine.SetGlobalHotkey(
			this.HotkeyConfigNext,
			"Press",
			this.nextPage.bind(this)
		);

		Engine.SetGlobalHotkey(
			this.HotkeyConfigPrevious,
			"Press",
			this.previousPage.bind(this)
		);
	}

	onClosePage()
	{
		delete this.container.onWindowResized;

		Engine.UnsetGlobalHotkey(
			this.HotkeyConfigNext,
			"Press"
		);

		Engine.UnsetGlobalHotkey(
			this.HotkeyConfigPrevious,
			"Press"
		);
	}

	getSelected()
	{
		return this.CivList[this.selected] || undefined;
	}

	select(civFile)
	{
		let idx =
			this.CivList.findIndex(
				civ => civ.file == civFile
			);

		this.setSelectedIndex(idx);
		this.goToPageOfSelected();
	}

	updateCivList()
	{

		let CivList =
			this.CivBrowserPage.CivList || [];

		const region =
			this.CivBrowserPage.controls
				.CivFiltering
				.getSelectedCivType();

		const searchText =
			this.CivBrowserPage.controls
				.CivFiltering
				.getSearchText()
				.toLowerCase();

		// Filter by Region
		if (
			region &&
			region != "All"
		)
		{
			CivList =
				CivList.filter(
					civ =>
						(civ.civData.Region || "Other")
						== region
				);
		}

		// Text filter
		if (searchText)
		{
			CivList =
				CivList.filter(
					civ =>
						civ.name
							.toLowerCase()
							.includes(searchText)
				);
		}

		this.CivList = CivList;

		this.itemCount =
			CivList.length;

		this.resizeGrid();

	}

}

CivGridBrowser.prototype.ItemRatio = 1 / 1;

CivGridBrowser.prototype.DefaultItemWidth = 200;

CivGridBrowser.prototype.MinItemWidth = 150;

CivGridBrowser.prototype.MaxItemWidth = 300;

CivGridBrowser.prototype.HotkeyConfigNext =
	"tab.next";

CivGridBrowser.prototype.HotkeyConfigPrevious =
	"tab.prev";