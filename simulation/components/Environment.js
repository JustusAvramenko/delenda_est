function Environment() {}

Environment.prototype.Spawn = function(templateName)
{
	const ent = Engine.AddEntity(templateName);
	const cmpPosition = Engine.QueryInterface(ent, IID_Position);
	if (!cmpPosition)
	{
		Engine.DestroyEntity(ent);
		return false;
	}

	const cmpEntOwnership = Engine.QueryInterface(ent, IID_Ownership);
	if (cmpEntOwnership)
		cmpEntOwnership.SetOwner(0);

	const terrain = TriggerHelper.GetMapSizeTerrain();
	const x = Helpers.getRandomInt(0, terrain);
	const z = Helpers.getRandomInt(0, terrain);
	const destroyTime = Helpers.getRandomInt(80, 300)*1000;
	//warn(uneval(`ent: ${ent} | templatename: ${templateName} | terrainsize: ${terrain} |  SpawnPoint x: ${x} | SpawnPoint z: ${z} | LifeTime: ${destroyTime/1000}s`))

	cmpPosition.JumpTo(x, z);
	this.Move(ent);

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
    cmpTimer.SetTimeout(SYSTEM_ENTITY, IID_Environment, "DestroyAndQueueNext", destroyTime, {"ent": ent, "template": templateName});

	return ent;
};

Environment.prototype.DestroyAndQueueNext = function(data)
{
	Engine.DestroyEntity(data.ent);
	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
	const spawnTime = Helpers.getRandomInt(300, 900)*1000;
	//warn("spawnTime: "+spawnTime/1000+"s");
	cmpTimer.SetTimeout(SYSTEM_ENTITY, IID_Environment, "Spawn", spawnTime, data.template);
};

Environment.prototype.Move = function(ent)
{
	const terrain = TriggerHelper.GetMapSizeTerrain();

	const cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
	if (!cmpUnitAI)
		return false

	const x = Helpers.getRandomInt(0, terrain);
	const z = Helpers.getRandomInt(0, terrain);
	const orderDelay = Helpers.getRandomInt(20, 60)*1000;
	//warn(uneval(`MoveTo x: ${x} | MoveTo z: ${z} | OrderDelay: ${orderDelay/1000}s`))

	cmpUnitAI.MoveToPoint(x, z)

	const cmpTimer = Engine.QueryInterface(SYSTEM_ENTITY, IID_Timer);
    cmpTimer.SetTimeout(SYSTEM_ENTITY, IID_Environment, "Move", orderDelay, ent);
};


Engine.RegisterSystemComponentType(IID_Environment, "Environment", Environment);
