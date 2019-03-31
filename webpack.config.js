const fs = require('fs-extra');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin =  require('html-webpack-plugin');
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

/*const ExtractTextPlugin = require('extract-text-webpack-plugin');*/

const srcDir = path.resolve(__dirname, 'src');

const config = {
	entry: {
		app: path.resolve(srcDir, 'js', 'main.js')
	},
	output: {
		filename: '[name].js',
		path: path.resolve(__dirname, 'dist'),
		publicPath: '/'
	},
	devServer: {
		contentBase: false,
		compress: true,
		historyApiFallback: true,
		open: false
	},
	module: {
		rules: [{
			include: path.resolve(srcDir, 'js'),
			use: [{
				loader: 'babel-loader',
				query: {
					presets: ['env']
				}
			}]
		},{
			/* Polyfills shouldn't be merged with app.js, resolve them with an url */
			include: path.resolve(srcDir, 'js', 'polyfill'),
			use: [{
				loader: 'file-loader',
				options: {
					outputPath: 'polyfill/',
					name: '[name].[ext]'
				}
			}]
		},{
			include: path.resolve(srcDir, 'img'),
			use: [{
				loader: 'file-loader',
				options: {
					outputPath: 'img/',
					name: '[name].[ext]'
				}
			}]
		},{
			include: path.resolve(srcDir, 'audio'),
			use: [{
				loader: 'file-loader',
				options: {
					outputPath: 'audio/',
					name: '[name].[ext]'
				}
			}]
		},{
			include: path.resolve(srcDir, 'font'),
			use: [{
				loader: 'file-loader',
				options: {
					outputPath: 'font/',
					name: '[name].[ext]'
				}
			}]
		},{
			include: path.resolve(srcDir, 'css'),
			use: [{
				loader: 'css-loader',
				options: {
					/*root: '..',*/
					importLoaders: 1
				}
			},{
				loader: 'postcss-loader'
			}]/*ExtractTextPlugin.extract({
				fallback: 'style-loader',
				use: ['css-loader']
			})*/
		}]
	},
	plugins: [
		new CopyWebpackPlugin([{from: 'static'}]),
		/*new webpack.optimize.CommonsChunkPlugin({
			name: 'libs',
			filename: 'libs.js',
			minChunks: module => module.context && module.context.indexOf('node_modules') !== -1
		}),*/
		new HtmlWebpackPlugin({
			title: 'World of Pixels',
			inject: 'head',
			template: path.resolve(srcDir, 'index.ejs'),
			favicon: path.resolve(srcDir, 'favicon.ico')
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
		config.mode = "development";
		config.devtool = "source-map";
		config.output.publicPath = '/';
	} else {
		config.mode = "production";
		config.output.filename = '[name].[hash].js';
		console.log(`Cleaning build dir: '${config.output.path}'`);
		await fs.remove(config.output.path);
	}

	config.plugins.push(new webpack.DefinePlugin({
		'PRODUCTION_BUILD': JSON.stringify(!!env.release)
	}));

	return config;
};
