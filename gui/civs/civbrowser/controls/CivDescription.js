CivBrowserPageControls.prototype.CivDescription = class
{
	constructor(CivBrowserPage, CivGridBrowser)
	{
		this.ImageRatio = 1 / 1;

		this.CivBrowserPage = CivBrowserPage;
		this.CivGridBrowser = CivGridBrowser;
		this.CivCache = CivBrowserPage.CivCache;

		this.CivBrowserSelectedName = Engine.GetGUIObjectByName("CivBrowserSelectedName");
		this.CivBrowserSelectedPreview = Engine.GetGUIObjectByName("CivBrowserSelectedPreview");
		this.CivBrowserSelectedDescription = Engine.GetGUIObjectByName("CivBrowserSelectedDescription");

		let computedSize = this.CivBrowserSelectedPreview.getComputedSize();
		let top = this.CivBrowserSelectedName.size.bottom;
		let height = Math.floor((computedSize.right - computedSize.left) / this.ImageRatio);

		{
			let size = this.CivBrowserSelectedPreview.size;
			size.top = top;
			size.bottom = top + height;
			this.CivBrowserSelectedPreview.size = size;
		}

		{
			let size = this.CivBrowserSelectedDescription.size;
			size.top = top + height + 10;
			this.CivBrowserSelectedDescription.size = size;
		}

		CivGridBrowser.registerSelectionChangeHandler(this.onSelectionChange.bind(this));
	}

	onSelectionChange()
	{
		let Civ = this.CivGridBrowser.CivList[this.CivGridBrowser.selected];
		if (!Civ)
			return;

		this.CivBrowserSelectedName.caption = Civ ? Civ.name : "";
		this.CivBrowserSelectedDescription.caption = Civ ? Civ.description : "";

		this.CivBrowserSelectedPreview.sprite =
			"stretched:" + Civ.icon;
	}
};
