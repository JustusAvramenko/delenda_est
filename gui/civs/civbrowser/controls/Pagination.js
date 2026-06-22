CivBrowserPageControls.prototype.Pagination = class
{
	constructor(CivBrowserPage, CivGridBrowser)
	{
		this.status = Engine.GetGUIObjectByName("CivBrowserPageStatus");

		this.previous = Engine.GetGUIObjectByName("CivBrowserPreviousButton");
		this.next = Engine.GetGUIObjectByName("CivBrowserNextButton");

		this.zoomIn = Engine.GetGUIObjectByName("CivsZoomIn");
		this.zoomOut = Engine.GetGUIObjectByName("CivsZoomOut");

		this.CivGridBrowser = CivGridBrowser;
		this.CivGridBrowser.registerPageChangeHandler(() => this.render());
		this.CivGridBrowser.registerGridResizeHandler(() => this.render());

		this.setup();
		this.render();
	}

	setup()
	{
		this.previous.onPress = () => this.CivGridBrowser.previousPage();
		this.next.onPress = () => this.CivGridBrowser.nextPage();
		this.previous.caption = "←";
		this.next.caption = "→";
		this.previous.tooltip = translate("Go to the previous page.");
		this.next.tooltip = translate("Go to the next page.");

		this.zoomIn.onPress = () => this.CivGridBrowser.increaseColumnCount(-1);
		this.zoomOut.onPress = () => this.CivGridBrowser.increaseColumnCount(1);
		this.zoomIn.tooltip = translate("Increase Civ preview size.");
		this.zoomOut.tooltip = translate("Decrease Civ preview size.");
	}

	render()
	{
		this.status.caption =
			sprintf(translate("Civs: %(CivCount)s"), {
				"CivCount": this.CivGridBrowser.itemCount
			}) +
			"   " +
			sprintf(translate("Page: %(currentPage)s/%(maxPage)s"), {
				"currentPage": this.CivGridBrowser.currentPage + 1,
				"maxPage": Math.max(1, this.CivGridBrowser.pageCount)
			});

		this.previous.enabled = this.CivGridBrowser.pageCount > 1;
		this.next.enabled = this.CivGridBrowser.pageCount > 1;

		this.zoomIn.enabled = this.CivGridBrowser.columnCount > 0;
		this.zoomOut.enabled = this.CivGridBrowser.columnCount < this.CivGridBrowser.maxColumns;

	}
};
