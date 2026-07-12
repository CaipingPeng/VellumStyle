import test from "node:test";

test("npm-entry-selected", () => {
  console.log("NPM_ARGUMENT_PROBE_SELECTED");
});

test("npm-entry-not-selected", () => {
  console.log("NPM_ARGUMENT_PROBE_REJECTED");
});
