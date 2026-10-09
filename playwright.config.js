// Extension tests run against tests/mock-whatsapp.html served on the real WhatsApp URL.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests/extension",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  grepInvert: process.env.WAT_SLOW ? undefined : /@slow/,
});
