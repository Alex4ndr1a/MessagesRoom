import { createDefaultEsmPreset } from 'ts-jest'

const presetConfig = createDefaultEsmPreset({
    stringifyContentPathRegex: /src\/tests\/*\.test\.ts/
})

export default {
  ...presetConfig,
    testMatch: ["<rootDir>/src/tests/**/*.test.ts"]
};
