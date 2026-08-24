export const mainMenuItems = [
	{
		"caption": translate("Learn to Play"),
		"tooltip": translate("Learn how to play, start the tutorial, discover the technology trees, and the history behind the civilizations."),
		"submenu": [
			{
				"caption": translate("Manual"),
				"tooltip": colorizeHotkey(translate("%(hotkey)s: Open the 0 A.D. Game Manual."), "manual"),
				"hotkey": "manual",
				"onPress": () =>
				{
					Engine.OpenChildPage("page_manual.xml");
				}
			},
			{
				"caption": translate("Tutorial"),
				"tooltip": translate("Start the introductory tutorial."),
				"onPress": closePageCallback =>
				{
					closePageCallback({ [Engine.openRequest]: {
						"page": "page_autostart.xml",
						"argument": {
							"attribs": {
								"mapType": "scenario",
								"map": "maps/tutorials/introductory_tutorial",
								"settings": {
									"CheatsEnabled": true
								},
							},
							"playerAssignments": {
								"local": {
									"player": 1,
									"name": Engine.ConfigDB_GetValue("user",
										"playername.singleplayer") ||
										Engine.GetSystemUsername()
								}
							},
							"storeReplay": true
						}
					} });
				}
			},
			{
				"caption": translate("Tips and Tricks"),
				"tooltip": colorizeHotkey(translate("%(hotkey)s: Discover simple tips, tricks, and game mechanics."), "tips"),
				"hotkey": "tips",
				"onPress": Engine.OpenChildPage.bind(null, "page_tips.xml", {
					"tipScrolling": true
				})
			},
			{
				"caption": translate("Structure Tree"),
				"tooltip": colorizeHotkey(translate("%(hotkey)s: View the structure tree of civilizations featured in 0 A.D."), "structree"),
				"hotkey": "structree",
				"onPress": () =>
				{
					Engine.OpenChildPage("page_structree.xml");
				}
			},
			{
				"caption": translate("Civilization Overview"),
				"tooltip": colorizeHotkey(translate("%(hotkey)s: Learn about the civilizations featured in 0 A.D."), "civinfo"),
				"hotkey": "civinfo",
				"onPress": () =>
				{
					Engine.OpenChildPage("page_civinfo.xml");
				}
			},
			{
				"caption": translate("Catafalque Overview"),
				"tooltip": colorizeHotkey(translate("%(hotkey)s: Compare the bonuses of catafalques featured in 0 A.D."), "catafalque"),
				"hotkey": "catafalque",
				"onPress": () =>
				{
					Engine.OpenChildPage("page_catafalque.xml");
				}
			},
			{
				"caption": translate("Map Overview"),
				"tooltip": colorizeHotkey(translate("%(hotkey)s: View the different maps featured in 0 A.D."), "mapbrowser"),
				"hotkey": "mapbrowser",
				"onPress": () =>
				{
					Engine.OpenChildPage("page_mapbrowser.xml");
				}
			}
		]
	},
	{
		"caption": translate("Continue Campaign"),
		"tooltip": translate("Relive history through historical military campaigns."),
		"onPress": closePageCallback =>
		{
			try
			{
				closePageCallback({ [Engine.openRequest]: {
					"page": CampaignRun.getCurrentRun().getMenuPath()
				} });
			}
			catch(err)
			{
				error("Error opening campaign run:");
				error(err.toString());
			}
		},
		"enabled": () => CampaignRun.hasCurrentRun()
	},
	{
		"caption": translate("Single-player"),
		"tooltip": translate("Start, load, or replay a single-player game."),
		"submenu": [
			{
				"caption": translate("Matches"),
				"tooltip": translate("Start a new single-player game."),
				"onPress": closePageCallback =>
				{
					closePageCallback({ [Engine.openRequest]: {
						"page": "page_gamesetup.xml"
					} });
				}
			},
			{
				"caption": translate("Load Game"),
				"tooltip": translate("Load a saved game."),
				"onPress": async(closePageCallback) =>
				{
					const gameId = await Engine.OpenChildPage("page_loadgame.xml");

					if (!gameId)
						return;

					const metadata = Engine.StartSavedGame(gameId);
					if (!metadata)
					{
						error("Could not load saved game: " + gameId);
						return;
					}

					closePageCallback({ [Engine.openRequest]: {
						"page": "page_loading.xml",
						"argument": {
							"attribs": metadata.initAttributes,
							"playerAssignments": {
								"local": {
									"name": metadata.initAttributes.settings.
										PlayerData[metadata.playerID]?.Name ??
										singleplayerName(),
									"player": metadata.playerID
								}
							},
							"savedGUIData": metadata.gui
						}
					} });
				}
			},
			{
				"caption": translate("Continue Campaign"),
				"tooltip": translate("Relive history through historical military campaigns."),
				"onPress": closePageCallback =>
				{
					try
					{
						closePageCallback({ [Engine.openRequest]: {
							"page": CampaignRun.getCurrentRun().getMenuPath()
						} });
					}
					catch(err)
					{
						error("Error opening campaign run:");
						error(err.toString());
					}
				},
				"enabled": () => CampaignRun.hasCurrentRun()
			},
			{
				"caption": translate("New Campaign"),
				"tooltip": translate("Relive history through historical military campaigns."),
				"onPress": closePageCallback =>
				{
					closePageCallback({ [Engine.openRequest]: {
						"page": "campaigns/setup/page.xml"
					} });
				}
			},
			{
				"caption": translate("Load Campaign"),
				"tooltip": translate("Relive history through historical military campaigns."),
				"onPress": closePageCallback =>
				{
					// Replace the main menu page instead of opening a child page, otherwise the
					// "Continue Campaign" button could wrongly remain enabled when it's closed
					// again.
					// TODO: find a better solution.
					closePageCallback({ [Engine.openRequest]: {
						"page": "campaigns/load_modal/page.xml"
					} });
				}
			},
			{
				"caption": translate("Replays"),
				"tooltip": translate("Playback previous games."),
				"onPress": closePageCallback =>
				{
					closePageCallback({ [Engine.openRequest]: {
						"page": "page_replaymenu.xml",
						"argument": {
							"replaySelectionData": {
								"filters": {
									"singleplayer": "Single-player"
								}
							}
						}
					} });
				}
			}
		]
	},
	{
		"caption": translate("Multiplayer"),
		"tooltip": translate("Fight against one or more human players in a multiplayer game."),
		"submenu": [
			{
				"caption": translate("Game Lobby"),
				"tooltip":
					colorizeHotkey(translate("%(hotkey)s: Launch the multiplayer lobby to join and host publicly visible games and chat with other players."), "lobby") +
					(Engine.StartXmppClient ? "" : translate("Launch the multiplayer lobby. \\[DISABLED BY BUILD]")),
				"enabled": () => !!Engine.StartXmppClient,
				"hotkey": "lobby",
				"onPress": async(closePageCallback) =>
				{
					if (!Engine.StartXmppClient)
						return;
					const ret = await Engine.OpenChildPage("page_prelobby_entrance.xml");
					if (ret)
						closePageCallback({ [Engine.openRequest]: ret });
				}
			},
			{
				// Translation: Join a game by specifying the host's IP address.
				"caption": translate("Connect by IP"),
				"tooltip": translate("Joining an existing multiplayer game at a given IP address."),
				"onPress": async(closePageCallback) =>
				{
					const ret = await Engine.OpenChildPage("page_gamesetup_mp.xml", {
						"multiplayerGameType": "join"
					});
					if (ret !== undefined)
						closePageCallback({ [Engine.openRequest]: ret });
				}
			},
			{
				"caption": translate("Host New Game"),
				"tooltip": translate("Host a new multiplayer game. Other players can connect directly to you via your IP address."),
				"onPress": async(closePageCallback) =>
				{
					const ret = await Engine.OpenChildPage("page_gamesetup_mp.xml", {
						"multiplayerGameType": "host",
						"loadSavedGame": false
					});
					if (ret !== undefined)
						closePageCallback({ [Engine.openRequest]: ret });
				}
			},
			{
				"caption": translate("Host Saved Game"),
				"tooltip": translate("Continue playing a game from a savegame."),
				"onPress": async(closePageCallback) =>
				{
					const ret = await Engine.OpenChildPage("page_gamesetup_mp.xml", {
						"multiplayerGameType": "host",
						"loadSavedGame": true
					});
					if (ret !== undefined)
						closePageCallback({ [Engine.openRequest]: ret });
				}
			},
			{
				"caption": translate("Replays"),
				"tooltip": translate("Playback previous games."),
				"onPress": closePageCallback =>
				{
					closePageCallback({ [Engine.openRequest]: {
						"page": "page_replaymenu.xml",
						"argument": {
							"replaySelectionData": {
								"filters": {
									"singleplayer": "Multiplayer"
								}
							}
						}
					} });
				}
			}
		]
	},
	{
		"caption": translate("Settings"),
		"tooltip": translate("Change game options."),
		"submenu": [
			{
				"caption": translate("Options"),
				"tooltip": colorizeHotkey(translate("%(hotkey)s: Adjust game settings."), "options"),
				"hotkey": "options",
				"onPress": async() =>
				{
					fireConfigChangeHandlers(await Engine.OpenChildPage("page_options.xml"));
				}
			},
			{
				"caption": translate("Hotkeys"),
				"tooltip": colorizeHotkey(translate("%(hotkey)s: Adjust hotkeys."), "hotkeys"),
				"hotkey": "hotkeys",
				"onPress": () =>
				{
					Engine.OpenChildPage("page_hotkeys.xml");
				}
			},
			{
				"caption": translate("Language"),
				"tooltip": translate("Choose the language of the game."),
				"onPress": async(closePageCallback) =>
				{
					if (!await Engine.OpenChildPage("page_locale.xml"))
						return;

					closePageCallback({ [Engine.openRequest]: {
						"page": "page_pregame.xml"
					} });
				}
			},
			{
				"caption": translate("Mod Selection"),
				"tooltip": translate("Select and download mods for the game."),
				"onPress": closePageCallback =>
				{
					closePageCallback({ [Engine.openRequest]: {
						"page": "page_modmod.xml"
					} });
				}
			},
			{
				"caption": translate("Welcome Screen"),
				"tooltip": translate("Show the Welcome Screen again. Useful if you hid it by mistake."),
				"onPress": closePageCallback =>
				{
					closePageCallback({ [Engine.openRequest]: {
						"page": "page_splashscreen.xml"
					} });
				}
			}
		]
	},
	{
		"caption": translate("Atlas Map Editor"),
		"tooltip": translate('Open the Atlas Scenario Editor in a new window. You can run this more reliably by starting the game with the command-line argument "-editor".'),
		"onPress": async(closePageCallback) =>
		{
			if (!Engine.AtlasIsAvailable())
			{
				messageBox(
					400, 200,
					translate("The scenario editor is not available or failed to load. See the game logs for additional information."),
					translate("Error"));
				return;
			}

			const buttonIndex = await messageBox(
				400, 200,
				translate("Are you sure you want to quit 0 A.D. and open the Scenario Editor?"),
				translate("Confirmation"),
				[translate("No"), translate("Yes")]);

			if (buttonIndex === 1)
				closePageCallback(Engine.startAtlas);
		}
	},
	{
		"caption": translate("Credits"),
		"tooltip": translate("Show the 0 A.D. credits."),
		"onPress": () =>
		{
			Engine.OpenChildPage("page_credits.xml");
		}
	},
	{
		"caption": translate("Exit"),
		"tooltip": translate("Exit the game."),
		"onPress": async(closePageCallback) =>
		{
			const buttonIndex = await messageBox(
				400, 200,
				translate("Are you sure you want to quit 0 A.D.?"),
				translate("Confirmation"),
				[translate("No"), translate("Yes")]);

			if (buttonIndex === 1)
				closePageCallback();
		}
	}
];
