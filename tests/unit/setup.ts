import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each test run writes its security ledger to a fresh temporary folder.
process.env.NEXUS_DATA_DIR = mkdtempSync(join(tmpdir(), "nexus-ledger-"));
