const fs = require('fs-extra');
const webpack = require('webpack');
const HtmlWebpackPlugin =  require('html-webpack-plugin');
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin');
/*const ExtractTextPlugin = require('extract-text-webpack-plugin');*/

const srcDir = `${__dirname}/src`;

const config = {
	entry: {
		app: `${srcDir}/js/main.js`
	},
	output: {
		filename: '[name].js',
		path: `${__dirname}/dist`,
		publicPath: '/beta/'
	},
	devServer: {
		contentBase: `${__dirname}/dist`
	},
	module: {
		rules: [{
			include: `${srcDir}/js`,
			use: [{
				loader: 'babel-loader',
				query: {
					presets: ['env']
				}
			}]
		},{
			include: `${srcDir}/img`,
			use: [{
				loader: 'file-loader',
				options: {
					outputPath: 'img/',
					name: '[name].[ext]'
				}
			}]
		},{
			include: `${srcDir}/font`,
			use: [{
				loader: 'file-loader',
				options: {
					outputPath: 'font/',
					name: '[name].[ext]'
				}
			}]
		},{
			include: `${srcDir}/css`,
			use: [{
				loader: 'css-loader',
				options: {
					root: '..',
					minimize: true
				}
			}]/*ExtractTextPlugin.extract({
				fallback: 'style-loader',
				use: ['css-loader']
			})*/
		}]
	},
	plugins: [
		/*new webpack.optimize.CommonsChunkPlugin({
			name: 'libs',
			filename: 'libs.js',
			minChunks: module => module.context && module.context.indexOf('node_modules') !== -1
		}),*/
		new HtmlWebpackPlugin({
			title: 'World of Pixels',
			inject: 'head',
			template: `${srcDir}/index.ejs`,
			favicon: `${srcDir}/favicon.ico`
		}),
		new ScriptExtHtmlWebpackPlugin({
			defaultAttribute: 'async'
		})/*,
		new ExtractTextPlugin({
			filename: 'css/styles.css'
		})*/
	]
};

module.exports = async env => {
	env = env || {};
	if (!env.release) {
		config.devtool = "source-map";
		config.output.publicPath = '/';
	} else {
		config.output.filename = '[name].[hash].js';
		console.log(`Cleaning build dir: '${config.output.path}'`);
		await fs.remove(config.output.path);
	}

	/* Copy the following files/directories from the src folder to the dist folder */
	/*await Promise.all(['img', 'css', 'font']
		.map(file => fs.copy(`${srcDir}/${file}`, `${config.output.path}/${file}`)));*/

	return config;
};
