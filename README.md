DELENDA EST: An overhaul mod for 0 A.D. Empires Ascendant
===========

OVERVIEW
===========
This is an overhaul mod for 0 A.D. Empires Ascendant. Its goal is to introduce a new balance scheme, a revamped and greatly expanded technology tree, and other customizations to the game. The mod endeavors to push the game's modding capability to the fullest and to make the gameplay as enjoyable and as rich as possible.

Keep in mind:
- This mod is incomplete. Not every new planned technology or gameplay change has been implemented yet.
- Many of the planned changes rely upon new features being implemented into the core game or engine.
- This mod can be used to encourage those new features being implemented either by modders, open-source contributors, or official WFG team.

Major unimplemented Features that this document assumes will eventually be implemented:

- Formations and Battalions: Hopefully either the WFG team agrees to add battalions or I can get some people together to implement Battalions and organized battalion combat. Battalions are based on those found in games like Battle for Middle Earth II or Rome: Total War, with some major and minor differences for 0 A.D. Discussion on Battalions is found in Mod Plan-Military.txt
- Trample: Some cavalry are planned to be better tramplers than others, so their stats would be adjusted accordingly. So, until Trample is implemented by the team or by modders some Cavalry stats may be wonky.
- Charging/Charge Bonus: Like Trample, this would affect Cavalry stats immensely, and it is hoped that this is eventually implemented in the game.
- Unit Conversion using a "Loyalty" mechanic: Some techs in this mod cannot be implemented yet (or are implemented in a different way) because capturing/converting units (like Sheep or Female Citizens) is not implemented. Hopefully this feature is implemented so this mod can add another layer of richness to the gameplay.
- Tech and Aura Modifications: These new modifications need to be implemented for this mod to reach its full potential: Altering Market Bartering recovery rates, Altering technology costs and speeds, (+ others here).
- Alternate or Secondary Attacks. Example 1: Roman Swordsman throwing a Pilum before closing in for melee. Example 2: Persian Immortal switching between Bow and Spear.

MAJOR OVERALL CHANGES
================
- Completely new unit balance and countering.
- A new 4th Phase: Imperial Phase, which unlocks major technologies and abilities. Requires 1 Wonder.
- Civic Centers are now buildable in the 3rd Phase (City Phase). This allows the players time to build up home defenses in Town Phase, or use the stone for a push to City Phase for expansion.
- A completely redesigned technology tree, customized for each civilization. Blacksmith and Fortress trees are especially new.
- Naval gameplay revamped with a Shipyard for the non-barbarian civs. Docks are for naval economy and Shipyard for naval warfare.
- New special buildings, such as the Temple of Vesta for the Romans, with new auras and features.
- Completely new "Imperial Romans" civ called the Principate Romans. They have a new slavery mechanic and new unit artwork. Their soldiers cannot gather resources, but they can build buildings. To unlock Phase techs, must build Triumphal Arches. This civ is very unique.
- Completely new Epirotes civ, with Molossian Dogs. Their roster is a mix of Hellenic and Hellenistic units with lots of allied units.
- Completely new Thebans civ, with the Fire Raiser. They are the Greek civ most like the Macedonians (both have Siege Workshops), but the Thebans have 2 infantry champions and no cavalry champion.
- Carthaginians revamped considerably. Their Embassy (merc) units cost population, but their citizen-soldier units do not and have a training limit of 30.
- Mercenary Camps now added and mercenaries for most civs are in!
- Capturing buildings is revamped so that only civic buildings (Civic Center, Temple, House) are capturable. All others must be destroyed.
- New territory mechanics that encourage city-building. Farmsteads and Storehouses can be built outside the city territory, along with Outposts. This creates a "weak countryside" but "strong core" duality for the player.
- Farmlands are in and work as planned! Build fields on farmland to gain a 2x farming bonus. Building farms around Civic Centers and Temples gives a -50% farming penalty.
- The right kinds of units now show up on battlements (ranged infantry). This is made possible with a patch submitted by a contributor.
- New population costs. Support Units (Female Citizens, Healers, Traders) cost 1 pop, Infantry cost 2 pop, Cavalry cost 3 pop, and strong units like chariots, elephants, siege weapons, etc. cost more pop. Consequentually, the default population limit is now 500.

