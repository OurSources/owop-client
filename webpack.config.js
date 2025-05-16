const fs = require('fs-extra');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

/*const ExtractTextPlugin = require('extract-text-webpack-plugin');*/

const srcDir = path.resolve(__dirname, 'src');

function genConfig(env) {
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
			static: false,
			compress: true,
			historyApiFallback: true,
			open: false,
			hot: true
		},
		optimization: {
			// keep module & chunk names human-readable
			moduleIds: 'named',
			chunkIds: 'named',

			// still minify, but override how Terser mangles names
			minimize: true,
			minimizer: [
				new TerserPlugin({
					terserOptions: {
						mangle: false, // don’t shorten variable/function names
						keep_classnames: true, // preserve class names
						keep_fnames: true // preserve function names
					}
				})
			]
		},
		module: {
			rules: [{
				include: path.resolve(srcDir, 'js'),
				use: [{
					loader: 'babel-loader',
					options: {
						presets: ['@babel/preset-env'],
						plugins: [
							["@babel/plugin-transform-runtime", {
								regenerator: true,
								helpers: true
							}]
						]
					}
				}]
			}, {
				/* Polyfills shouldn't be merged with app.js, resolve them with an url */
				include: path.resolve(srcDir, 'js', 'polyfill'),
				type: 'javascript/auto',
				generator:{
					filename: 'polyfill/[name].[ext]'
				}
			}, {
				include: path.resolve(srcDir, 'img'),
				type: 'asset/resource',
				generator:{
					filename: 'img/[name].[ext]'
				}
			}, {
				include: path.resolve(srcDir, 'audio'),
				type: 'asset/resource',
				generator:{
					filename: 'audio/[name].[ext]'
				}
			}, {
				include: path.resolve(srcDir, 'font'),
				type: 'asset/resource',
				generator:{
					filename: 'font/[name].[ext]'
				}
			}, {
				include: path.resolve(srcDir, 'css'),
				use: [
				  {
					loader: 'css-loader',
					options: {
					  importLoaders: 1,
					  modules: false,
					  esModule: false,
					  exportType: 'string' // This is the key option for EJS requires
					}
				  },
				  'postcss-loader'
				]
			  }]
		},
		plugins: [
			new CopyWebpackPlugin({
				patterns: [{ from: 'static' }]
			}),
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
			})/*,
			new ScriptExtHtmlWebpackPlugin({
				defaultAttribute: 'async'
			}),
			new ExtractTextPlugin({
				filename: 'css/styles.css'
			})*/
		]
	};
	return config;
}

module.exports = async env => {
	env = env || {};
	const config = genConfig(env);
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
