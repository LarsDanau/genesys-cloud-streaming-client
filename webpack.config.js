const path = require('path');
const webpack = require('webpack');
const WebpackAutoInject = require('webpack-auto-inject-version');
const nodeExternals = require('webpack-node-externals');

module.exports = (env) => {
  const minimize = env && env.production;
  const cdn = env && env.cdn;

  let filename = 'streaming-client';
  let mode;
  let externals = [];
  let babelExcludes = [];
  let babelOptions;

  /* if building for the cdn */
  if (cdn) {
    filename += '.bundle';

    /*
      this is so babel doesn't try to polyfill/transpile core-js (which is the polyfill)
        and the build tools.
      But we want it polyfill/transpile all other node_modules when building for the web
    */
    babelExcludes = [
      /\bcore-js\b/,
      /\bwebpack\/buildin\b/
    ];

    babelOptions = {
      sourceType: 'unambiguous',
      ignore: [/\/core-js/],
      presets: [
        ['@babel/preset-env',
          {
            debug: false, /* set to `true` if you start banging your head against the wall */
            targets: [
              'last 2 versions',
              '> 5%',
              'IE 11',
              'not dead'
            ]
          }
        ]
      ],
      plugins: [
        ['@babel/plugin-transform-runtime', {
          corejs: 3
        }]
      ]
    };
  } else {
    /* we are building for node */
    const modulesToBundle = [/* left this here just in case it is needed */];

    /* we don't want to bundle node_modules */
    externals.push(nodeExternals({
      allowlist: modulesToBundle.map(m => new RegExp(`^${m.replace(/-/g, '\\-')}`))
    }));

    /* if we are building for 'module', don't polyfill/transpile most dependencies */
    babelExcludes = [
      new RegExp(`/node_modules/(?!${modulesToBundle.join('|')}/)`)
    ];

    babelOptions = {
      sourceType: 'unambiguous',
      presets: ['@babel/preset-env']
    };
  }

  filename += minimize ? '.min.js' : '.js';
  mode = minimize ? 'production' : 'development';

  return {
    target: 'web',
    entry: './src/client.js',
    mode,
    optimization: {
      minimize
    },
    externals,
    devtool: minimize ? 'source-map' : '',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename,
      library: 'GenesysCloudStreamingClient',
      libraryTarget: 'umd',
      libraryExport: 'default'
    },
    plugins: [
      new webpack.DefinePlugin({ 'global.GENTLY': false }),
      new WebpackAutoInject({
        components: {
          AutoIncreaseVersion: false,
          InjectByTag: {
            fileRegex: /\.+/,
            AIVTagRegexp: /(\[AIV])(([a-zA-Z{} ,:;!()_@\-"'\\\/])+)(\[\/AIV])/g // eslint-disable-line
          }
        }
      })
    ],
    module: {
      rules: [
        {
          test: /\.(c|m)?js$/,
          loader: 'babel-loader',
          exclude: babelExcludes,
          options: babelOptions
        }
      ]
    }
  };
};
