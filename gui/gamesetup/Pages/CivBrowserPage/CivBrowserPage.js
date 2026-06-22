SetupWindowPages.CivBrowserPage =
class extends CivBrowser
{
    constructor(setupWindow)
    {
        super(
            setupWindow.controls.mapCache,
            setupWindow.controls.mapFilters,
            setupWindow
        );

        this.civBrowserPage =
            Engine.TryGetGUIObjectByName(
                "CivBrowserPage"
            );

        if (this.civBrowserPage)
            this.civBrowserPage.hidden = true;
    }

    openPage()
    {

        super.openPage(g_IsController);

        this.CivBrowserPage.hidden = false;

    }

    closePage()
    {
        super.closePage();

        if (this.civBrowserPage)
            this.civBrowserPage.hidden = true;
    }
};