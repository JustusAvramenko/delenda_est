///////////////////////
// Trigger listeners //
///////////////////////

const g_CinemaStart = 5000;

Trigger.prototype.CounterMessage = function(data)
{
	let cmpGUIInterface = Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface);
	cmpGUIInterface.AddTimeNotification({
		"players": [1, 2], 
		"message": markForTranslation("Cutscene starts in %(time)s"),
		translateMessage: true
	}, g_CinemaStart);
	this.DoAfterDelay(g_CinemaStart, "StartCutscene", {});
	for (let tpCode of ["A", "B", "C", "D", "E", "F", "G"])
	{
		this.RegisterTrigger("OnRange", "PointTrigger" + tpCode, {
			"entities": this.GetTriggerPoints(tpCode),
			"players": [0,1],
			"minRange": 0,
			"maxRange": 20,
			"requiredComponent": IID_Identity,
			"enabled": true 
		});
	}
};

Trigger.prototype.StartCutscene = function(data)
{
	let cmpCinemaManager = Engine.QueryInterface(SYSTEM_ENTITY, IID_CinemaManager);
	if (!cmpCinemaManager)
		return;
	cmpCinemaManager.AddCinemaPathToQueue("test");
	cmpCinemaManager.Play();
};

Trigger.prototype.PointTriggerA = function(data)
{
	let gatherers = [];
	let field;
	for (let ent of data.currentCollection)
	{
		if (TriggerHelper.EntityHasClass(ent, "Field"))
			field = ent;
		else if (TriggerHelper.EntityHasClass(ent, "Female"))
			gatherers.push(ent);
	}
	if (field)
		this.ProcessPlayerCommand({
			"type": "gather",
			"entities": gatherers,
			"queued": true,
			"target": field,
		});
	this.DisableTrigger("OnRange", "PointTriggerA");
};

Trigger.prototype.PointTriggerB = function(data)
{
	let gatherers = [];
	let bush;
	for (let ent of data.currentCollection)
	{
		if (TriggerHelper.EntityHasClass(ent, "ForestPlant"))
			bush = ent;
		else if (TriggerHelper.EntityHasClass(ent, "Female"))
			gatherers.push(ent);
	}
	if (bush)
		this.ProcessPlayerCommand({
			"type": "gather",
			"entities": gatherers,
			"queued": true,
			"target": bush,
		});
	this.DisableTrigger("OnRange", "PointTriggerB");
};

Trigger.prototype.PointTriggerC = function(data)
{
	let gatherers = [];
	let mine;
	for (let ent of data.currentCollection)
	{
		if (TriggerHelper.GetOwner(ent) == 0)
			mine = ent;
		else if (TriggerHelper.EntityHasClass(ent, "CitizenSoldier"))
			gatherers.push(ent);
	}
	if (mine)
		this.ProcessPlayerCommand({
			"type": "gather",
			"entities": gatherers,
			"queued": true,
			"target": mine,
		});
	this.DisableTrigger("OnRange", "PointTriggerC");
};

Trigger.prototype.PointTriggerD = function(data)
{
	let cavalry = [];
	for (let ent of data.currentCollection)
	{
		if (TriggerHelper.EntityHasClass(ent, "Cavalry"))
			cavalry.push(ent);
	}
	let target = this.GetTriggerPoints("G")[0];
	let cmpTargetPosition = Engine.QueryInterface(target, IID_Position);
	if (!cmpTargetPosition || !cmpTargetPosition.IsInWorld())
		return;
	let pos = cmpTargetPosition.GetPosition2D();
	let cmd = {
		"x": pos.x,
		"z": pos.y,
		"type": "walk",
		"entities": cavalry,
		"queued": true,
	};
	this.DoAfterDelay(g_CinemaStart + 8000, "ProcessPlayerCommand", cmd);
	this.DisableTrigger("OnRange", "PointTriggerD");
};

Trigger.prototype.PointTriggerE = function(data)
{
	let archers = [];
	for (let ent of data.currentCollection)
	{
		if (TriggerHelper.EntityHasClass(ent, "Archer"))
			archers.push(ent);
	}
	let target = this.GetTriggerPoints("F")[0];
	let cmpTargetPosition = Engine.QueryInterface(target, IID_Position);
	if (!cmpTargetPosition || !cmpTargetPosition.IsInWorld())
		return;
	let pos = cmpTargetPosition.GetPosition2D();
	let cmd = {
		"x": pos.x,
		"z": pos.y,
		"type": "walk",
		"entities": archers,
		"queued": true,
	};
	this.DoAfterDelay(g_CinemaStart + 12000, "ProcessPlayerCommand", cmd);
	this.DisableTrigger("OnRange", "PointTriggerE");
};

Trigger.prototype.PointTriggerF = function(data)
{
	let cavalry = [];
	for (let ent of data.currentCollection)
	{
		if (TriggerHelper.EntityHasClass(ent, "Cavalry"))
			cavalry.push(ent);
	}
	let target = this.GetTriggerPoints("H")[0];
	let cmpTargetPosition = Engine.QueryInterface(target, IID_Position);
	if (!cmpTargetPosition || !cmpTargetPosition.IsInWorld())
		return;
	let pos = cmpTargetPosition.GetPosition2D();
	let cmd = {
		"x": pos.x,
		"z": pos.y,
		"type": "walk",
		"entities": cavalry,
		"queued": true,
	};
	this.DoAfterDelay(g_CinemaStart + 24000, "ProcessPlayerCommand", cmd);
	this.DisableTrigger("OnRange", "PointTriggerF");
};

Trigger.prototype.PointTriggerG = function(data)
{
	let cavalry = [];
	for (let ent of data.currentCollection)
	{
		if (TriggerHelper.EntityHasClass(ent, "Cavalry"))
			cavalry.push(ent);
	}
	let target = this.GetTriggerPoints("H")[0];
	let cmpTargetPosition = Engine.QueryInterface(target, IID_Position);
	if (!cmpTargetPosition || !cmpTargetPosition.IsInWorld())
		return;
	let pos = cmpTargetPosition.GetPosition2D();
	let cmd = {
		"x": pos.x,
		"z": pos.y,
		"type": "walk",
		"entities": cavalry,
		"queued": true,
	};
	this.DoAfterDelay(g_CinemaStart + 33000, "ProcessPlayerCommand", cmd);
	this.DisableTrigger("OnRange", "PointTriggerG");
};

Trigger.prototype.ProcessPlayerCommand = function(cmd)
{
	ProcessCommand(1, cmd);
};

let cmpTrigger = Engine.QueryInterface(SYSTEM_ENTITY, IID_Trigger);
cmpTrigger.DoAfterDelay(0, "CounterMessage", {});