What is Broken
================
- Some Fortresses cannot have enough space for garrisoned units to show up on the walls. Some Fortress models may need redesigned for this purpose.
- Cost.BuildTime effect for auras is broken. This specifically neuters the "Delian League" team bonus for Athenians and the "Naval Architect" aura for Themistocles.
- I'll add more things here as I come across them.

NEW UNIT BALANCE
===========
The unit balance has been changed. The following list gives the basic changes, including features like charging that are not yet implemented in the full game.

Melee Citizen-Infantry
===========
Sword Infantry
- Attack: Hack, High
- Bonus: 1.5x vs. Infantry and Elephants
- Charge Bonus: 2x
- Hack Armor: High
- Pierce Armor: Low
- Speed: Medium

Spear Infantry
- Attack: Hack, Medium
- Bonus: 2x vs. Cavalry
- Charge Bonus: 2.5x
- Hack Armor: Medium
- Pierce Armor: Medium
- Speed: Medium

Pike Infantry
- Attack: Hack, Low
- Bonus: 4x vs. Cavalry
- Charge Bonus: 2x
- Hack Armor: High
- Pierce Armor: Medium
- Speed: Low

Ranged Citizen-Infantry
=============================
Archer Infantry
- Attack: Pierce, Low
- Range: High
- Accuracy: Low
- Rate: Medium
- Bonus: 1.5x vs. Melee Infantry
- Hack Armor: Low
- Pierce Armor: Medium
- Speed: Medium

Javelin Infantry
- Attack: Pierce, Medium
- Range: Medium
- Accuracy: Medium
- Rate: Medium
- Bonus: 1.5x vs. Ranged Cavalry, Spear Infantry, and Elephants
- Hack Armor: Low
- Pierce Armor: Medium
- Speed: High

Slinger Infantry
- Attack: Pierce, Low
- Range: Medium
- Accuracy: High
- Rate: High
- Bonus: 1.5x vs. Ranged Infantry and Sword Infantry
- Hack Armor: Low
- Pierce Armor: Low
- Speed: High

CITIZEN CAVALRY STATS
=================================================
- Penalty: Horse Cavalry 0.5x vs. Elephants and Camels
- Penalty: Camel .80x Speed
- Bonus: Camel 1.5x vs. Horse Cavalry
- Speed (walk/run/charge): 1.5x Infantry Counterparts

Melee Citizen-Cavalry
=======================
- Bonus: 2x vs. Siege
- Special: Trample Aura/Ability

Sword Cavalry
- Attack: Hack, High
- Bonus: 1.5x vs. Ranged Infantry and Ranged Cavalry
- Charge Bonus: 2.5x
- Trample: Low
- Hack Armor: Low
- Pierce Armor: High
- Speed: High

Spear Cavalry
- Attack: Hack, Medium
- Bonus: 2x vs. Ranged Infantry
- Charge Bonus: 4x
- Trample: Medium
- Hack Armor: Medium
- Pierce Armor: High
- Speed: Medium

Ranged Citizen-Cavalry
=============================
Archer Cavalry
- Attack: Pierce, Low
- Range: High
- Accuracy: Low
- Rate: Medium
- Bonus: 1.5x vs. Melee Infantry
- Hack Armor: Low
- Pierce Armor: Medium
- Speed: High

Javelin Cavalry
- Attack: Pierce, Medium
- Range: Medium
- Accuracy: Low
- Rate: Medium
- Bonus: 1.5x vs. Support
- Hack Armor: Low
- Pierce Armor: Low
- Speed: High

Other Melee Units
=================================================
Melee Elephant
- Attack: Hack, Medium; Crush, High
- Bonus: 2x vs. Cavalry, 1.5x vs. Structures
- Charge Bonus: 3x
- Trample: High
- Hack Armor: Medium
- Pierce Armor: High
- Speed: Low

Other Ranged Units
=================================================

Archer Chariot
- Attack: Pierce, Low
- Range: High
- Accuracy: Low
- Rate: Medium
- Trample: High
- Bonus: 1.5x vs. Melee Infantry
- Hack Armor: Medium
- Pierce Armor: Medium
- Speed: Medium

