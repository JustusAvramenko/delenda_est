Formation.prototype.OnGlobalOwnershipChanged = function(msg)
{
	// When an entity is captured or destroyed, it should no longer be
	// controlled by this formation.
	if (this.members.indexOf(msg.entity) != -1)
		this.RemoveMembers([msg.entity]);
	if (msg.entity === this.entity && msg.to > -1)
		Engine.QueryInterface(this.entity, IID_Visual)?.SetVariant("animationVariant", QueryPlayerIDInterface(msg.to, IID_Identity).GetCiv());
};
