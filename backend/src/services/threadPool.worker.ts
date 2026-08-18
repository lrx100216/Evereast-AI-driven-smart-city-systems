// Worker thread — loads modules via require() and calls exported functions.
// Written as pure CommonJS for compatibility with tsx + vitest on all platforms.
const { parentPort } = require('worker_threads');
const { pathToFileURL } = require('url');
const { createRequire } = require('module');

if (!parentPort) throw new Error('threadPool.worker.ts must be run as a worker thread');

parentPort.on('message', (msg) => {
  const { taskId, spec } = msg;
  try {
    // Convert absolute Windows paths to file:// URLs for createRequire
    // On Windows, require() works fine with backslash paths, but createRequire needs a URL
    const fileUrl = pathToFileURL(spec.modulePath).href;
    const req = createRequire(fileUrl);
    const mod = req(spec.modulePath);
    const fn = mod[spec.exportName];

    if (typeof fn !== 'function') {
      throw new Error(
        `Export "${spec.exportName}" is not a function in ${spec.modulePath}`,
      );
    }

    const result = fn(...spec.args);

    // Handle both sync and async results
    if (result && typeof result.then === 'function') {
      result.then(
        (val) => parentPort.postMessage({ taskId, result: val }),
        (err) => parentPort.postMessage({ taskId, error: err?.message || String(err) }),
      );
    } else {
      parentPort.postMessage({ taskId, result });
    }
  } catch (err) {
    parentPort.postMessage({ taskId, error: err?.message || String(err) });
  }
});
