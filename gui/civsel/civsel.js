/**
 * Is this user in control of game settings (i.e. is a network server, or offline player).
 */
 
const g_IsController = !Engine.HasNetClient() || Engine.HasNetServer();

/**
 * Display selectable civs only.
 */
const g_CivData = loadCivData(true, false);

var g_PlayerSlot;

var g_Selected = {
	"code": "athen"
};
var g_margin = 8;
function init(settings)
{
	g_PlayerSlot = settings.playerSlot;
	if (settings.id != "random")
		g_Selected.code = settings.id;
	initDraw();
	selectCiv(g_Selected.code);
}
function gridArrayRepeatedObjects (basename, splitvar="n", vMargin=0, limit=[], vOffset=0, hOffset=0)
{
	basename = basename.split("["+splitvar+"]", 2);

	if (limit.length == 0)
	{
		limit = [0, 0, 1];
		while (Engine.GetGUIObjectByName(basename.join("["+ (limit[1]+1) +"]")))
		{
			++limit[1];
			++limit[2];
		}
	}
	else if (limit.length < 2)
	{
		error("Invalid limit arguments");
		return 0;
	}
	else
		limit[2] = limit[1] - limit[0] + 1;
	
	var firstObj = Engine.GetGUIObjectByName(basename.join("["+limit[0]+"]"));
	var child = firstObj.getComputedSize();
	child.width = child.right - child.left;
	child.height = child.bottom - child.top;
	
	var parent = firstObj.parent.getComputedSize();
	parent.width = parent.right - parent.left - hOffset;
	
	var rowLength = Math.floor(parent.width / child.width);
	
	var hMargin = parent.width - child.width * rowLength;
	hMargin = Math.round(hMargin / (rowLength + 1));
	
	child.width += hMargin;
	child.height += vMargin;
	
	var i = limit[0];
	for (let r = 0; r < Math.ceil(limit[2]/rowLength); ++r)
	{
		for (let c = 0; c < rowLength; ++c)
		{
			let newSize = new GUISize();
			newSize.left = c * child.width + hMargin + hOffset;
			newSize.right = (c+1) * child.width + hOffset;
			newSize.top = r * child.height + vMargin + vOffset;
			newSize.bottom = (r+1) * child.height + vOffset;
			Engine.GetGUIObjectByName(basename.join("["+ i++ +"]")).size = newSize;
			
			if (i > limit[1])
				break;
		}
	}
	
	var lastObj = Engine.GetGUIObjectByName(basename.join("["+(i-1)+"]"));
	return (lastObj.size.bottom - firstObj.size.top);
}
function setEmbSize (objectName, length=128)
{
	var objSize = Engine.GetGUIObjectByName(objectName).size;
	objSize.right = objSize.left + length;
	objSize.bottom = objSize.top + length;
	Engine.GetGUIObjectByName(objectName).size = objSize;
}

function setEmbPos (objectName, x=0, y=0)
{
	var objSize = Engine.GetGUIObjectByName(objectName).size;
	var wid = objSize.right - objSize.left;
	objSize.left = x;
	objSize.top = y;
	Engine.GetGUIObjectByName(objectName).size = objSize;
	setEmbSize(objectName, wid);
}
function initDraw()
{
	//	gridArrayRepeatedObjects("emblem[emb]", "emb", 8);
	let emb = 0;
	let vOffset = 0;
	let row = 6;
	let xStart = 58;
	let xSize = 80;
	let x = xStart;
	for (let civ in g_CivData)
	{	
//		g_CivData[civ].embs = [ emb ];
		let embImg = Engine.GetGUIObjectByName("emblem["+emb+"]_img");
		if (embImg === undefined)
		{
			error("There are not enough images in the current GUI layout to support that many civs");
			break;
		}

		embImg.sprite = "stretched:";
		if (civ !== g_Selected.code)
			embImg.sprite += "grayscale:";
		embImg.sprite += g_CivData[civ].Emblem;
		
		let embTxt = Engine.GetGUIObjectByName("emblem["+emb+"]_name");
		embTxt.caption = g_CivData[civ].Name;
		
		//setEmbSize("emblem["+emb+"]", xSize);
		setEmbPos("civ["+emb+"]", x, vOffset+g_margin);
		let embBtn = Engine.GetGUIObjectByName("emblem["+emb+"]_btn");
		setBtnFunc(embBtn, selectCiv, [ civ ]);
		Engine.GetGUIObjectByName("emblem["+emb+"]").hidden = false;
		Engine.GetGUIObjectByName("civ["+emb+"]").hidden = false;
		
		x += xSize;
		emb++;
		if (emb % row == 0) {
			let range = [ emb ];
			range[1] = emb+6;
		//	setEmbSize("emblem["+range[0]+"]", xSize);
			vOffset += g_margin * 2;
			vOffset += gridArrayRepeatedObjects("civ[emb]", "emb", 8, range, vOffset, g_margin);
			x = xStart;
		}
	}
	hideRemainingX("civ[", emb, "]");
}
function updateDraw()
{
	let emb = 0;
	for (let civ in g_CivData)
	{		
		let embImg = Engine.GetGUIObjectByName("emblem["+emb+"]_img");
		if (embImg === undefined)
		{
			error("There are not enough images in the current GUI layout to support that many civs");
			break;
		}
		let embTxt = Engine.GetGUIObjectByName("emblem["+emb+"]_name");
		embImg.sprite = "stretched:";
		embTxt.textcolor = "white";
		if (civ == g_Selected.code) {
			embTxt.textcolor = "green";
		}
		if (civ !== g_Selected.code) {
			embImg.sprite += "grayscale:";
		}
		embImg.sprite += g_CivData[civ].Emblem;
		++emb;
	}
}
function hideRemainingX(prefix, idx, suffix)
{
	let obj = Engine.GetGUIObjectByName(prefix+idx+suffix);
	while (obj)
	{
		obj.hidden = true;
		++idx;
		obj = Engine.GetGUIObjectByName(prefix+idx+suffix);
	}
}
function setBtnFunc (btn, func, vars = null)
{
	btn.onPress = function () { func.apply(null, vars); };
}

function selectCiv(code)
{
	g_Selected.code = code;
	let heading = Engine.GetGUIObjectByName("selected_heading");
	heading.caption = g_CivData[code].Name;
	let civList = Engine.GetGUIObjectByName("selected_civs");
	civList.hidden = false;
	let history = Engine.GetGUIObjectByName("selected_history");
	history.caption = g_CivData[code].History;
	let size = history.parent.size;
	size.top = 48;
	history.parent.size = size;
	updateDraw();
}

function returnCiv(choosed)
{
	Engine.PopGuiPageCB({
		"code": g_Selected.code,
		"playerSlot": g_PlayerSlot,
		"change": choosed
	});
}