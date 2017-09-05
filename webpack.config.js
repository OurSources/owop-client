const fs = require('fs-extra');
const webpack = require('webpack');
const HtmlWebpackPlugin =  require('html-webpack-plugin');
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin');

const srcDir = `${__dirname}/src`;

const config = {
	entry: {
		app: `${srcDir}/js/main.js`,
	},
	output: {
		filename: '[name].js',
		path: `${__dirname}/dist`
	},
	devServer: {
		contentBase: `${__dirname}/dist`
	},
	module: {
		loaders: [{
			loader: 'babel-loader',
			include: `${srcDir}/js`,
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
		}),
		new HtmlWebpackPlugin({
			title: 'World of Pixels',
			inject: 'head',
			template: `${srcDir}/index.ejs`
		}),
		new ScriptExtHtmlWebpackPlugin({
			defaultAttribute: 'defer'
		})
	]
};

module.exports = async env => {
	env = env || {};
	if (!env.release) {
		config.devtool = "source-map";
	} else {
		console.log(`Cleaning build dir: '${config.output.path}'`);
		await fs.remove(config.output.path);
	}

	/* Copy the following files/directories from the src folder to the dist folder */
	await Promise.all(['favicon.ico', 'css', 'img']
		.map(file => fs.copy(`${srcDir}/${file}`, `${config.output.path}/${file}`)));

	return config;
};
