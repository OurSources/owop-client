const fs = require('fs-extra');
const webpack = require('webpack');
const rimraf = require('rimraf');

const config = {
	entry: {
		app: "./src/js/main.js",
	},
	output: {
		filename: "[name].js",
		path: __dirname + "/dist"
	},
	module: {
		loaders: [{
			loader: 'babel-loader',
			exclude: /node_modules/,
			query: {
				presets: ['env']
			}
		}]
	},
	plugins: [
		new webpack.optimize.CommonsChunkPlugin({
			name: 'libs',
			filename: 'libs.js',
			minChunks: module => module.context && module.context.indexOf('node_modules') !== -1
		})
	]
};

module.exports = async env => {
	env = env || {};
	if (!env.release) {
		config.devtool = "source-map";
	} else {
		await new Promise(resolve => rimraf(config.output.path, resolve));
	}

	/* Copy the following files/directories from the src folder to the dist folder */
	await Promise.all(['favicon.ico', 'index.html', 'css', 'img']
		.map(file => fs.copy(...(['src', 'dist'].map(dir => `${__dirname}/${dir}/${file}`)))));

	return config;
};
