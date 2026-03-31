/** @type {import("jest").Config} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/src", "<rootDir>/tests"],
    moduleFileExtensions: ["ts", "tsx", "js"],
    collectCoverageFrom: [
        "src/**/*.ts",
        "!src/index.ts",
    ],
    coveragePathIgnorePatterns: ["/node_modules/", "\\.test\\.ts$"],
};
