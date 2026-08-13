// Expo's Babel preset, unmodified. CommonJS on purpose: Metro and Babel load their config
// files as CJS, and this app deliberately omits `"type": "module"` from package.json for that
// reason (every other workspace package sets it).
module.exports = (api) => {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
