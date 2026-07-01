const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const WorkboxPlugin = require('workbox-webpack-plugin');

module.exports = (env, argv) => {
  const outDir = env.OUT_DIR || process.env.OUT_DIR || 'dist';
  const port = env.PORT || process.env.PORT || 3001;
  const isProduction = argv.mode === 'production';

  return {
    entry: './src/main.ts',
    output: {
      path: path.resolve(__dirname, outDir),
      filename: '[name].[contenthash].js',
      chunkFilename: '[name].[contenthash].chunk.js',
      clean: true,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js'],
    },
    cache: {
      type: 'memory',
    },
    optimization: {
      splitChunks: {
        chunks: 'all',
        maxInitialRequests: 25,
        minSize: 20000,
        cacheGroups: {
          babylon: {
            test: /[\\/]node_modules[\\/]@babylonjs[\\/]/,
            name: 'vendor-babylon',
            chunks: 'all',
            priority: 30,
          },
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            name: 'vendor-react',
            chunks: 'all',
            priority: 20,
          },
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendor-other',
            chunks: 'all',
            priority: 10,
          },
        },
      },
      runtimeChunk: 'single',
    },
    performance: {
      maxAssetSize: 5000000,
      maxEntrypointSize: 3000000,
      hints: false,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.glb$/,
          type: 'asset/resource',
          generator: {
            filename: (pathData) => {
              const relativePath = pathData.filename.replace(/^.*public[/\\]/, '');
              return relativePath;
            }
          }
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './public/index.html',
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, 'public'),
            to: '.',
            filter: (resourcePath) => {
              if (resourcePath.endsWith('index.html')) return false;
              const normalized = resourcePath.replace(/\\/g, '/');
              const unusedAssetPatterns = [
                /\/scene\/assets\/model\/player_old\.glb$/i,
                /\/scene\/assets\/model\/temp_player\.(gltf|bin)$/i,
                /\/scene\/assets\/model\/buffer\.bin$/i,
                /\/scene\/assets\/model\/baseColor\.png$/i,
                /\/scene\/assets\/model\/output$/i,
                /\/scene\/assets\/model\/analyze-anim\.js$/i,
                /\/intro-screen_old\.png$/i,
                /\/OutroOverlay_old\.png$/i,
              ];
              return !unusedAssetPatterns.some((pattern) => pattern.test(normalized));
            },
          },
        ],
      }),
      // Service worker precaching is production-only: regenerating it on every
      // dev-server HMR rebuild caused it to seize control mid-session and serve
      // stale cached bundles, producing a "Loading assets..." reload loop.
      ...(isProduction ? [new WorkboxPlugin.GenerateSW({
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 2500000,
        exclude: [
          /scene\/assets\/model\/.*\.glb$/i,
          /sounds\/.*\.(mp3|wav)$/i,
          /\.(webm|mp4)$/i,
        ],
      })] : []),
    ],
    devServer: {
      static: {
        directory: path.join(__dirname, 'public'),
      },
      compress: true,
      port: port,
      open: true,
      client: {
        overlay: {
          errors: true,
          warnings: false,
        },
      },
      setupMiddlewares: (middlewares, devServer) => {
        const fs = require('fs');
        const { execSync } = require('child_process');
        devServer.app.use(require('express').json());
        devServer.app.post('/api/save-camera', (req, res) => {
          const body = req.body;
          const filename = body.filename || 'camera-settings.json';
          const settingsPath = path.join(__dirname, filename);
          try {
            fs.writeFileSync(settingsPath, JSON.stringify(body, null, 2), 'utf8');
            execSync('node scripts/sync-camera.js', { cwd: __dirname, stdio: 'inherit' });
            res.json({ success: true, message: `Camera settings saved as ${filename}` });
          } catch (err) {
            res.status(500).json({ success: false, error: err.message });
          }
        });
        return middlewares;
      },
    },
  };
};
