/**
 * The purpose of this class is to exclusively manage the diplomacy colors button within the minimap.
 */
class MiniMapDiplomacyColorsButton
{
	constructor(diplomacyColors, theme)
	{
		this.theme = theme;
		this.diplomacyColors = diplomacyColors;
		this.diplomacyColorsButton = Engine.GetGUIObjectByName("diplomacyColorsButton");
		this.diplomacyColorsButton.onPress = diplomacyColors.toggle.bind(diplomacyColors);
		this.diplomacyColorsButton.mouse_event_mask = this.theme.mouse_event_mask;
		const initialState = this.diplomacyColors.isEnabled?.() ?? false;
		this.onDiplomacyColorsChange(initialState);
		diplomacyColors.registerDiplomacyColorsChangeHandler(this.onDiplomacyColorsChange.bind(this));
		registerHotkeyChangeHandler(this.onHotkeyChange.bind(this));
	}

	onHotkeyChange()
	{
		this.diplomacyColorsButton.tooltip =
			colorizeHotkey("%(hotkey)s" + " ", "session.diplomacycolors") +
			translate(this.Tooltip);
	}

	onDiplomacyColorsChange(enabled)
	{
		this.diplomacyColorsButton.sprite =
			enabled ? this.theme.sprite_on : this.theme.sprite_off;

		this.diplomacyColorsButton.sprite_over =
			enabled ? this.theme.sprite_on_over : this.theme.sprite_off_over;
	}
}

MiniMapDiplomacyColorsButton.prototype.Tooltip = markForTranslation("Toggle Diplomacy Colors");
