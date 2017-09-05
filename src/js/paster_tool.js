WorldOfPixels.tools.push(
	new Tool(WorldOfPixels.cursors.paste, -1, true,
		function(x, y, buttons, isDrag, touches) {
			var tileX = Math.floor(this.camera.x + (x / this.camera.zoom));
			var tileY = Math.floor(this.camera.y + (y / this.camera.zoom));
			var delay = 0;
			
			var paint = function() {
				var ctx = this.canvas.getContext("2d");
				var dat = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
				var u32dat = new Uint32Array(dat.data.buffer);
				for (var y = 0; y < dat.height; y++) {
					for (var x = 0; x < dat.width; x++) {
						var oldPixel = this.getPixel(tileX + x, tileY + y);
						if(oldPixel === null) {
							continue;
						}
						oldPixel = to888(oldPixel[2], oldPixel[1], oldPixel[0]);
						var pixel = u32dat[y * dat.width + x];
						var alpha = (pixel >> 24 & 0xFF);
						var newPixel = [
							(1 - alpha / 255) * oldPixel[0] + (alpha / 255) * (pixel >> 16 & 0xFF),
							(1 - alpha / 255) * oldPixel[1] + (alpha / 255) * (pixel >> 8  & 0xFF),
							(1 - alpha / 255) * oldPixel[2] + (alpha / 255) * (pixel       & 0xFF)
						];
						if(oldPixel[2] !== newPixel[0]
						|| oldPixel[1] !== newPixel[1]
						|| oldPixel[0] !== newPixel[2]) {
							this.undoHistory.push([tileX + x, tileY + y, oldPixel]);
							var conn = this.net.connection;
							var updPx = this.net.updatePixel;
							setTimeout(function(x, y, newPixel) {
								var array = new ArrayBuffer(12);
								var dv = new DataView(array);
								dv.setInt32(0, x * 16, true);
								dv.setInt32(4, y * 16, true);
								/*dv.setUint8(8, 0);
								dv.setUint8(9, 0); // bytes are initialized to 0 anyways
								dv.setUint8(10, 0);
								dv.setUint8(11, this.toolSelected % 4);*/
								conn.send(array);
								updPx(x, y, newPixel);
							}, delay++, tileX + x, tileY + y, to565(newPixel[2], newPixel[1], newPixel[0]));
						}
					}
				}
			}.bind(this);
			
			if (!isDrag) {
				paint();
			}
		}.bind(WorldOfPixels),
		function(touches, type) {},
		function() {
			var input = document.createElement("input");
			input.type = "file";
			input.accept = "image/*";
			input.onchange = function(event) {
				if (input.files && input.files[0]) {
					var reader = new FileReader();
					reader.onload = function(e) {
						var image = new Image();
						image.onload = function() {
							this.canvas = document.createElement("canvas");
							this.canvas.width = image.width;
							this.canvas.height = image.height;
							var ctx = this.canvas.getContext("2d");
							ctx.drawImage(image, 0, 0);
						}.bind(this);
						image.src = e.target.result;
					}.bind(this);
					reader.readAsDataURL(input.files[0]);
				}
			}.bind(this);
			input.click();
		}.bind(WorldOfPixels)
	)
);
WorldOfPixels.updateToolbar();