/**
 * Loads files for random civ selection.
 *
 */
function loadRandomCivFiles()
{
	let randomGroups = [];

	for (let filename of Engine.ListDirectoryFiles("simulation/data/settings/random_groups/", "*.json", false))
	{
		let data = Engine.ReadJSONFile(filename);

		randomGroups.push(data);
	}// end for let filename

	return randomGroups;
}// end loadCivFiles
