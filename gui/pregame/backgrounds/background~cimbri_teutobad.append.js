backgrounds['cimbri_teutobad'] = [
	{
		"offset": (time, width) => width/16,
		"sprite": "teutobad-bg",
		"tiling": false,
	},
	{
		"offset": (time, width) => -0.05 * width * Math.cos(0.24 * time) + width/16,
		"sprite": "smoke-gray-teutobad",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.16 * width * Math.cos(0.05 * time) + width/16,
		"sprite": "teutobad-man",
		"tiling": false,
	},
];