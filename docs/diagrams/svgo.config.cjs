// Rough.js writes long coordinates for every sketch stroke; one decimal is plenty for a hand-drawn line.
module.exports = {
  multipass: true,
  floatPrecision: 1,
  plugins: [{ name: 'preset-default', params: { overrides: { inlineStyles: false, minifyStyles: false, cleanupIds: false, removeViewBox: false, convertShapeToPath: false } } }],
};
