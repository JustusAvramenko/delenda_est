/* eslint-disable prefer-const -- Mods should be able to change them */
export let outside = 1;
export let border = 2;
export let fullBorder = outside | border;
export let narrowFrontier = 4;
export let largeFrontier = 8;
export let fullFrontier = narrowFrontier | largeFrontier;
/* eslint-enable prefer-const */
