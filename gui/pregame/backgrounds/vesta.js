g_BackgroundLayerData.push(
	[
		{
			"offset": (time, width) => 0.08 * width * - Math.cos(0.07 * time),
			"sprite": "background-vesta-1",
			"tiling": true,
		},
		{
			"offset": (width) => 0 * width,
			"sprite": "background-vesta-2",
			"tiling": true,
		},
		{
			"offset": (time, width) => 0.03 * width * Math.cos(0.07 * time),
			"sprite": "background-vesta-3",
			"tiling": false,
		},
		{
			"offset": (time, width) => 0.02 * width * Math.cos(0.07 * time),
			"sprite": "background-vesta-4",
			"tiling": false,
		},
		{
			"offset": (time, width) => 0.02 * width * Math.cos(0.07 * time),
			"sprite": "background-vesta-5",
			"tiling": false,
		},
	]);
