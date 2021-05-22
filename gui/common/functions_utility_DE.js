/**
 * Returns random civ selection groups with translated titles and tooltips.
 */
function loadRandomCivGroups()
{
	let randomGroups = loadRandomCivFiles();

	translateObjectKeys(randomGroups, ["Title", "Tooltip"]);

	return deepfreeze(randomGroups);
}// end loadRandomCivGroups
