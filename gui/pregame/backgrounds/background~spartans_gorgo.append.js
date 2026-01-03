backgrounds['spartans_gorgo'] = [
	{
		"offset": (time, width) => 0.10 * width * Math.cos(0.02 * time) + width/16,
		"sprite": "background-gorgo1-0",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.0 * width * Math.cos(0.0 * time),
		"sprite": "background-gorgo1-1",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.20 * width * Math.cos(0.04 * time) + width/16,
		"sprite": "smoke-orange-g",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.16 * width * Math.cos(0.15 * time) + width/16,
		"sprite": "smoke-gray-g",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.16 * width * Math.cos(0.05 * time) + width/16,
		"sprite": "background-gorgo1-2",
		"tiling": false,
	},
];