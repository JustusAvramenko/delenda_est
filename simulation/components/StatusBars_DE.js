StatusBars.prototype.AddAuraIcons = function(cmpOverlayRenderer, yoffset)
{
	let cmpGuiInterface = Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface);
	let sources = cmpGuiInterface.GetEntitiesWithStatusBars().filter(e => this.auraSources.has(e) && this.auraSources.get(e).length);

	if (!sources.length)
		return 0;

	let iconSet = new Set();
	for (let ent of sources)
	{
		let cmpAuras = Engine.QueryInterface(ent, IID_Auras);
		if (!cmpAuras) // probably the ent just died
			continue;
		for (let name of this.auraSources.get(ent))
			iconSet.add(cmpAuras.GetOverlayIcon(name));
	}

	// World-space offset from the unit's position
	let offset = { "x": 0, "y": +this.template.HeightOffset + yoffset, "z": 0 };

	let iconSize = +this.template.BarWidth / 1.5;
	let xoffset = -iconSize * (iconSet.size - 1) * 0.6;
	for (let icon of iconSet)
	{
		cmpOverlayRenderer.AddSprite(
			icon,
			{ "x": xoffset - iconSize / 2, "y": yoffset },
			{ "x": xoffset + iconSize / 2, "y": iconSize + yoffset },
			offset,
			"255 255 255 255"
		);
		xoffset += iconSize * 1.2;
	}

	return iconSize + this.template.BarHeight / 2;
};

Engine.ReRegisterComponentType(IID_StatusBars, "StatusBars", StatusBars);