backgrounds['hellenes'] = [
	{
		"offset": (time, width) => 0.02 * width * Math.cos(0.05 * time),
		"sprite": "background-hellenes1-1",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.10 * width * Math.cos(0.08 * time) - width / 10,
		"sprite": "background-hellenes1-2",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.20 * width * Math.cos(0.04 * time) + width/16,
		"sprite": "smoke-orange",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.14 * width * Math.cos(0.05 * time) + width / 4,
		"sprite": "background-hellenes1-3",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.16 * width * Math.cos(0.15 * time) + width/16,
		"sprite": "smoke-gray",
		"tiling": false,
	},
];