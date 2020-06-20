g_Commands["civ-choice"] = function(player, cmd, data)
{
	var cmpTechnologyManager = QueryPlayerIDInterface(player, IID_TechnologyManager);
	cmpTechnologyManager.ResearchTechnology(cmd.template);
};
