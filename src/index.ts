import {initDb} from "./db";
import {logger} from "./util/logger";
import {job} from "./service/job";
import {getTonProvider} from "./util/ton";
const node = require('./merkle/node');

async function main() {
    await initDb();
    await getTonProvider();
    await job();
}

main().catch((e) => {
    logger.error("Error in main", e);
    process.exit(1);
});