Javelin Chariot
- Attack: Pierce, Medium
- Range: Medium
- Accuracy: Medium
- Rate: Medium
- Trample: High
- Bonus: 1.5x vs. Support
- Hack Armor: Medium
- Pierce Armor: Medium
- Speed: Medium

Archer Elephant
- Attack: Pierce, Low
- Range: High
- Accuracy: Medium
- Rate: Medium
- Trample: High
- Bonus: 1.5x vs. Melee Infantry
- Hack Armor: High
- Pierce Armor: Medium
- Speed: Low

Citizen-Soldier Ranks/Promotions
=================================================
- Each new rank improves all stats by about +10% or 1.1x
- Each new rank decreases economic usefulness by about -25%.

Champions
=================================================
- Most stats +50% or 1.5x over their Citizen-Soldier counterparts of Basic Rank
- No economic abilities, though may have various kinds of inspiration auras affecting their citizen counterparts or other units
- Some Champions may have training limits, due to their elite status
- Champions are trained in Battalions/Formations by default (because they don't need to be broken up for fine-tuned economic tasks), except for the Persian Immortals who are trained extremely rapidly individually

Mercenaries
=========================
The following is a rundown of the Mercenaries and Mercenaries Camp mechanic:
- Mercenaries are trained at Mercenary Camps dotted around the map, capturable by players. The number of camps determined by the number of players: 2 merc camps for 2 players, 4 merc camps for 3-4 players, 6 merc camps for 5-6 players
- Mercenaries cost no population and train quickly, but can only be trained in limited numbers (usually 30; todo: make this scale by population cap) and cost a lot of Metal; this is normally the only way a player can train more units above the population cap
- Metal is almost always one of their costs, usually replacing the Food cost
- They do not perform economic tasks very well, but they can build structures just fine
- They do not contribute to gaining Loot, as they "keep booty for themselves"
- The rest of their stats are comparable to their citizen-soldier counterparts at the Advanced rank (some are comparable to Elite rank but cost more), and most of them do not promote to new ranks (though some do)
- Each mercenary soldier comes with 1-2 tech upgrades researchable at the merc camp when captured by the player. For instance, Balearic Slingers and Rhodian Slingers can have a "Lead Sling Bullets" technology at the Merc Camp, a tech not normally available to civs with those mercs (CANNOT IMPLEMENT YET)
- Task soldiers to capture the Mercenary Camp like they would capture an Civic Center or Temple or House

So, for example: 

An "Egyptian Biome" map like Nile River
- 4 Players
- 4 Mercenary Camps on the map, capturable by any player
- 2 "Egyptian Biome" Mercs available at the Camps: Libyan Skirmisher, Garamantine Camel Raider (not implemented)
- Up to 4 Mercs available, based on the capturing player's civilization: Ptolemies (Mercenary Thureophoros, Nubian Archer, Galatian Swordsman); Seleucids (Mercenary Thureophoros, Thracian Swordsman, Tarantine Cavalry); Spartans (Cretan Mercenary Archer, Rhodian Slinger, Peloponnesian Hoplite); Iberians (Balearic Slinger, Greek Settler Hoplite, Gaesatae) (mostly implemented!)
- None of the mercs cost population room, but all cost an amount of metal, and they are limited to 30 total alive at a time.

CIVILIZATION BONUSES AND CHANGES
=========================
The specific bonuses and changes for each civ. There are many many new changes and additions for every civ in this mod.

Athenians
=======================
Team Bonuses: 
- "Delian League": Reduces Build Time for allied Warships by -20%.* THIS IS BUGGED FOR AN UNKNOWN REASON.

Civ Bonuses: 
- "Silver Mines of Laureion": +10% Metal gathering for each passing phase.
- "Hellenization": Building a Theatron special building increases territory effect for all buildings +20%.

Special Buildings:
- Gymnaseion: Train Epilektoi champion infantry. Research extra City Phase military upgrades.
- Prytaneion: Train Heroes. Research Iphicratean Reforms, Periclean Strategem, and Athenian Long Walls.
- Theatron: Build one to unleash the "Hellenization" bonus.

Notable Technologies:
- "Iphicratean Reform": Unlocks training Athenian Marines and Cretan Archers from the Trireme.
- "Periclean Strategem": Walls and Warships +10% Health, Soldiers -5% Health.
- "Athenian Long Walls": Build Stone Walls in neutral territory.
- "Phidean Workshop": Temples and Wonder -25% Build Time, but +10% Stone Cost.
- "Zea Ship Sheds": Warships build +25% faster.
- "Arsenal of Philon": Warships regenerate Health.
- "Othismos": Unlock the Locked Shields formation modifier.

Heroes and Champions:
- Pericles
- Themistocles
- Iphicrates
- Epilektos (Champion Spear Infantry)
- Scythian Archer (Champion Archer Infantry)

Mercenaries:
- Mercenary Hoplite (Spear Infantry)
- Cretan Archer (Archer Infantry)
- Thracian Peltast (Javelin Infantry)
- Allied Greek Cavalry (Spear Cavalry)

Britons
=============

Carthaginians
=============

Egyptians (Ptolemies)
=============

Epirotes - NEW CIV!
=============

Gauls
=============

Iberians
=============

Indians (Mauryans)
=============

Macedonians
=============

Persians (Achaemenids)
=============

Romans (Principates) - NEW CIV!
=============

Romans (Republicans)
=============

Seleucids
=============

Spartans
=============
Team Bonuses: 
- "Peloponnesian League": Allies can train Spartiate champion infantry. NOT IMPLEMENTED.

Civ Bonuses: 
- "Othismos": Spartans can make use of the Locked Shields formation modifier without researching a technology. NOT IMPLEMENTED: TECHS UNLOCKING FORMATIONS.
- "Laws of Lycurgus": Hoplite rank promotion upgrades cost no resources, except time.
- "Spartan Womanhood": Spartan women cannot be captured (UNIT CONVERSION NOT IMPLEMENTED) and they can build Defense Towers and Palisades (these are implemented).
- "Hellenization": Building a Theatron special building increases territory effect for all buildings +20%.

Civ Penalties:
- "A Wall of Men": Spartans cannot build Stone Walls for defense.
- "Underdogs": The maximum population cap is reduced -10% for Sparta. 

Special Buildings:
- Syssition: Train Spartan heroes, Spartiate champion infantry, and Peroikoi Hoplites. Research additional military technologies. Available in Phase I.
- Theatron: Build one to unleash the "Hellenization" bonus.

Notable Technologies:
- "Tyrtean Paeans": All units +10% walk speed.
- "The Agoge": Spartiates -1 pop cost, +10% attack.
- "Feminine Mystique": Female Citizens +50% Health, +2 Attack.

Heroes and Champions:
- Leonidas
- Agis
- Brasidas
- Spartiate (Champion Spear Infantry)
- Skiritai Commando (Champion Sword Infantry)

Mercenaries:
- Peloponnesian Hoplite (Spear Infantry)
- Cretan Archer (Archer Infantry)
- Rhodian Slinger (Slinger Infantry)
- Allied Greek Cavalry (Spear Cavalry)

Thebans - NEW CIV!
=============

MISCELLANEOUS ADD-ONS
=================================================
- Groves are a new type of tree resource I wish to replace most trees with. They give 5000 wood, like how Metal Mines give 5000 Metal. Eventually I would like to make small, medium, and large groves for all biomes and tree-types. The currently implemented groves are the small (5000 wood) type. The large groves would be large forests, with infinite wood. 
- I am experimenting trying to help pathfinding performance by allowing units to walk through trees. For the most part this looks okay and doesn't look bad. There are a few ways to make this better though, which can be discussed: Walls and buildings should be placeable over individual trees, removing the trees in the process; Groves could allow for ambush tactics by barbarian civs (somewhat implemented!); Siege weapons should still path around groves at least, or move extra slow through groves (can be implemented).
- Updated Neareastern Badlands (2) to be smaller. The original was too big for 2 players.
- Updated a lot of the Sandbox demo maps for each civ.
- Experimented with some of Enrique's new unit meshes. Use keyword "test" in Atlas to find those entities.
