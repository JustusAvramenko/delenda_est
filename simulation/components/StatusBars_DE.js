StatusBars.prototype.AddAuraIcons = function(cmpOverlayRenderer, yoffset)
{
	const cmpGuiInterface = Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface);
	const sources = cmpGuiInterface.GetEntitiesWithStatusBars().filter(e => this.auraSources.has(e) && this.auraSources.get(e).length);

	if (!sources.length)
		return 0;

	const iconSet = new Set();
	for (const ent of sources)
	{
		const cmpAuras = Engine.QueryInterface(ent, IID_Auras);
		if (!cmpAuras) // probably the ent just died
			continue;
		for (const name of this.auraSources.get(ent))
			iconSet.add(cmpAuras.GetOverlayIcon(name));
	}

	// World-space offset from the unit's position
	const offset = { "x": 0, "y": +this.template.HeightOffset + yoffset, "z": 0 };

	const iconSize = +this.template.BarWidth / 1.5;  //<<<<<<<<<<<<< DE alters this.
	let xoffset = -iconSize * (iconSet.size - 1) * 0.6;
	for (const icon of iconSet)
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
