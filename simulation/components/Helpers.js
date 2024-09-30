function Helpers() {}

Helpers.getRandomInt = function(min, max)
{
	const minCeiled = Math.ceil(min);
	const maxFloored = Math.floor(max);
	return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled);
}

Helpers.EntityMatchesClassList = function(entity, classes)
{
	let cmpIdentity = Engine.QueryInterface(entity, IID_Identity);
	return cmpIdentity && MatchesClassList(cmpIdentity.GetClassesList(), classes);
};

Helpers.MatchEntitiesByClass = function(entities, classes)
{
	return entities.filter(ent => Helpers.EntityMatchesClassList(ent, classes));
};

Helpers.GetPlayerEntitiesByClass = function(playerID, classes)
{
	return Helpers.MatchEntitiesByClass(Helpers.GetEntitiesByPlayer(playerID), classes);
};

Helpers.GetEntitiesByPlayer = function(playerID)
{
	return Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager).GetEntitiesByPlayer(playerID);
};

Helpers.GetEntityPosition2D = function(ent)
{
	let cmpPosition = Engine.QueryInterface(ent, IID_Position);

	if (!cmpPosition || !cmpPosition.IsInWorld())
		return undefined;

	return cmpPosition.GetPosition2D();
};

Helpers.GetAllPlayersEntities = function()
{
	return Engine.QueryInterface(SYSTEM_ENTITY, IID_RangeManager).GetNonGaiaEntities();
};

/**
 * Can be used to "force" a building/unit to spawn a group of entities.
 *
 * @param source Entity id of the point where they will be spawned from
 * @param template Name of the template
 * @param count Number of units to spawn
 * @param owner Player id of the owner of the new units. By default, the owner
 * of the source entity.
 */
Helpers.SpawnUnits = function(source, template, count, owner)
{
	let entities = [];
	let cmpFootprint = Engine.QueryInterface(source, IID_Footprint);
	let cmpPosition = Engine.QueryInterface(source, IID_Position);

	if (!cmpPosition || !cmpPosition.IsInWorld())
	{
		error("tried to create entity from a source without position");
		return entities;
	}

	if (owner == null)
		owner = Helpers.GetOwner(source);

	for (let i = 0; i < count; ++i)
	{
		let ent = Engine.AddEntity(template);
		let cmpEntPosition = Engine.QueryInterface(ent, IID_Position);
		if (!cmpEntPosition)
		{
			Engine.DestroyEntity(ent);
			error("tried to create entity without position");
			continue;
		}

		let cmpEntOwnership = Engine.QueryInterface(ent, IID_Ownership);
		if (cmpEntOwnership)
			cmpEntOwnership.SetOwner(owner);

		entities.push(ent);

		let pos;
		if (cmpFootprint)
			pos = cmpFootprint.PickSpawnPoint(ent);

		// TODO this can happen if the player build on the place
		// where our trigger point is
		// We should probably warn the trigger maker in some way,
		// but not interrupt the game for the player
		if (!pos || pos.y < 0)
			pos = cmpPosition.GetPosition();

		cmpEntPosition.JumpTo(pos.x, pos.z);
	}

	return entities;
};

Helpers.HasDealtWithTech = function(playerID, techName)
{
	let cmpPlayerManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_PlayerManager);
	let playerEnt = cmpPlayerManager.GetPlayerByID(playerID);
	let cmpTechnologyManager = Engine.QueryInterface(playerEnt, IID_TechnologyManager);
	return cmpTechnologyManager && (cmpTechnologyManager.IsTechnologyResearched(techName));
};

Helpers.GetOwner = function(ent)
{
	let cmpOwnership = Engine.QueryInterface(ent, IID_Ownership);
	if (cmpOwnership)
		return cmpOwnership.GetOwner();

	return -1;
};

Engine.RegisterComponentType(IID_Helpers, "Helpers", Helpers);
