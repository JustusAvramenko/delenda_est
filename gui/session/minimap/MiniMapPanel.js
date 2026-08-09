/**
 * This class is concerned with managing the different elements of the minimap panel.
 */
class MiniMapPanel
{
	constructor(playerViewControl, diplomacyColors, idleWorkerClasses)
	{
		this.loadConfig();

		this.themes = {
			"square": {
				"panelSprite": "mapPanel",
				"circleSprite": "stretched:session/minimap_circle_modern.png",
				"flare": {
					"baseSize": "4 4 113 119",
					"anchors": ["left", "top"],
					"sprite": "stretched:session/minimap-player-flare.png",
					"sprite_over": "stretched:session/minimap-player-flare-highlight.png",
					"sprite_disabled": "stretched:session/minimap-player-flare-disabled.png",
					"mouse_event_mask": "texture:session/minimap-player-flare.png",
					"observer_sprite": "stretched:session/minimap-observer-flare.png",
					"observer_sprite_over": "stretched:session/minimap-observer-flare-highlight.png"
				},
				"diplomacy": {
					"baseSize": "4 100%-121 119 100%-4",
					"anchors": ["left", "bottom"],
					"sprite_on": "stretched:session/minimap-diplomacy-on.png",
					"sprite_off": "stretched:session/minimap-diplomacy-off.png",
					"sprite_on_over": "stretched:session/minimap-diplomacy-on-highlight.png",
					"sprite_off_over": "stretched:session/minimap-diplomacy-off-highlight.png",
					"mouse_event_mask": "texture:session/minimap-diplomacy-on.png"
				},
				"idle": {
					"baseSize": "100%-119 100%-121 100%-4 100%-4",
					"anchors": ["right", "bottom"],
					"sprite": "stretched:session/minimap-idle.png",
					"sprite_over": "stretched:session/minimap-idle-highlight.png",
					"sprite_disabled": "stretched:session/minimap-idle-disabled.png",
					"mouse_event_mask": "texture:session/minimap-idle.png"
				},
				"idleText": {
					"baseSize": "100%-119 100%-121 100%-3 100%-2",
					"anchors": ["right", "bottom"],
					"text_align": "right",
					"text_valign": "bottom"
				}
			},
			"round": {
				"panelSprite": "",
				"mapOffset": -10,
				"circleSprite": "stretched:session/minimap_expanded_circle.png",
				"flare": {
					"baseSize": "100%-48 100%-28 100%-24 100%-4",
					"sprite": "stretched:session/minimap-round-flare.png",
					"sprite_over": "stretched:session/minimap-round-flare-highlight.png",
					"sprite_disabled": "stretched:session/minimap-round-flare-disabled.png",
					"mouse_event_mask": "texture:session/minimap-round-flare.png",
					"observer_sprite": "stretched:session/minimap-round-observer-flare.png",
					"observer_sprite_over": "stretched:session/minimap-round-observer-flare-highlight.png"
				},
				"diplomacy": {
					"baseSize": "22 100%-28 46 100%-4",
					"sprite_on": "stretched:session/minimap-round-diplomacy-on.png",
					"sprite_off": "stretched:session/minimap-round-diplomacy-off.png",
					"sprite_on_over": "stretched:session/minimap-round-diplomacy-on-highlight.png",
					"sprite_off_over": "stretched:session/minimap-round-diplomacy-off-highlight.png",
					"mouse_event_mask": "texture:session/minimap-round-diplomacy-off.png"
				},
				"idle": {
					"baseSize": "100%-28 100%-46 100%-4 100%-22",
					"sprite": "stretched:session/minimap-round-idle.png",
					"sprite_over": "stretched:session/minimap-round-idle-highlight.png",
					"sprite_disabled": "stretched:session/minimap-round-idle-disabled.png",
					"mouse_event_mask": "texture:session/minimap-round-idle.png"
				},
				"idleText": {
					"baseSize": "100%-28 100%-46 100%-4 100%-22",
					"text_align": "center",
					"text_valign": "center"
				}
			}
		};

		this.expandedState = {
			"panelSprite": "",
			"hideButtons": true,
			"showCircle": true,
			"circleSprite": "stretched:session/minimap_expanded_circle.png",
			"computeLayout": this.computeExpandedLayout.bind(this)
		};

		this.panel = Engine.GetGUIObjectByName("minimapPanel");
		this.minimapCircle = Engine.GetGUIObjectByName("minimapCircle");
		this.minimapMap = Engine.GetGUIObjectByName("minimap");
		this.minimapBackgroundTexture = Engine.GetGUIObjectByName("minimapBackgroundTexture");
		this.session = Engine.GetGUIObjectByName("session");
		this.idleWorkerButton = new MiniMapIdleWorkerButton(playerViewControl, idleWorkerClasses);
		this.totalNumberIdleWorkers = Engine.GetGUIObjectByName("totalNumberIdleWorkers");
		this.flareButton = new MiniMapFlareButton(playerViewControl);
		this.miniMap = new MiniMap();
		this.diplomacyColors = diplomacyColors;
		this.diplomacyColorsButton = new MiniMapDiplomacyColorsButton(diplomacyColors, this.themes[this.shape].diplomacy);
		const panelRect = this.panel.getComputedSize();
		this.defaultPanelWidth = panelRect.right - panelRect.left;
		this.defaultPanelHeight = panelRect.bottom - panelRect.top;
		playerViewControl.registerViewedPlayerChangeHandler(this.rebuild.bind(this));
		registerHotkeyChangeHandler(this.rebuild.bind(this));
		registerConfigChangeHandler(this.onConfigChange.bind(this));
		Engine.SetGlobalHotkey("session.minimap.expand.toggle", "Press", this.toggleExpanded.bind(this));
		this.expanded = false;
		this.applyLayout();
	}

