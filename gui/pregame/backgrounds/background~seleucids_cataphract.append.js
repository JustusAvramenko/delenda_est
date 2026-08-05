backgrounds['seleucids_cataphract'] = [
	{
		"offset": (time, width) => 0.10 * width * Math.cos(0.04 * time),
		"sprite": "background-seleucid1_2",
		"tiling": true,
	},
	{
		"offset": (time, width) => 0.0 * width * Math.cos(0.0 * time),
		"sprite": "seleucid-emblem",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.17 * width * Math.cos(0.05 * time) + width / 8,
		"sprite": "background-seleucid1_3",
		"tiling": false,
	},
];