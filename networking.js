WorldOfPixels.net = {};

WorldOfPixels.net.stoi = function(string, max) {
  var ints = [];
  string = string.toLowerCase();
  for (var i=0; i<string.length && i<max; i++) {
    var charCode = string.charCodeAt(i);
    if((charCode < 123 && charCode > 96) || (charCode < 58 && charCode > 47) || charCode == 95 || charCode == 46){
			ints.push(charCode);
		}
  }
  return [ints, string];
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
  
};

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
  		return;
  	}
  	var dv = new DataView(message);
    switch(dv.getUint8(0)) {
      case 0: // Get id
        this.net.id = dv.getUint32(1, true);
        this.net.players = {};
        console.log("Id:", this.net.id);
        break;
      case 1:
        
        break;
      case 2: // Get chunk
        var chunkX = dv.getInt32(1, true);
        var chunkY = dv.getInt32(5, true);
        var data = new Uint8Array(message);
        var ndata = new Uint8Array(16 * 16 * 3);
        for (var i=9; i<777; i++) {
          ndata[i - 9] = data[i];
        }
        this.chunks[[chunkX, chunkY]] = new Chunk(chunkX, chunkY, ndata);
        break;
    }
  }.bind(this);
  
  this.net.connection.onclose = function() {
    clearInterval(this.net.updateInterval);
    console.log("Closed");
  }.bind(this);
}.bind(WorldOfPixels);