	loadConfig()
	{
		this.position = Engine.ConfigDB_GetValue("user", "gui.session.minimap.position");
		this.sizeScale = Engine.ConfigDB_GetValue("user", "gui.session.minimap.size");
		this.shape = Engine.ConfigDB_GetValue("user", "gui.session.minimap.shape") || "square";
	}

	get currentTheme()
	{
		if (this.expanded)
			return this.expandedState;

		return {
			...this.themes[this.shape],
			"hideButtons": false,
			"showCircle": true,
			"computeLayout": this.computeNormalLayout.bind(this)
		};
	}

	isObserver()
	{
		return g_IsObserver;
	}

	toggleExpanded()
	{
		this.expanded = !this.expanded;
		this.applyLayout();
	}

	onConfigChange(changes)
	{
		if (![...changes].some(change =>
			change == "gui.session.minimap.position" ||
			change == "gui.session.minimap.size" ||
			change == "gui.session.minimap.shape"))
			return;
		this.loadConfig();
		this.applyLayout();
	}

	applyLayout()
	{
		const theme = this.currentTheme;

		this.panel.size = theme.computeLayout();
		this.panel.sprite = theme.panelSprite;
		this.minimapCircle.sprite = theme.circleSprite ?? this.themes[this.shape].circleSprite;
		this.minimapCircle.hidden = !theme.showCircle;
		const offset = theme.mapOffset ?? 0;
		this.minimapBackgroundTexture.size = `4 ${4 + offset} 100%-4 100%-${4 - offset}`;
		this.minimapCircle.size = `4 ${4 + offset} 100%-4 100%-${4 - offset}`;
		this.minimapMap.size = `8 ${8 + offset} 100%-8 100%-${8 - offset}`;
		this.refreshButtons(theme);
	}

	refreshButtons(theme)
	{
		const hidden = theme.hideButtons;
		this.flareButton.flareButton.hidden = hidden;
		this.idleWorkerButton.idleWorkerButton.hidden = hidden;
		this.idleWorkerButton.totalNumberIdleWorkers.hidden = hidden;
		this.diplomacyColorsButton.diplomacyColorsButton.hidden = hidden;
		if (hidden)
			return;
		const scale = parseFloat(this.sizeScale) || 1.0;
		const flareConfig = this.isObserver() && theme.flare?.observer_sprite ?
			{ ...theme.flare, "sprite": theme.flare.observer_sprite, "sprite_over": theme.flare.observer_sprite_over } :
			theme.flare;
		this.applyButtonSprites(this.flareButton.flareButton, flareConfig);
		this.applyScaledSize(this.flareButton.flareButton, theme.flare, scale);
		this.applyButtonSprites(this.idleWorkerButton.idleWorkerButton, theme.idle);
		this.applyScaledSize(this.idleWorkerButton.idleWorkerButton, theme.idle, scale);
		this.applyScaledSize(this.totalNumberIdleWorkers, theme.idleText, scale);
		if (theme.idleText.text_align !== undefined)
			this.totalNumberIdleWorkers.text_align = theme.idleText.text_align;
		if (theme.idleText.text_valign !== undefined)
			this.totalNumberIdleWorkers.text_valign = theme.idleText.text_valign;
		this.diplomacyColorsButton.theme = theme.diplomacy;
		this.applyButtonSprites(this.diplomacyColorsButton.diplomacyColorsButton, theme.diplomacy);
		this.diplomacyColorsButton.onDiplomacyColorsChange(this.diplomacyColors.isEnabled?.() ?? false);
		this.applyScaledSize(this.diplomacyColorsButton.diplomacyColorsButton, theme.diplomacy, scale);
	}

