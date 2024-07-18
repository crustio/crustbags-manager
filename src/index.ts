import {initDb} from "./db";
import {logger} from "./util/logger";

async function main() {
    await initDb();
}

main().catch((e) => {
    logger.error("Error in main", e);
    process.exit(1);
});
