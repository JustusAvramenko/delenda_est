backgrounds['spartans_dodona'] = [
	{
		"offset": (time, width) => 0.10 * width * Math.cos(0.02 * time) + width/16,
		"sprite": "background-spartans2-0",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.0 * width * Math.cos(0.0 * time),
		"sprite": "background-spartans2-1",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.20 * width * Math.cos(0.04 * time) + width/16,
		"sprite": "smoke-orange",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.16 * width * Math.cos(0.15 * time) + width/16,
		"sprite": "smoke-gray",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.16 * width * Math.cos(0.05 * time) + width/16,
		"sprite": "background-spartans2-2",
		"tiling": false,
	},
];