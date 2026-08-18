// Bootstrap for worker threads — registers tsx require hook before loading the TS worker.
try { require('tsx/cjs'); } catch (e) { /* tsx may not be available — .ts imports will fail */ }
require('./threadPool.worker.ts');
