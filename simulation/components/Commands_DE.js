/**
 * Returns a list of UnitAI components, each belonging either to a
 * selected unit or to a formation entity for groups of the selected units.
 */
function GetFormationUnitAIs(ents, player, cmd, formationTemplate, forceTemplate)
{
	// If an individual was selected, remove it from any formation
	// and command it individually.
	if (ents.length == 1)
	{
		let cmpUnitAI = Engine.QueryInterface(ents[0], IID_UnitAI);
		if (!cmpUnitAI)
			return [];

		RemoveFromFormation(ents);

		return [ cmpUnitAI ];
	}

	let formationUnitAIs = [];
	// Find what formations the selected entities are currently in,
	// and default to that unless the formation is forced or it's the null formation
	// (we want that to reset whatever formations units are in).
	if (formationTemplate != NULL_FORMATION)
	{
		let formation = ExtractFormations(ents);
		let formationIds = Object.keys(formation.members);
		if (formationIds.length == 1)
		{
			// Selected units either belong to this formation or have no formation.
			let fid = formationIds[0];
			let cmpFormation = Engine.QueryInterface(+fid, IID_Formation);
			if (cmpFormation && cmpFormation.GetMemberCount() == formation.members[fid].length &&
			    cmpFormation.GetMemberCount() == formation.entities.length)
			{
				cmpFormation.DeleteTwinFormations();

				// The whole formation was selected, so reuse its controller for this command.
				if (!forceTemplate || formationTemplate == formation.templates[fid])
				{
					formationTemplate = formation.templates[fid];
					formationUnitAIs = [Engine.QueryInterface(+fid, IID_UnitAI)];
				}
				else if (formationTemplate && CanMoveEntsIntoFormation(formation.entities, formationTemplate))
					formationUnitAIs = [cmpFormation.LoadFormation(formationTemplate)];
			}
			else if (cmpFormation && !forceTemplate)
			{
				// Just reuse the template.
				formationTemplate = formation.templates[fid];
			}
		}
		else if (formationIds.length)
		{
			// Check if all entities share a common formation, if so reuse this template.
			let template = formation.templates[formationIds[0]];
			for (let i = 1; i < formationIds.length; ++i)
				if (formation.templates[formationIds[i]] != template)
				{
					template = null;
					break;
				}
			if (template && !forceTemplate)
				formationTemplate = template;
		}
	}

	// Separate out the units that don't support the chosen formation.
	let formedUnits = [];
	let nonformedUnitAIs = [];
	for (let ent of ents)
	{
		let cmpUnitAI = Engine.QueryInterface(ent, IID_UnitAI);
		let cmpPosition = Engine.QueryInterface(ent, IID_Position);
		if (!cmpUnitAI || !cmpPosition || !cmpPosition.IsInWorld())
			continue;

		let cmpIdentity = Engine.QueryInterface(ent, IID_Identity);
		// TODO: We only check if the formation is usable by some units
		// if we move them to it. We should check if we can use formations
		// for the other cases.
		let nullFormation = (formationTemplate || cmpUnitAI.GetFormationTemplate()) == NULL_FORMATION;
		if (nullFormation || !cmpIdentity || !cmpIdentity.CanUseFormation(formationTemplate || NULL_FORMATION))
		{
			if (nullFormation && cmpUnitAI.GetFormationController())
				cmpUnitAI.LeaveFormation(cmd.queued || false);
			nonformedUnitAIs.push(cmpUnitAI);
		}
		else
			formedUnits.push(ent);
	}
	if (nonformedUnitAIs.length == ents.length)
	{
		// No units support the formation.
		return nonformedUnitAIs;
	}

	if (!formationUnitAIs.length)
	{
		// We need to give the selected units a new formation controller.

		// TODO replace the fixed 60 with something sensible, based on vision range f.e.
		let formationSeparation = 60;
		let clusters = ClusterEntities(formedUnits, formationSeparation);
		let formationEnts = [];
		for (let cluster of clusters)
		{
			RemoveFromFormation(cluster);

			if (!formationTemplate || !CanMoveEntsIntoFormation(cluster, formationTemplate))
			{
				for (let ent of cluster)
					nonformedUnitAIs.push(Engine.QueryInterface(ent, IID_UnitAI));

				continue;
			}

			// Create the new controller.
			let formationEnt = Engine.AddEntity(formationTemplate);
			let cmpFormation = Engine.QueryInterface(formationEnt, IID_Formation);
			formationUnitAIs.push(Engine.QueryInterface(formationEnt, IID_UnitAI));
			cmpFormation.SetFormationSeparation(formationSeparation);
			cmpFormation.SetMembers(cluster);

			for (let ent of formationEnts)
				cmpFormation.RegisterTwinFormation(ent);

			formationEnts.push(formationEnt);
			let cmpOwnership = Engine.QueryInterface(formationEnt, IID_Ownership);
			cmpOwnership.SetOwner(player);

			const cmpVisual = Engine.QueryInterface(formationEnt, IID_Visual);
			if (cmpVisual) {
				const civ = QueryPlayerIDInterface(player).GetCiv();
				cmpVisual.SetVariant("animationVariant", civ);
			}
		}
	}

	return nonformedUnitAIs.concat(formationUnitAIs);
}
