class CivGridBrowserItem extends GridBrowserItem
{
	constructor(CivBrowserPage, CivGridBrowser, imageObject, itemIndex)
	{
		super(CivGridBrowser, imageObject, itemIndex);

		this.CivBrowserPage = CivBrowserPage;
		this.CivGridBrowser = CivGridBrowser;
		this.CivCache = CivBrowserPage.CivCache;

		this.CivPreview =
			Engine.GetGUIObjectByName(
				"CivPreview[" + itemIndex + "]"
			);

		CivGridBrowser.registerSelectionChangeHandler(
			this.onSelectionChange.bind(this)
		);

		CivGridBrowser.registerPageChangeHandler(
			this.onGridResize.bind(this)
		);

		this.imageObject.onMouseLeftDoubleClick =
			this.onMouseLeftDoubleClick.bind(this);
	}

	onSelectionChange()
	{
		this.updateSprite();
	}

	onGridResize()
	{
		super.onGridResize();
		this.updateCivAssignment();
		this.updateSprite();
	}

	updateSprite()
	{
		this.imageObject.sprite =
			this.CivGridBrowser.selected == this.itemIndex + this.CivGridBrowser.currentPage * this.CivGridBrowser.itemsPerRow ?
				this.SelectedSprite :
				"";
	}

	updateCivAssignment()
	{
		let Civ = this.CivGridBrowser.CivList[
			this.itemIndex + this.CivGridBrowser.currentPage * this.CivGridBrowser.itemsPerRow] || undefined;

		if (!Civ)
			return;

		// this.CivPreview.caption = Civ.name;

		this.imageObject.tooltip =
				setStringTags(
		Civ.name,
				{ "font": "sans-bold-16" }
			)
			this.CivGridBrowser.container.tooltip;

			this.CivPreview.sprite ="stretched:" + Civ.icon;
	}

	onMouseLeftDoubleClick()
	{
		this.CivBrowserPage.submitCivSelection();
	}
}

CivGridBrowserItem.prototype.SelectedSprite = "color: 120 0 0 255";
