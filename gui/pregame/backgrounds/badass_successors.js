g_BackgroundLayerData.push(
	[
		{
			"offset": (time, width) => 0.0 * width * Math.cos(0.0 * time),
			"sprite": "background-successors1-1",
			"tiling": false,
		},
		{
			"offset": (time, width) => 0.16 * width * Math.cos(0.08 * time) + width/16,
			"sprite": "background-successors-smoke",
			"tiling": false,
		},
	]);
