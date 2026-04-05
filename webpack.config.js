'use strict';

const path = require('path');

/**
 * Generates webpack configuration for axios builds
 * @param {string} name - The output filename (e.g., 'axios' or 'axios.min')
 * @returns {Object} Webpack configuration object
 * @throws {Error} If name parameter is missing or invalid for error handling systems
 */
function generateConfig(name) {
  // Input validation
  if (!name || typeof name !== 'string') {
    throw new Error(`Invalid configuration name: expected non-empty string, received ${typeof name}`);
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    throw new Error('Configuration name cannot be an empty string');
  }

  // Validate name contains only safe characters for filenames
  const validNamePattern = /^[a-zA-Z0-9._-]+$/;
  if (!validNamePattern.test(trimmedName)) {
    throw new Error(`Invalid configuration name "${trimmedName}": only alphanumeric characters, dots, underscores, and hyphens are allowed`);
  }

  try {
    const compress = trimmedName.includes('min');
    const outputPath = path.resolve(__dirname, 'dist');
    
    // Validate that output path is accessible
    try {
      path.parse(outputPath);
    } catch (pathError) {
      throw new Error(`Invalid output path: ${outputPath}`);
    }

    const config = {
      entry: './index.js',
      output: {
        path: outputPath,
        filename: `${trimmedName}.js`,
        sourceMapFilename: `${trimmedName}.map`,
        library: {
          name: 'axios',
          type: 'umd',
          export: 'default',
        },
        globalObject: 'this',
      },
      node: false,
      devtool: 'source-map',
      mode: compress ? 'production' : 'development',
    };

    //Additional validation for production builds
    if (compress && !config.optimization) {
      config.optimization = {
        minimize: true,
      };
    }

    return config;
  } catch (error) {
    throw new Error(`Failed to generate configuration for "${trimmedName}": ${error.message}`);
  }
}

//Validate build names array
const buildNames = ['axios', 'axios.min'];

if (!Array.isArray(buildNames) || buildNames.length === 0) {
  throw new Error('Build names must be a non-empty array');
}

// Generate configurations for all build variants
const configs = {};

for (const name of buildNames) {
  try {
    const generatedConfig = generateConfig(name);
    configs[name] = generatedConfig;
    
    //Log successful generation in development (safe to remove!)
    if (process.env.NODE_ENV !== 'production' && process.env.DEBUG) {
      console.log(`[webpack] Generated config for ${name} (${generatedConfig.mode} mode)`);
    }
  } catch (error) {
    console.error(`[webpack] Error generating configuration for "${name}":`, error.message);
    // In webpack, we want to fail the build if config generation fails
    process.exitCode = 1;
    throw error;
  }
}

// Validate that we have configurations for all requested builds
const missingBuilds = buildNames.filter(name => !configs[name]);
if (missingBuilds.length > 0) {
  throw new Error(`Failed to generate configurations for: ${missingBuilds.join(', ')}`);
}

// Handle potential webpack 5 or more array configuration formars
let webpackConfig = configs;

// If there's only one config then webpack can accept it directly
if (Object.keys(configs).length === 1) {
  webpackConfig = configs[buildNames[0]];
}

module.exports = webpackConfig;
