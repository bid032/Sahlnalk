/**
 * cPanel / Passenger startup wrapper.
 *
 * Passenger runs Node apps without a usable stdin file descriptor. Node's lazy
 * `process.stdin` getter then throws `Error: open EEXIST ... at process.getStdin`
 * the first time ANY module touches `node:process` exports (which the SSR bundle
 * does on every request) -> every page returns a 500 "HTTPError".
 *
 * Fix: replace `process.stdin` / `process.stdout` access with safe stub streams
 * BEFORE importing the built server bundle.
 *
 * Set this file as the "Application startup file" in cPanel -> Node.js App:
 *     cpanel-start.mjs
 */
import { Readable } from "node:stream";

function installStdinStub() {
  let stub;
  try {
    // If it already works, leave it alone.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    process.stdin;
    return;
  } catch {
    stub = new Readable({ read() {} });
    stub.push(null);
    stub.isTTY = false;
    stub.setRawMode = () => stub;
    stub.ref = () => stub;
    stub.unref = () => stub;
  }

  Object.defineProperty(process, "stdin", {
    configurable: true,
    enumerable: true,
    get: () => stub,
  });
}

installStdinStub();

await import("./.output/server/index.mjs");
