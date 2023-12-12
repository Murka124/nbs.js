const ByteBuffer = require("bytebuffer");
const fs = require("fs");

/**
* Tick is the offset of the note from the starting position.
* @typedef {tick}
* @type {number}
*/

class Song {
	/**
	* An NBS song.
	* @param {object} data
	* @param {string} data.title
	* @param {string} data.author
	* @param {string} data.description
	* @param {string} data.original_author
	* @param {string} data.imported_name
	* @param {number} data.tempo
	* @param {number} data.length
	* @param {number} data.songHeight
	* @param {{[key:string]:Layer}} data.layers
	* @param {[object]} data.custom_instruments
	*/
	constructor(data={}){
		this.title = data.title || ""
		this.author = data.author || "";
		this.description = data.description || "";
		this.original_author = data.original_author;
		this.imported_name = data.imported_name;
		this.tempo = data.tempo;
		this.length = data.length;
		this.songHeight = data.songHeight;
		this.layers = data.layers || {};
		this.custom_instruments = data.custom_instruments || []
	};
};

class Layer {
	/**
	* A layer that has notes.
	* @param {object} data
	* @param {number} [data.volume=100] - percentage
	* @param {string} [data.name]
	* @param {object.<tick, Note>}  data.notes
	*/
	constructor(){
		this.notes = {};
		this.volume = 100;
		this.name = "";
		this.panning = 100;
		this.locked = false
	};
	/**
	* Sets a note in the layer.
	* @param {tick|number} tick
	* @param {Note} note
	*/
	setNote(tick, note){
		this.notes[tick] = note;
	};
};

class Note {
	/**
	* Represents a note.
	* @param {string} instrument
	* @param {number} key
	* @property {number} pitch - used in the minecraft client. min 0 max 2
	*/
	constructor(instrument, key, velocity, panning, pitch){
		this.instrument = instrument;
        this.key = key;
		this.pitch_converted = keyToPitch[this.key-33] || 0;
		this.velocity = velocity
		this.panning = panning
		this.pitch = pitch
	};
	/**
	* Gives you a packet to use with minecraft-protocol.
	* The packets name is "sound_effect"
	* For it to properly work, set the `x`, `y` and `z` properties to the source coordinate multiplied by 8.
	* example, if the note must be played at coordinate 2,2,1 ; the xyz on the packet must be 16,16,8
	* @returns {object} packet
	* @example client.write("sound_effect", {
	* 	...note.packet,
	*	x: client.pos.x * 8,
	*	y: client.pos.y * 8,
	*	z: client.pos.z * 8,
	* });
	*/
	get packet(){
		// note: packet name is "" :3
		return {
			soundId: instrumentIds[this.instrument] || 76,
			soundCategory: 0,
			x: 0,
			y: 0,
			z: 0,
			volume: 1,
			pitch: this.pitch,
		};
	};
};


const keyToPitch = {
	0: 0.5,
    1: 0.529732,
    2: 0.561231,
    3: 0.594604,
    4: 0.629961,
    5: 0.667420,
    6: 0.707107,
    7: 0.749154,
    8: 0.793701,
    9: 0.840896,
    10: 0.890899,
    11: 0.943874,
    12: 1.0,
    13: 1.059463,
    14: 1.122462,
    15: 1.189207,
    16: 1.259921,
    17: 1.334840,
    18: 1.414214,
    19: 1.498307,
    20: 1.587401,
    21: 1.681793,
    22: 1.781797,
    23: 1.887749,
    24: 2.0,
	25: 2.059463,
	26: 2.122462,
	27: 2.189207,
	28: 2.259921,
	29: 2.334840,
	30: 2.414214,
	31: 2.498307,
	32: 2.587401,
	33: 2.681793,
	34: 2.781797,
	35: 2.887749,
	36: 3.0,
};

const instrumentIds = {
	0: 76, // harp
	1: 70, // wood
	2: 71, // stone
	3: 79, // snare/sand
	4: 78, // glass
	5: 75, // guitar/wool
	6: 74, // flute/clay
	7: 72, // bell/gold block
	8: 73, // chime/packed ice
	9: 80, // xylophone/bone block
	10: 80, // xylo, but iron? TODO: fix these
	11: null,
	12: null,
	13: null,
	14: null,
	15: null,
};



function parse(data){
	let bb = ByteBuffer.fromHex(data.toString("hex"), true);
	bb.offset = 0;
	
	bb.readShort();
	let version = bb.readByte();
	let vanillaInstruments = bb.readByte();
	let length = bb.readShort();
	let songHeight = bb.readShort();
	
	let title = bb.readIString();
	let author = bb.readIString();
	let original_author = bb.readIString();
	let description = bb.readIString();
	
	let tempo = bb.readShort()/100;
	bb.readByte(); // auto save
	bb.readByte(); // auto save dur.
	bb.readByte(); // time sig.
	
	// stats (used in editor)
	bb.readInt();
	bb.readInt();
	bb.readInt();
	bb.readInt();
	bb.readInt();
	
	let imported_name = bb.readIString();
	let loop = bb.readByte() == 1? true: false; // loop
	let loop_max_count = bb.readByte(); // max loop
	let loop_start = bb.readShort(); // loop start
	
	let layers = {};
	
	function setNote(layer, ticks, instrument, key, velocity, panning, pitch_nbs) {
        let l = layers[layer];
        if (!l) {
            l = new Layer();
            layers[layer] = l;
        }
        l.setNote(ticks, new Note(instrument, key, velocity, panning, pitch_nbs));
    }
	
	let tick = -1;
	while (true) {
		jumpTicks = bb.readShort(); // jumps till next tick
		if (jumpTicks == 0) {
			break;
		}
		tick += jumpTicks;
		let layer = -1;
		while (true) {
			let jumpLayers = bb.readShort(); // jumps till next layer
			if (jumpLayers == 0) {
				break;
			};
			layer += jumpLayers;
			let instrument = bb.readByte();
			let key = bb.readByte();
			let velocity = bb.readByte();
			let panning = bb.readUint8();
			let pitch = bb.readShort();
			setNote(layer, tick, instrument, key, velocity, panning, pitch);
		};
	};
	for (let i = 0; i < songHeight; i++) {
		let l = layers[i];
		if (l) {
			l.name = bb.readIString();
			l.locked = bb.readByte();
			l.volume = bb.readByte();
			l.panning = bb.readUint8();
		} else {
			// Skip empty layer
			bb.readIString();
 			bb.readByte();
			bb.readByte();
			bb.readUint8();
		}
	};

	//Custom instruments
	let custom_instruments_count = bb.readUint8()
	let custom_instruments = []
	for (let i = 0; i < custom_instruments_count; i++) {
		custom_instruments.push({name: bb.readIString(), filename: bb.readIString(), key: bb.readByte()})
		bb.readByte() // utilize the "Press piano key", used only in editor
	}


	return new Song({
		title,
		author,
		description,
		original_author,
		imported_name,
		tempo,
		length,
		songHeight,
		layers,
		custom_instruments,
		loop,
		loop_max_count,
		loop_start
	});
};





function loadSong(filename){
	return parse(fs.readFileSync(filename));
};























module.exports = {
	loadSong,
	parse,
	Song,
	Layer,
	Note,
	keyToPitch,
	instrumentIds,
};
