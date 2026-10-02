import { defineConfig } from "@playwright/test";
import rootConfig from "../../../playwright.config";

export default defineConfig({
  ...rootConfig,
  testDir: ".",
  testMatch: "BuyInSlider.spec.ts",
});