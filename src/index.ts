import {logger} from "./util/logger";
import {initDb} from "./dao/common";
import {job} from "./service/job";

async function main() {
    await initDb();
    await job();
}

main().catch((e) => {
    logger.error("Error in main", e);
    process.exit(1);
});
