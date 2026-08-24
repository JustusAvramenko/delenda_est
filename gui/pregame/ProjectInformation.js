/**
 * IMPORTANT: Remember to update session/top_panel/BuildLabel.xml in sync with this.
 */
export const projectInformation = {
	"organizationName": {
		"caption": translate("WILDFIRE GAMES")
	},
	"organizationLogo": {
		"sprite": "WildfireGamesLogo"
	},
	"productLogo": {
		"sprite": "0ADLogo"
	},
	"productBuild": {
		"caption": getBuildString()
	},
	"productDescription": {
		"caption": setStringTags(translate("Release XXIX: Caryatid"), { "font": "sans-bold-16" }) + "\n\n" +
			translate("Notice: This mod is under development and many features have not been added yet.")
	}
};

export const communityButtons = [
	{
		"caption": translate("Mod Website"),
		"tooltip": translate("Click to open the mod's Mod.io page in your web browser."),
		"size": "8 100%-148 50%-4 100%-116",
		"onPress": () =>
		{
			openURL("https://mod.io/g/0ad/m/delenda-est#description");
		}
	},
	{
		"caption": translate("Chat"),
		"tooltip": translate("Click to open the 0 A.D. IRC chat in your browser (#0ad on webchat.quakenet.org). It is run by volunteers who do all sorts of tasks, it may take a while to get your question answered. Alternatively, you can use the forum (see Website)."),
		"size": "50%+4 100%-148 100%-8 100%-116",
		"onPress": () =>
		{
			openURL("https://webchat.quakenet.org/?channels=0ad");
		}
	},
	{
		"caption": translate("Report a Bug"),
		"tooltip": translate("Click to visit the Delenda Est issue tracker on Github."),
		"size": "8 100%-112 50%-4 100%-80",
		"onPress": () =>
		{
			openURL("https://github.com/JustusAvramenko/delenda_est/issues");
		}
	},
	{
		"caption": translateWithContext("Frequently Asked Questions", "FAQ"),
		"tooltip": translate("Click to visit the Frequently Asked Questions page in your browser."),
		"size": "50%+4 100%-112 100%-8 100%-80",
		"onPress": () =>
		{
			openURL("https://gitea.wildfiregames.com/0ad/0ad/wiki/FAQ");
		}
	},
	{
		"caption": translate("Delenda Est Forum"),
		"tooltip": translate("Click to discuss Delenda Est on the Wildfire Games forum."),
		"size": "8 100%-76 100%-8 100%-44",
		"onPress": () =>
		{
			openURL("https://wildfiregames.com/forum/forum/448-delenda-est/");
		}
	},
	{
		"caption": translate("Help Develop the Mod"),
		"tooltip": translate("Check out the latest development version of the mod and contribute code and artwork."),
		"size": "8 100%-40 100%-8 100%-8",
		"onPress": () =>
		{
			openURL("https://github.com/JustusAvramenko/delenda_est");
		}
	}
];
