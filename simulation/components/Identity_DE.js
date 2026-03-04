Identity.prototype.Schema =
	"<a:help>Specifies various names and values associated with the entity, typically for GUI display to users.</a:help>" +
	"<a:example>" +
		"<Civ>athen</Civ>" +
		"<GenericName>Athenian Hoplite</GenericName>" +
		"<SpecificName>Hoplī́tēs Athēnaïkós</SpecificName>" +
		"<Icon>units/athen/infantry_spearman.png</Icon>" +
	"</a:example>" +
	"<element name='Civ' a:help='Civilization that this unit is primarily associated with, typically a 4-letter code. Choices include: gaia (world objects), skirm (skirmish map placeholders), athen (Athenians), brit (Britons), cart (Carthaginians), cimb (Cimbrians), epir (Epirotes), gala (Galatians), gaul (Gauls), goth (Goths), han (Han Chinese), huns (Huns), iber (Iberians), imp (Imperial Romans), kush (Kushites), mace (Macedonians), maur (Mauryas), noba (Nobas), pers (Persians), ptol (Ptolemies), rome (Romans), scyth (Scythians), sele (Seleucids), spart (Spartans), sueb (Suebians), syrac (Syracusans), theb (Thebans), xion (Xiongnu), yayo (Yamatai), zapo (Zapotecs).'>" +
		"<text/>" +
	"</element>" +
	"<optional>" +
		"<element name='Lang' a:help='Unit language for voices.'>" +
			"<text/>" +
		"</element>" +
	"</optional>" +
	"<optional>" +
		"<element name='Phenotype' a:help='Unit phenotype for voices and visual. If more than one is specified a random one will be chosen.'>" +
			"<attribute name='datatype'>" +
				"<value>tokens</value>" +
			"</attribute>" +
			"<text/>" +
		"</element>" +
	"</optional>" +
	"<element name='GenericName' a:help='Generic English-language name for this entity.'>" +
		"<optional>" +
			"<attribute name='context'>" +
				"<text/>" +
			"</attribute>" +
		"</optional>" +
		"<optional>" +
			"<attribute name='comment'>" +
				"<text/>" +
			"</attribute>" +
		"</optional>" +
		"<text/>" +
	"</element>" +
	"<optional>" +
		"<element name='SpecificName' a:help='Specific native-language name for this entity.'>" +
			"<optional>" +
				"<attribute name='context'>" +
					"<text/>" +
				"</attribute>" +
			"</optional>" +
			"<optional>" +
				"<attribute name='comment'>" +
					"<text/>" +
				"</attribute>" +
			"</optional>" +
			"<text/>" +
		"</element>" +
	"</optional>" +
	"<optional>" +
		"<element name='SelectionGroupName' a:help='Name used to group ranked entities.'>" +
			"<text/>" +
		"</element>" +
	"</optional>" +
	"<optional>" +
		"<element name='Tooltip'>" +
			"<optional>" +
				"<attribute name='context'>" +
					"<text/>" +
				"</attribute>" +
			"</optional>" +
			"<optional>" +
				"<attribute name='comment'>" +
					"<text/>" +
				"</attribute>" +
			"</optional>" +
			"<text/>" +
		"</element>" +
	"</optional>" +
	"<optional>" +
		"<element name='History'>" +
			"<optional>" +
				"<attribute name='context'>" +
					"<text/>" +
				"</attribute>" +
			"</optional>" +
			"<optional>" +
				"<attribute name='comment'>" +
					"<text/>" +
				"</attribute>" +
			"</optional>" +
			"<text/>" +
		"</element>" +
	"</optional>" +
	"<optional>" +
		"<element name='Rank'>" +
			"<optional>" +
				"<attribute name='context'>" +
					"<text/>" +
				"</attribute>" +
			"</optional>" +
			"<optional>" +
				"<attribute name='comment'>" +
					"<text/>" +
				"</attribute>" +
			"</optional>" +
			"<choice>" +
				"<value>Basic</value>" +
				"<value>Advanced</value>" +
				"<value>Elite</value>" +
				"<value>Untested</value>" +
				"<value>Heroic</value>" +
				"<value>Legendary</value>" +
				"<value>Mythical</value>" +
			"</choice>" +
		"</element>" +
	"</optional>" +
	"<optional>" +
		"<element name='Classes' a:help='Optional list of space-separated classes applying to this entity. Choices include: AfricanElephant, AmunGuard, Animal, ApedemakGuard, Ashoka, Barter, Bireme, CitizenSoldier, CivCentre, CivSpecific, ConquestCritical, Domestic, DropsiteFood, DropsiteMetal, DropsiteStone, DropsiteWood, FastMoving, FemaleCitizen, Formation, Foundation, GarrisonFortress, Human, IndianElephant, Juggernaut, KushTrireme, MercenaryCamp, Organic, Player, PtolemyIV, Quinquereme, RotaryMill, SeaCreature, Spy, Structure, Trireme, Unit, WallLong, WallMedium, WallShort, WallTower.'>" +
			"<attribute name='datatype'>" +
				"<value>tokens</value>" +
			"</attribute>" +
			"<text/>" +
		"</element>" +
	"</optional>" +
	"<optional>" +
		"<element name='VisibleClasses' a:help='Optional list of space-separated classes applying to this entity. These classes will also be visible in various GUI elements. Choices include: Academy, Amphitheater, Archer, ArmyCamp, Arsenal, ArtilleryTower, Axeman, Barracks, BoltShooter, BoltTower, Bribable, Builder, Camel, Cavalry, Champion, Chariot, Citizen, City, Civic, CivilCentre, Colony, Corral, Council, Crossbowman, Defensive, Dock, Dog, Economic, Elephant, ElephantStable, Embassy, Farmstead, Field, Fireship, FishingBoat, Forge, Fortress, Gate, Gladiator, GreatTower, Gymnasium, Hall, Healer, Heavy, Hero, House, IceHouse, Immortal, ImperialCourt, ImperialMinistry, Infantry, Javelineer, LaoziGate, Library, Light, Lighthouse, Maceman, Medium, Melee, Market, Mercenary, Military, Minister, Monument, Naval, Outpost, Palace, Palisade, Pikeman, Pillar, Pyramid, Ram, Range, Ranged, Relic, Resource, SentryTower, Ship, Shipyard, Shrine, Siege, SiegeTower, SiegeWall, Slave, Slinger, Soldier, Spearman, Stable, Stoa, StoneThrower, StoneTower, Storehouse, Support, Swordsman, Syssiton, Temple, TempleOfAmun, TempleOfApedemak, TempleOfMars, TempleOfVesta, Tent, Theater, Tower, Town, Trade, Trader, TriumphalArch, Trumpeter, Village, Wall, Warship, Wonder, Worker.'>" +
			"<optional>" +
				"<attribute name='context'>" +
					"<text/>" +
				"</attribute>" +
			"</optional>" +
			"<optional>" +
				"<attribute name='comment'>" +
					"<text/>" +
				"</attribute>" +
			"</optional>" +
			"<attribute name='datatype'>" +
				"<value>tokens</value>" +
			"</attribute>" +
			"<text/>" +
		"</element>" +
	"</optional>" +
	"<element name='Icon'>" +
		"<text/>" +
	"</element>" +
	"<optional>" +
		RequirementsHelper.BuildSchema() +
	"</optional>" +
	"<optional>" +
		"<element name='Controllable' a:help='Whether players can control this entity. Defaults to true.'>" +
			"<data type='boolean'/>" +
		"</element>" +
	"</optional>" +
	"<element name='Undeletable' a:help='Prevent players from deleting this entity.'>" +
		"<data type='boolean'/>" +
	"</element>";

Engine.ReRegisterComponentType(IID_Identity, "Identity", Identity);
