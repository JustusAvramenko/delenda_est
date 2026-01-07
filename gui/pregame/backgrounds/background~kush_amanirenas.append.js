backgrounds['kush_amanirenas'] = [
	{
		"offset": (time, width) => 0.0 * width * Math.cos(0.0 * time),
		"sprite": "background-kush2-0",
		"tiling": true,
	},
	{
		"offset": (time, width) => 0.20 * width * Math.cos(0.10 * time) + width/16,
		"sprite": "smoke-orange-k",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.16 * width * Math.cos(0.05 * time) + width/16,
		"sprite": "background-kush2-1",
		"tiling": false,
	},
];