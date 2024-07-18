import {getEnvOrExit} from "../util/common";
import {ENV} from "../type/common";

export const env = {
    // SQLite database path
    dbPath: getEnvOrExit("DB_PATH", "./data"),
    // Environment(dev|prod)
    env: getEnvOrExit("ENV", "dev") as ENV,
    // TON Archive server host
    ton: {
        host: getEnvOrExit("TON_ARCHIVE_NODE_HOST", ""),
        tonbag_address: getEnvOrExit("TON_BAG_ADDRESS", ""),
    }
}
