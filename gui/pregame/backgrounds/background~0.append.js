for (const key in backgrounds) {
	if (Object.hasOwn(backgrounds, key)) {
		delete backgrounds[key];
	}
}