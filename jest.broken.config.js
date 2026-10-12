// Config per lanciare SOLO le versioni rotte dell'esercizio (tests/broken): `npm run test:broken`
const base = require("./jest.config");

module.exports = {
  ...base,
  roots: ["<rootDir>/tests/broken"],
  testPathIgnorePatterns: ["/node_modules/"],
};
