const g_RandomCivGroups = loadRandomCivGroups().map((group) => {
	if (group.Disable)
		return null;
	if (!group.Title || !group.Code) {
		error(sprintf('Random civ groups must have Title and Code; disabling %s (%s)', group.Title || 'undefined', group.Code || 'undefined'));
		return null;
	}
	if (!group.Code.split('').every((ch) => (ch >= 'a' && ch <= 'z') || ch === '_')) {
		error(sprintf('Random civ group Codes can only contain letters a-z and _; disabling %s (%s)', group.Title, group.Code));
		return null;
	}
	let weights = {};
	if (group.Weights.hasOwnProperty('*') && group.Weights['*'] !== 0) {
		let std_weight = group.Weights['*'];
		if (std_weight < 0) {
			error(sprintf('Random civ group weights must be >= 0 (got "*": %d); disabling %s', std_weight, group.Title));
			return null;
		}
		for (let civ in g_CivData) {
			if (g_CivData[civ].SelectableInGameSetup)
				weights[civ] = std_weight;
		}
	}
	for (let civ in group.Weights) {
		if (civ === '*')
			continue;
		if (group.Weights[civ] < 0) {
			error(sprintf('Random civ group weights must be >= 0 (got "%s": %d); disabling %s', civ, group.Weights[civ], group.Title));
			return null;
		}
		if (g_CivData.hasOwnProperty(civ) && g_CivData[civ].SelectableInGameSetup)
			weights[civ] = group.Weights[civ];
		if (weights[civ] === 0)
			delete weights[civ];
	}// end for civ
	if (Object.keys(weights).length < 2)
	{
		return null;
	}
	let filtered_group = {};
	for (let property in group) {
		if (property !== 'Weights')
			filtered_group[property] = group[property];
	}
	if (!filtered_group.Tooltip)
		filtered_group.Tooltip = 'Random civ selection group';
	if (!filtered_group.GUIOrder && filtered_group.GUIOrder !== 0)
		filtered_group.GUIOrder = 3;
	filtered_group.Weights = weights;
	return filtered_group;
}).filter((group) => group).map((() => {
	let group_codes = {};
	return (group) => {
		if (group_codes.hasOwnProperty(group.Code)) {
			group_codes[group.Code] += 1;
			group.Code = sprintf('%s_%d', group.Code, group_codes[group.Code]);
		} else {
			group_codes[group.Code] = 1;
		}
		return group;
	};
})());
