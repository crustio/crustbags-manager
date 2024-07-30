import {initDb} from "./db";
import {logger} from "./util/logger";
import {job} from "./service/job";

async function main() {
    await initDb();
    await job();
}

main().catch((e) => {
    logger.error("Error in main", e);
    process.exit(1);
});
