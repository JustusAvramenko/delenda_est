ProductionQueue.prototype.ProgressTimeout = function(data, lateness)
{
	if (this.paused)
		return;

	// Allocate available time to as many queue items as it takes
	// until we've used up all the time (so that we work accurately
	// with items that take fractions of a second).
	let time = this.ProgressInterval + lateness;

	while (this.queue.length)
	{
		const item = this.queue[0];
		if (!item.IsStarted())
		{
			if (item.entity)
				this.SetAnimation("training");
			if (item.technology)
				this.SetAnimation("researching");

			item.Start();
		}
		time -= item.Progress(time);
		if (!item.IsFinished())
		{
			Engine.PostMessage(this.entity, MT_ProductionQueueChanged, null);
			return;
		}

		this.queue.shift();
		Engine.PostMessage(this.entity, MT_ProductionQueueChanged, null);

		// If autoqueuing, push a new unit on the queue immediately,
		// but don't start right away. This 'wastes' some time, making
		// autoqueue slightly worse than regular queuing, and also ensures
		// that autoqueue doesn't train more than one item per turn,
		// if the units would take fewer than ProgressInterval ms to train.
		if (this.autoqueuing)
		{
			const autoqueueData = item.OriginalItem();
			if (!autoqueueData)
				continue;

			if (!this.AddItem(autoqueueData.templateName, "unit", autoqueueData.count, autoqueueData.metadata))
			{
				// this.DisableAutoQueue(); <<<<<<<<<<<<<<<<< THIS IS COMMENTED OUT IN DE
				const cmpGUIInterface = Engine.QueryInterface(SYSTEM_ENTITY, IID_GuiInterface);
				cmpGUIInterface.PushNotification({
					"players": [QueryOwnerInterface(this.entity).GetPlayerID()],
					"message": markForTranslation("Could not auto-queue unit, skipping to next item."), //DE - Wording
					"translateMessage": true
				});
			}
			break;
		}
	}

	if (!this.queue.length)
		this.StopTimer();
};
