import { loadEnv } from '../config/env.js';
import { startMailOpsServer } from '../mail-operations/server/mailOpsServer.js';

loadEnv();
startMailOpsServer();
