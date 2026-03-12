
MapFilters.prototype.Filters = [
	{
		"Name": "default",
		"Title": translate("Featured Maps"),
		"Description": translate("Maps that are featured in Delenda Est."),
		"Match": ["featured"]
	},
	{
		"Name": "land",
		"Title": translate("Land Maps"),
		"Description": translate("Maps where ships are not needed to reach the enemy."),
		"Match": ["!naval !demo !hidden"]
	},
	{
		"Name": "naval",
		"Title": translate("Naval Maps"),
		"Description": translate("Maps where ships are needed to reach the enemy."),
		"Match": ["naval"]
	},
	{
		"Name": "new",
		"Title": translate("New Maps"),
		"Description": translate("Maps that are brand new in this release of the game."),
		"Match": ["new"]
	},
	{
		"Name": "multiplayer",
		"Title": translate("Best for MP"),
		"Description": translate("Maps that are recommended for Multiplayer play."),
		"Match": ["multiplayer"]
	},
	{
		"Name": "trigger",
		"Title": translate("Trigger Maps"),
		"Description": translate("Maps that come with scripted events and potentially spawn enemy units."),
		"Match": ["trigger"]
	},
	{
		"Name": "demo",
		"Title": translate("Demo Maps"),
		"Description": translate("These maps are not playable but for demonstration purposes only."),
		"Match": ["demo"]
	},
	{
		"Name": "all",
		"Title": translate("All Maps"),
		"Description": translate("Every map of the chosen maptype."),
		"Match": "!"
	}
];
