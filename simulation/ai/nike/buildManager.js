import * as filters from "simulation/ai/common-api/filters.js";
import { aiWarn } from "simulation/ai/common-api/utils.js";

function addBuilder(builders, civ, entity)
{
	for (const buildable of entity.buildableEntities(civ))
	{
		if (!builders.has(buildable))
			builders.set(buildable, []);
		builders.get(buildable).push(entity.id());
	}
}

function removeBuilder(builders, entityId)
{
	for (const entities of builders.values())
	{
		const entityIndex = entities.indexOf(entityId);
		if (entityIndex !== -1)
			entities.splice(entityIndex, 1);
	}
}

/**
 * One task of this manager is to cache the list of structures we have builders for,
 * to avoid having to loop on all entities each time.
 * It also takes care of the structures we can't currently build and should not try to build endlessly.
 */

export class BuildManager
{
	// List of buildings we have builders for, with number of possible builders.
	builders = new Map();
	// List of buildings we can't currently build (because no room, no builder or whatever),
	// with time we should wait before trying again to build it.
	unbuildables = new Map();

	/** Initialization at start of game */
	init(gameState)
	{
		const civ = gameState.getPlayerCiv();
		for (const ent of gameState.getOwnUnits().values())
			addBuilder(this.builders, civ, ent);
	}

	/** Update the builders counters */
	checkEvents(gameState, events)
	{
		this.elapsedTime = gameState.ai.elapsedTime;
		const civ = gameState.getPlayerCiv();

		for (const evt of events.Create)
		{
			if (events.Destroy.some(e => e.entity == evt.entity))
				continue;
			const ent = gameState.getEntityById(evt.entity);
			if (ent && ent.isOwn(PlayerID) && ent.hasClass("Unit"))
				addBuilder(this.builders, civ, ent);
		}

		for (const evt of events.Destroy)
			removeBuilder(this.builders, evt.entity);

		for (const evt of events.OwnershipChanged)   // capture events
		{
			if (evt.from == PlayerID)
			{
				removeBuilder(this.builders, evt.entity);
				continue;
			}
			else if (evt.to != PlayerID)
				continue;

			const ent = gameState.getEntityById(evt.entity);
			if (ent?.hasClass("Unit"))
				addBuilder(this.builders, civ, ent);
		}

		for (const evt of events.ValueModification)
		{
			if (evt.component != "Builder" ||
				  !evt.valueNames.some(val => val.startsWith("Builder/Entities/")))
				continue;

			// Unfortunately there really is not an easy way to determine the changes
			// at this stage, so we simply have to dump the cache.
			this.builders = new Map();

			for (const ent of gameState.getOwnUnits().values())
				addBuilder(this.builders, civ, ent);
		}
	}


	/**
	 * Get the buildable structures passing a filter.
	 */
	findStructuresByFilter(gameState, filter)
	{
		const result = [];
		for (const [templateName, entities] of this.builders)
		{
			if (!entities.length || gameState.isTemplateDisabled(templateName))
				continue;
			const template = gameState.getTemplate(templateName);
			if (!template || !template.available(gameState))
				continue;
			if (filter.func(template))
				result.push(templateName);
		}
		return result;
	}

	/**
	 * Get the first buildable structure with a given class
	 * TODO when several available, choose the best one
	 */
	findStructureWithClass(gameState, classes)
	{
		return this.findStructuresByFilter(gameState, filters.byClasses(classes))[0];
	}

	hasBuilder(template)
	{
		const numBuilders = this.builders.get(template);
		return numBuilders && numBuilders.length > 0;
	}

	isUnbuildable(gameState, template)
	{
		return this.unbuildables.has(template) &&
			this.unbuildables.get(template).time > gameState.ai.elapsedTime;
	}

	setBuildable(template)
	{
		if (this.unbuildables.has(template))
			this.unbuildables.delete(template);
	}

	/** Time is the duration in second that we will wait before checking again if it is buildable */
	setUnbuildable(gameState, template, time = 90, reason = "room")
	{
		if (!this.unbuildables.has(template))
		{
			this.unbuildables.set(template,
				{ "reason": reason, "time": gameState.ai.elapsedTime + time });
		}
		else
		{
			const unbuildable = this.unbuildables.get(template);
			if (unbuildable.time < gameState.ai.elapsedTime + time)
			{
				unbuildable.reason = reason;
				unbuildable.time = gameState.ai.elapsedTime + time;
			}
		}
	}

	/** Return the number of unbuildables due to missing room */
	numberMissingRoom(gameState)
	{
		let num = 0;
		for (const unbuildable of this.unbuildables.values())
			if (unbuildable.reason == "room" && unbuildable.time > gameState.ai.elapsedTime)
				++num;
		return num;
	}

	/** Reset the unbuildables due to missing room */
	resetMissingRoom(gameState)
	{
		for (const [key, unbuildable] of this.unbuildables)
			if (unbuildable.reason == "room")
				this.unbuildables.delete(key);
	}

	Serialize()
	{
		return {
			"builders": this.builders,
			"unbuildables": this.unbuildables
		};
	}

	Deserialize(data)
	{
		for (const key in data)
			this[key] = data[key];
	}
}
