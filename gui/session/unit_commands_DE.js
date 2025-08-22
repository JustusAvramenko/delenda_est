// DELETE THIS FILE WHEN PR 8298 COMMITTED.
// The number of currently visible buttons (used to optimise showing/hiding)
var g_unitPanelButtons = {
	"Selection": 0,
	"Queue": 0,
	"Formation": 0,
	"Garrison": 0,
	"Training": 0,
	"Research": 0,
	"Alert": 0,
	"Barter": 0,
	"Construction": 0,
	"Command": 0,
	"Stance": 0,
	"Gate": 0,
	"Pack": 0,
	"Upgrade": 0
};

/**
 * Set the position of a panel object according to the index,
 * from left to right, from top to bottom.
 * Will wrap around to subsequent rows if the index
 * is larger than rowLength.
 */
function setPanelObjectPosition(object, index, rowLength, vMargin = 1, hMargin = 1)
{
	const oWidth = object.size.right - object.size.left;
	const oHeight = object.size.bottom - object.size.top;
	const left = (index % rowLength) * (oWidth + vMargin);
	const top = (Math.floor(index / rowLength)) * (oHeight + hMargin);

	Object.assign(object.size, {
		// horizontal position
		"left": left,
		"right": left + oWidth,
		// vertical position
		"top": top,
		"bottom": top + oHeight
	});
}

/**
 * Helper function for updateUnitCommands; sets up "unit panels"
 * (i.e. panels with rows of icons) for the currently selected unit.
 *
 * @param guiName Short identifier string of this panel. See g_SelectionPanels.
 * @param unitEntStates Entity states of the selected units
 * @param playerState Player state
 */
function setupUnitPanel(guiName, unitEntStates, playerState)
{
	if (!g_SelectionPanels[guiName])
	{
		error("unknown guiName used '" + guiName + "'");
		return;
	}

	const items = g_SelectionPanels[guiName].getItems(unitEntStates);

	if (!items || !items.length)
		return;

	const numberOfItems = Math.min(items.length, g_SelectionPanels[guiName].getMaxNumberOfItems());
	const rowLength = g_SelectionPanels[guiName].rowLength || 8;

	if (g_SelectionPanels[guiName].resizePanel)
		g_SelectionPanels[guiName].resizePanel(numberOfItems, rowLength);

	for (let i = 0; i < numberOfItems; ++i)
	{
		const data = {
			"i": i,
			"item": items[i],
			"playerState": playerState,
			"player": unitEntStates[0].player,
			"unitEntStates": unitEntStates,
			"rowLength": rowLength,
			"numberOfItems": numberOfItems,
			// depending on the XML, some of the GUI objects may be undefined
			"button": Engine.TryGetGUIObjectByName("unit" + guiName + "Button[" + i + "]"),
			"icon": Engine.TryGetGUIObjectByName("unit" + guiName + "Icon[" + i + "]"),
			"guiSelection": Engine.TryGetGUIObjectByName("unit" + guiName + "Selection[" + i + "]"),
			"countDisplay": Engine.TryGetGUIObjectByName("unit" + guiName + "Count[" + i + "]")
		};

		if (data.button)
		{
			data.button.hidden = false;
			data.button.enabled = true;
			data.button.tooltip = "";
			data.button.caption = "";
		}

		if (g_SelectionPanels[guiName].setupButton &&
		    !g_SelectionPanels[guiName].setupButton(data))
			continue;

		// TODO: we should require all entities to have icons, so this case never occurs
		if (data.icon && !data.icon.sprite)
			data.icon.sprite = "BackgroundBlack";
	}

	// Hide any buttons we're no longer using
	for (let i = numberOfItems; i < g_unitPanelButtons[guiName]; ++i)
		if (g_SelectionPanels[guiName].hideItem)
			g_SelectionPanels[guiName].hideItem(i, rowLength);
		else
			Engine.GetGUIObjectByName("unit" + guiName + "Button[" + i + "]").hidden = true;

	g_unitPanelButtons[guiName] = numberOfItems;
	g_SelectionPanels[guiName].used = true;
}