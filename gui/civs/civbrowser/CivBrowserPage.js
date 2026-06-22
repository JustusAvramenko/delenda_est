/**
 * TODO: better global state handling in the GUI.
 */
const g_CivTypes = prepareForDropdown(g_Settings && g_Settings.CivTypes);

function init()
{
	let cache = new CivCache();
	let filters = new CivFilters(cache);
	let browser = new CivBrowser(cache, filters);
	browser.registerClosePageHandler(() => Engine.PopGuiPage());
	browser.openPage(false);
	browser.controls.CivFiltering.select("default", "skirmish");
}