	applyButtonSprites(button, config)
	{
		if (!config)
			return;
		if (config.mouse_event_mask !== undefined)
			button.mouse_event_mask = config.mouse_event_mask;
		if (!config.sprite)
			return;
		button.sprite = config.sprite;
		if (config.sprite_over !== undefined)
			button.sprite_over = config.sprite_over;
		if (config.sprite_disabled !== undefined)
			button.sprite_disabled = config.sprite_disabled;
	}

	applyScaledSize(element, cfg, scale)
	{
		if (!cfg)
			return;
		const parts = cfg.baseSize.split(/\s+/).map(part =>
		{
			const match = part.match(/^100%-(\d+)$/);
			if (match)
				return `100%-${Math.round(+match[1] * scale)}`;
			if (/^-?\d+$/.test(part))
				return `${Math.round(+part * scale)}`;
			return part;
		});
		if (!cfg.anchors)
		{
			element.size = parts.join(" ");
			return;
		}
		const scaled = { "left": parts[0], "top": parts[1], "right": parts[2], "bottom": parts[3] };
		const original = cfg.baseSize.split(/\s+/);

		for (const anchor of cfg.anchors)
		{
			const idx = ["left", "top", "right", "bottom"].indexOf(anchor);
			scaled[anchor] = original[idx];
		}
		element.size = [scaled.left, scaled.top, scaled.right, scaled.bottom].join(" ");
	}

	computeNormalLayout()
	{
		return this.position === "panel-left" ?
			this.computePanelLeftLayout() :
			this.computeScreenLeftLayout();
	}

	computePanelLeftLayout()
	{
		const scale = parseFloat(this.sizeScale) || 1.0;
		const width = Math.round(this.defaultPanelWidth * scale);
		const height = Math.round(this.defaultPanelHeight * scale);
		const parentRect = this.panel.parent.getComputedSize();
		const parentHeight = parentRect.bottom - parentRect.top;
		return {
			"left": this.defaultPanelWidth - width,
			"top": parentHeight - height,
			"right": this.defaultPanelWidth,
			"bottom": parentHeight
		};
	}

	computeScreenLeftLayout()
	{
		const scale = parseFloat(this.sizeScale) || 1.0;
		const width = Math.round(this.defaultPanelWidth * scale);
		const height = Math.round(this.defaultPanelHeight * scale);
		const windowSize = this.session.getComputedSize();
		const parentRect = this.panel.parent.getComputedSize();
		const screenTop = (windowSize.bottom - windowSize.top) - height;
		const supplementalPanel = Engine.GetGUIObjectByName("supplementalSelectionDetails");
		const maxRight = supplementalPanel.getComputedSize().left;
		let left = 0;
		let right = width;
		if (right > maxRight)
		{
			right = maxRight;
			left = right - width;
		}
		return {
			"left": left - parentRect.left,
			"top": screenTop - parentRect.top,
			"right": right - parentRect.left,
			"bottom": screenTop + height - parentRect.top
		};
	}

	computeExpandedLayout()
	{
		const windowSize = this.session.getComputedSize();
		const scale = 0.55;
		const marginLeft = 20;
		const verticalOffset = -40;
		const screenHeight = windowSize.bottom - windowSize.top;
		const size = Math.floor(screenHeight * scale);
		const screenTop = Math.floor((screenHeight - size) / 2) + verticalOffset;
		const parentRect = this.panel.parent.getComputedSize();
		const top = screenTop - parentRect.top;
		const left = marginLeft - parentRect.left;
		return {
			"left": left,
			"top": top,
			"right": left + size,
			"bottom": top + size
		};
	}

	flare(target, playerID)
	{
		return this.miniMap.flare(target, playerID);
	}

	isMouseOverMiniMap()
	{
		return this.miniMap.isMouseOverMiniMap();
	}

	rebuild()
	{
		this.applyLayout();
		this.setCivBackgroundTexture();
	}

	setCivBackgroundTexture()
	{
		const playerCiv = g_ViewedPlayer > 0 ? g_Players[g_ViewedPlayer].civ : "gaia";
		const backgroundObject = Engine.GetGUIObjectByName("minimapBackgroundTexture");
		backgroundObject.sprite = `stretched:session/icons/bkg/background_circle_${playerCiv}.png`;
	}
}