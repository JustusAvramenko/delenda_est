function Identity() {}

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

Identity.prototype.Init = function()
{
	this.classesList = GetIdentityClasses(this.template);
	this.visibleClassesList = GetVisibleIdentityClasses(this.template);
	if (this.template.Phenotype)
	{
		const phenotypes = this.GetPossiblePhenotypes();
		// TODO: this is a workaround to avoid calling Math.random,
		// which causes out of sync RNG caused by preview entities.
		// However, it's not random enough. Perhaps use the actor seed.
		this.phenotype = phenotypes[this.entity % phenotypes.length];
	}
	else
		this.phenotype = "default";

	this.controllable = this.template.Controllable ? this.template.Controllable == "true" : true;
};

Identity.prototype.Deserialize = function(data)
{
	this.Init();
	this.phenotype = data.phenotype;
	this.controllable = data.controllable;
	if (data.name)
		this.name = data.name;
};

Identity.prototype.Serialize = function()
{
	const result = {
		"phenotype": this.phenotype,
		"controllable": this.controllable,
	};
	if (this.name)
		result.name = this.name;
	return result;
};

Identity.prototype.GetCiv = function()
{
	return this.template.Civ;
};

Identity.prototype.GetLang = function()
{
	return this.template.Lang || "greek"; // ugly default
};

/**
 * Get a list of possible Phenotypes.
 * @return {string[]} A list of possible phenotypes.
 */
Identity.prototype.GetPossiblePhenotypes = function()
{
	return this.template.Phenotype._string.split(/\s+/);
};

/**
 * Get the current Phenotype.
 * @return {string} The current phenotype.
 */
Identity.prototype.GetPhenotype = function()
{
	return this.phenotype;
};

Identity.prototype.GetRank = function()
{
	return this.template.Rank || "";
};

Identity.prototype.GetRankTechName = function()
{
	return this.template.Rank ? "unit_" + this.template.Rank.toLowerCase() : "";
};

Identity.prototype.GetClassesList = function()
{
	return this.classesList;
};

Identity.prototype.GetVisibleClassesList = function()
{
	return this.visibleClassesList;
};

Identity.prototype.HasClass = function(name)
{
	return this.GetClassesList().indexOf(name) != -1;
};

Identity.prototype.GetSelectionGroupName = function()
{
	return this.template.SelectionGroupName || "";
};

Identity.prototype.GetGenericName = function()
{
	return this.template.GenericName;
};

Identity.prototype.IsUndeletable = function()
{
	return this.template.Undeletable == "true";
};

Identity.prototype.IsControllable = function()
{
	return this.controllable;
};

Identity.prototype.SetControllable = function(controllability)
{
	this.controllable = controllability;
};

/**
 * Change the phenotype of the entity.
 * @param {string} phenotype
 * @returns {boolean} Whether the phenotype was changed.
 * If yes, check if VisualActor::RecomputeActorName needs to be called.
 */
Identity.prototype.SetPhenotype = function(phenotype)
{
	if (this.phenotype == phenotype)
		return false;
	if (this.GetPossiblePhenotypes().indexOf(phenotype) === -1)
		return false;
	this.phenotype = phenotype;
	return true;
};

/**
 * @param {string} newName -
 */
Identity.prototype.SetName = function(newName)
{
	this.name = newName;
};

/**
 * @return {string} -
 */
Identity.prototype.GetName = function()
{
	return this.name || this.template.GenericName;
};

function IdentityMirage() {}
IdentityMirage.prototype.Init = function(cmpIdentity)
{
	// Mirages don't get identity classes via the template-filter, so that code can query
	// identity components via Engine.QueryInterface without having to explicitly check for mirages.
	// This is cloned as otherwise we get a reference to Identity's property,
	// and that array is deleted when serializing (as it's not seralized), which ends in OOS.
	this.classes = clone(cmpIdentity.GetClassesList());
};
IdentityMirage.prototype.GetClassesList = function() { return this.classes; };

Engine.RegisterGlobal("IdentityMirage", IdentityMirage);

Identity.prototype.Mirage = function()
{
	const mirage = new IdentityMirage();
	mirage.Init(this);
	return mirage;
};

Engine.RegisterComponentType(IID_Identity, "Identity", Identity);
