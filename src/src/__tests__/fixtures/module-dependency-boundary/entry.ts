import "./static-leaf";

export * from "./barrel";

export async function loadDynamicLeaf() {
  return import("./dynamic-leaf");
}

export function loadRequiredLeaf() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./require-leaf");
}
