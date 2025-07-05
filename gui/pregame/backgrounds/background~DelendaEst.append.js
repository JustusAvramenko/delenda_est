// Remove all backgrounds from the game
for (const key in backgrounds) {
	if (Object.hasOwn(backgrounds, key)) {
		delete backgrounds[key];
	}
}

backgrounds["badass_actium"] = [
	{
		"offset": (time, width) => 0.0 * width * Math.cos(0.0 * time),
		"sprite": "background-actium1-1",
		"tiling": false,
	},
];

backgrounds["badass_alexander"] = [
	{
		"offset": (time, width) => 0.0 * width * Math.cos(0.0 * time),
		"sprite": "background-alexander1-1",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.16 * width * Math.cos(0.08 * time) + width/16,
		"sprite": "background-spartans1-smoke",
		"tiling": false,
	},
];

backgrounds['badass_romans'] = [
	{
		"offset": (time, width) => 0.0 * width * Math.cos(0.0 * time),
		"sprite": "background-romans_carthage1-1",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.20 * width * Math.cos(0.08 * time) + width/16,
		"sprite": "background-romans-smoke",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.16 * width * Math.cos(0.05 * time) + width/16,
		"sprite": "background-romans_carthage1-3",
		"tiling": false,
	},
];

backgrounds['badass_spartans'] = [
	{
		"offset": (time, width) => 0.0 * width * Math.cos(0.0 * time),
		"sprite": "background-spartans1-1",
		"tiling": false,
	},
	{
		"offset": (time, width) => 0.16 * width * Math.cos(0.08 * time) + width/16,
		"sprite": "background-spartans1-smoke",
		"tiling": false,
	},
];

backgrounds['badass_successors'] = [
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
];

backgrounds['kush'] = [
	{
		"offset": (time, width) => 0.07 * width * Math.cos(0.1 * time),
		"sprite": "background-kush1-1",
		"tiling": true
	},
	{
		"offset": (time, width) => 0.05 * width * Math.cos(0.1 * time),
		"sprite": "background-kush1-2",
		"tiling": true
	},
	{
		"offset": (time, width) => 0.04 * width * Math.cos(0.1 * time) + 0.01 * width * Math.cos(0.04 * time),
		"sprite": "background-kush1-3",
		"tiling": true
	},
	{
		"offset": (time, width) => 0.25 * width * Math.cos(0.08 * time) + width/16,
		"sprite": "background-kush-smoke",
		"tiling": false,
	},
	{
		"offset": (time, width) => -0.1,
		"sprite": "background-kush1-4",
		"tiling": true
	},
];