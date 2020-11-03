const CIV_CHOICE_BUTTON_WIDTH = 266;
const CIV_CHOICE_BUTTON_SPACING = 10;

function initCivChoicesDialog()
{
	if (g_ViewedPlayer < 0)
		return;

	let currentPlayer = g_Players[g_ViewedPlayer];
	let civChoices = g_CivData[currentPlayer.civ].CivChoices;
	if (civChoices === undefined)
		return;

	for (let i = 0; i < civChoices.length; ++i)
	{
		let civChoiceTechResearched = Engine.GuiInterfaceCall("IsTechnologyResearched", {
			"tech": civChoices[i],
			"player": g_ViewedPlayer
		});
		if (civChoiceTechResearched)
			return;
	}

	let civChoicesDialogPanel = Engine.GetGUIObjectByName("civChoicesDialogPanel");
	let civChoicesDialogPanelWidth = civChoicesDialogPanel.size.right - civChoicesDialogPanel.size.left;
	let buttonsLength = CIV_CHOICE_BUTTON_WIDTH * civChoices.length + CIV_CHOICE_BUTTON_SPACING * (civChoices.length - 1);
	let buttonsStart = (civChoicesDialogPanelWidth - buttonsLength) / 2;

	for (let i = 0; i < civChoices.length; ++i)
	{
		let civChoiceTechData = GetTechnologyData(civChoices[i]);

		let civChoiceButton = Engine.GetGUIObjectByName("civChoice[" + i + "]");
        civChoiceButton.caption = civChoiceTechData.name.generic;

        let size = civChoiceButton.size;
		size.left = buttonsStart + (CIV_CHOICE_BUTTON_WIDTH + CIV_CHOICE_BUTTON_SPACING) * i;
		size.right = size.left + CIV_CHOICE_BUTTON_WIDTH;
		civChoiceButton.size = size;

		civChoiceButton.onPress = (function(tech) { return function() {
			Engine.PostNetworkCommand({ "type": "civ-choice", "template": tech });
			Engine.GetGUIObjectByName("civChoicesDialogPanel").hidden = true;
		}})(civChoices[i]);

		let civChoiceIcon = Engine.GetGUIObjectByName("civChoiceIcon[" + i + "]");
        civChoiceIcon.sprite = "stretched:session/portraits/" + civChoiceTechData.icon;
		civChoiceButton.hidden = false;
	}
	civChoicesDialogPanel.hidden = false;
}