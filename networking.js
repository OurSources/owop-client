var WorldOfPixels = WorldOfPixels || {};
WorldOfPixels.net = {};

WorldOfPixels.net.stoi = function(string, max) {
  var ints = [];
  var fstring = "";
  string = string.toLowerCase();
  for (var i=0; i<string.length && i<max; i++) {
    var charCode = string.charCodeAt(i);
    if((charCode < 123 && charCode > 96) || (charCode < 58 && charCode > 47) || charCode == 95 || charCode == 46){
      fstring += String.fromCharCode(charCode);
			ints.push(charCode);
		}
  }
  return [ints, fstring];
};

WorldOfPixels.net.joinWorld = function(worldName) {
  var nstr = this.net.stoi(worldName, 24);
	var array = new ArrayBuffer(nstr[0].length + 2);
	var dv = new DataView(array);
	for(var i = nstr[0].length; i--;){
		dv.setUint8(i, nstr[0][i]);
	}
	dv.setUint16(nstr[0].length, 1337, true);
  this.net.connection.send(array);
  return nstr[1];
}.bind(WorldOfPixels);

WorldOfPixels.net.requestChunk = function(x, y) {
  if (x > 0xFFFFF || y > 0xFFFFF || x < ~0xFFFFF || y < ~0xFFFFF) {
    return;
  }
  var array = new ArrayBuffer(8);
  var dv = new DataView(array);
  dv.setInt32(0, x, true);
  dv.setInt32(4, y, true);
  this.net.connection.send(array);
}.bind(WorldOfPixels);

WorldOfPixels.net.sendUpdates = function() {
  if (this.mouse.lastX != this.camera.x * 16 + this.mouse.x || this.mouse.lastY != this.camera.y * 16 + this.mouse.y) {
    // Send mouse position
    var array = new ArrayBuffer(12);
    var dv = new DataView(array);
    dv.setInt32(0, this.camera.x * 16 + this.mouse.x, true);
    dv.setInt32(4, this.camera.y * 16 + this.mouse.y, true);
		dv.setUint8(8, 0);
		dv.setUint8(9, 0);
		dv.setUint8(10, 0);
		dv.setUint8(11, 0);
    this.net.connection.send(array);
  }
}.bind(WorldOfPixels);

WorldOfPixels.net.sendMessage = function(message) {
  this.net.connection.send(message + String.fromCharCode(10));
}.bind(WorldOfPixels);

WorldOfPixels.net.connect = function() {
  this.net.connection = new WebSocket(this.options.serverAddress);
  this.net.connection.binaryType = "arraybuffer";
  
  this.net.connection.onopen = function() {
    this.net.worldName = decodeURIComponent(window.location.pathname);
    if (this.net.worldName.charAt(0) == "/") {
      this.net.worldName = this.net.worldName.substr(1);
    }
    if (this.net.worldName === "") {
      this.net.worldName = "main";
    }
    
    var worldName = this.net.joinWorld(/*this.net.worldName*/"main");
    console.log("Connected! Joining world: " + worldName);
    
    this.updateCamera();
    
    this.net.updateInterval = setInterval(this.net.sendUpdates, 1000 / this.options.netUpdateSpeed);
  }.bind(this);
  
  this.net.connection.onmessage = function(message) {
    message = message.data;
    if(typeof message === "string"){
  		console.log(message);
  		this.chatMessage(message);
  		return;
  	}
  	var dv = new DataView(message);
    switch(dv.getUint8(0)) {
      case 0: // Get id
        this.net.id = dv.getUint32(1, true);
        this.net.players = {};
        console.log("Id:", this.net.id);
        break;
      case 1: // Get all cursors, tile updates, disconnects
        // Cursors
        for(var i = dv.getUint8(1); i--;){
  				var pid = dv.getUint32(2 + i * 16, true);
  				var pmx = dv.getInt32(2 + i * 16 + 4, true);
  				var pmy = dv.getInt32(2 + i * 16 + 8, true);
  				var pr = dv.getUint8(2 + i * 16 + 12);
  				var pg = dv.getUint8(2 + i * 16 + 13);
  				var pb = dv.getUint8(2 + i * 16 + 14);
  				var ptool = dv.getUint8(2 + i * 16 + 15);
  				if(pid in this.net.players){
  					this.net.players[pid].update(pmx, pmy, pr, pg, pb, ptool);
  				} else {
  					this.net.players[pid] = new Player(pmx, pmy, pr, pg, pb, ptool, pid);
  				}
  			}
  			var off = 2 + dv.getUint8(1) * 16;
  			// Tile updates
  			for(var j = dv.getUint16(off, true); j--;){
  				var bpx = dv.getInt32(2 + off + j * 11, true);
  				var bpy = dv.getInt32(2 + off + j * 11 + 4, true);
  				var br = dv.getUint8(2 + off + j * 11 + 8);
  				var bg = dv.getUint8(2 + off + j * 11 + 9);
  				var bb = dv.getUint8(2 + off + j * 11 + 10);
  				/*if(isvisible(bpx << 4, bpy << 4, 16, 16)){
  					fx.push([bpx, bpy, nt, 0xFFFFFF - ((br << 16) + (bg << 8) + bb)]);
  				}*/
  				if ([bpx >> 4, bpy >> 4] in this.chunks) {
  					this.chunks[[bpx >> 4, bpy >> 4]].update(bpx & 0xF, bpy & 0xF, [br, bg, bb]);
  				}
  			}
  			off += dv.getUint16(off, true) * 11 + 2;
  			// Disconnects
  			for(var k = dv.getUint8(off); k--;){
  				var dpid = dv.getUint32(1 + off + k * 4, true);
  				if(dpid in this.net.players){
  				  this.net.players[dpid].disconnect();
  				}
  			}
        break;
      case 2: // Get chunk
        var chunkX = dv.getInt32(1, true);
        var chunkY = dv.getInt32(5, true);
        var data = new Uint8Array(message);
        var ndata = new Uint8Array(16 * 16 * 3);
        for (var l=9; l<777; l++) {
          ndata[l - 9] = data[l];
        }
        this.chunks[[chunkX, chunkY]].load(ndata);
        break;
    }
  }.bind(this);
  
  this.net.connection.onclose = function() {
    clearInterval(this.net.updateInterval);
    console.log("Closed");
  }.bind(this);
}.bind(WorldOfPixels);
