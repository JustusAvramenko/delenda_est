backgrounds['leonidas'] = [
	{
		"offset": (time, width) => 0.0 * width * Math.cos(0.0 * time) + width/16,
		"sprite": "leonidas1-bg",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.20 * width * Math.cos(0.09 * time) + width/16,
		"sprite": "smoke-gray-leo1",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.20 * width * Math.cos(0.12 * time) + width/16,
		"sprite": "smoke-gray-leo2",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.16 * width * Math.cos(0.05 * time) + width/16,
		"sprite": "leonidas1-man",
		"tiling": false,
	},
];