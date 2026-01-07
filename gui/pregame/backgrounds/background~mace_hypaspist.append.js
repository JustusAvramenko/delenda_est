backgrounds['mace_hypaspist'] = [
	{
		"offset": (time, width) => 0.0 * width * Math.cos(0.0 * time),
		"sprite": "background-pella2-0",
		"tiling": true,
	},
	{
		"offset": (time, width) => 0.20 * width * Math.cos(0.04 * time) + width/16,
		"sprite": "smoke-orange-p",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.14 * width * Math.cos(0.05 * time) + width / 4,
		"sprite": "background-pella2-1",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.16 * width * Math.cos(0.15 * time) + width/16,
		"sprite": "smoke-gray-p",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.10 * width * Math.cos(0.06 * time) + width/16,
		"sprite": "background-pella2-2",
		"tiling": false,
	},
];