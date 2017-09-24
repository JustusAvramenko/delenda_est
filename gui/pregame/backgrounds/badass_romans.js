g_BackgroundLayerData.push(
	[
		{
			"offset": (time, width) => 0.0 * width * Math.cos(0.0 * time),
			"sprite": "background-romans_carthage1-1",
			"tiling": false,
		},
		{
			"offset": (time, width) => 0.16 * width * Math.cos(0.05 * time) + width/16,
			"sprite": "background-romans_carthage1-3",
			"tiling": false,
		},
	]);
