import {initDb} from "./db";
import {logger} from "./util/logger";
import {jobs} from "./service/queryOrder";
import {getTonProvider} from "./util/ton";

async function main() {
    await initDb();
    await getTonProvider();
    await jobs();
}

main().catch((e) => {
    logger.error("Error in main", e);
    process.exit(1);
});
