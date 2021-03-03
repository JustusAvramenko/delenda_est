UnitAI.prototype.GetQueryRange = function(iid)
{
	let ret = { "min": 0, "max": 0 };

	let cmpVision = Engine.QueryInterface(this.entity, IID_Vision);
	if (!cmpVision)
		return ret;
	let visionRange = cmpVision.GetRange();

	if (iid === IID_Vision)
	{
		ret.max = visionRange;
		return ret;
	}

	if (this.GetStance().respondStandGround)
	{
		let range = this.GetRange(iid);
		if (!range)
			return ret;
		ret.min = range.min;
		ret.max = Math.min(range.max, visionRange);
	}
	else if (this.GetStance().respondChase)
		ret.max = visionRange * 0.9; // << This has changed.
	else if (this.GetStance().respondHoldGround)
	{
		let range = this.GetRange(iid);
		if (!range)
			return ret;
		ret.max = Math.min(range.max + visionRange / 2, visionRange);
	}
	// We probably have stance 'passive' and we wouldn't have a range,
	// but as it is the default for healers we need to set it to something sane.
	else if (iid === IID_Heal)
		ret.max = visionRange;

	return ret;
};
