const express = require('express');
const path = require('node:path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

app.post('/oauth', async (req, res)=>{
	const response = await fetch('http://localhost:13374/oauth', {
		method:'POST',
		headers:{
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(req.body)
	});
	console.log(response);
	res.send(await response.text());
});

app.get("/*splat", (req,res)=>{
	res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(8080, ()=>{console.info("listening...")});
