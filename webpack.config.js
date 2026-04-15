const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const WorkboxPlugin = require('workbox-webpack-plugin');

module.exports = {
  entry: './src/main.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js', // Use content hash for cache busting
    chunkFilename: '[name].[contenthash].chunk.js', // For dynamic chunks
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  // Enable filesystem caching for significantly faster subsequent builds
  cache: {
    type: 'filesystem',
  },
  // Code splitting configuration
  optimization: {
    splitChunks: {
      chunks: 'all',
      maxInitialRequests: 25,
      minSize: 20000,
      cacheGroups: {
        // Split Babylon.js into its own chunk (largest dependency)
        babylon: {
          test: /[\\/]node_modules[\\/]@babylonjs[\\/]/,
          name: 'vendor-babylon',
          chunks: 'all',
          priority: 30,
        },
        // Split React into its own chunk
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
          name: 'vendor-react',
          chunks: 'all',
          priority: 20,
        },
        // Other vendor dependencies
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor-other',
          chunks: 'all',
          priority: 10,
        },
      },
    },
    runtimeChunk: 'single', // Separate runtime chunk
  },
  // Increase performance limits to reduce warnings
  performance: {
    maxAssetSize: 5000000, // 5MB per asset (for GLB files)
    maxEntrypointSize: 3000000, // 3MB for entry point
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
          // Output GLB files to scene/assets/model/obstacles preserving folder structure
          filename: (pathData) => {
            // Get the path relative to public folder
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
            // index.html is already handled by HtmlWebpackPlugin
            return !resourcePath.endsWith('index.html');
          },
        },
      ],
    }),
    new WorkboxPlugin.GenerateSW({
      // these options encourage the ServiceWorkers to get in there fast
      // and not allow any straggling "old" SWs to hang around
      clientsClaim: true,
      skipWaiting: true,
      maximumFileSizeToCacheInBytes: 30000000, // 30MB limit for GLB files!
    }),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'public'),
    },
    compress: true,
    port: 3001,
    open: true,
    // API endpoint for automatic camera saving
    setupMiddlewares: (middlewares, devServer) => {
      const fs = require('fs');
      const { execSync } = require('child_process');

      devServer.app.use(require('express').json());

      devServer.app.post('/api/save-camera', (req, res) => {
        const body = req.body;
        const filename = body.filename || 'camera-settings.json';
        const settingsPath = path.join(__dirname, filename);

        console.log(`✉️ RECEIVED SAVE REQUEST: ${filename}`);
        if (!body.alpha && !body.radius) {
          console.warn('⚠️ WARNING: Received empty or malformed camera body!', body);
        }

        try {
          // Write the camera settings to file
          fs.writeFileSync(settingsPath, JSON.stringify(body, null, 2), 'utf8');
          console.log(`✅ Camera settings saved to ${filename}`);

          // Run sync-camera.js to update cameraDefaults.ts
          execSync('node scripts/sync-camera.js', { cwd: __dirname, stdio: 'inherit' });

          res.json({ success: true, message: `Camera settings saved as ${filename}` });
        } catch (err) {
          console.error(`❌ Failed to save camera settings and sync:`, err.message);
          res.status(500).json({ success: false, error: err.message });
        }
      });

      return middlewares;
    },
  },
};
