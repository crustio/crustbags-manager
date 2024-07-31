import {getEnvOrExit} from "../util/common";
import {ENV} from "../type/common";
require('dotenv').config();
export const env = getEnvOrExit("ENV", "dev") as ENV;

export const isDev = env === "dev";

export const configs = {
    // SQLite database path
    dbPath: getEnvOrExit("DB_PATH", "./data"),
    // TON Archive server host
    ton: {
        host: getEnvOrExit("TON_RPC_URL", "", !isDev),
        tonbag_address: getEnvOrExit("TON_BAG_ADDRESS", "EQBOOMNqG0rvNm6vFGfR4qZl48BTDw_gYefVI4DQ70t9GoPC"),
        downloadPath: getEnvOrExit("TON_FILE_DOWNLOAD_PATH", "/root/downloads"),
    },
    task: {
        minReward: BigInt(getEnvOrExit("TASK_MIN_REWARD", "0", false)),
        maxFileSize: BigInt(getEnvOrExit("TASK_MAX_FILE_SIZE", "10485760", false)),
        providerMnemonic: getEnvOrExit("TASK_PROVIDER_MNEMONIC", ""),
        providerMinBalance: getEnvOrExit("TASK_PROVIDER_MIN_BALANCE", "1000000000"),
        submitStorageProofBefore: getEnvOrExit("TASK_SUBMIT_STORAGE_PROOF_BEFORE", "1800"),
        maxDownloadHeaderTimes: getEnvOrExit("TASK_MAX_DOWNLOAD_HEADER_TIMES", "10"),
        maxDownloadChildTimes: getEnvOrExit("TASK_MAX_DOWNLOAD_CHILD_TIMES", "10"),
    },
    tonStorageUtilsApi: getEnvOrExit('TON_STORAGE_UTILS_API', 'http://localhost:8192'),
}
