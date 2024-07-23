import {getEnvOrExit} from "../util/common";
import {ENV} from "../type/common";

export const env = getEnvOrExit("ENV", "dev") as ENV;

export const isDev = env === "dev";

export const configs = {
    // SQLite database path
    dbPath: getEnvOrExit("DB_PATH", "./data"),
    // TON Archive server host
    ton: {
        host: getEnvOrExit("TON_ARCHIVE_NODE_HOST", "", !isDev),
        tonbag_address: getEnvOrExit("TON_BAG_ADDRESS", "EQAiRfFdxEf5dmSb2cEpq8pjhyHts6hmoI1woHqLRPRwZKuw"),
    },
    task: {
        minReward: BigInt(getEnvOrExit("TASK_MIN_REWARD", "0", false)),
        maxFileSize: BigInt(getEnvOrExit("TASK_MAX_FILE_SIZE", "10485760", false)),
        providerMnemonic: getEnvOrExit("TASK_PROVIDER_MNEMONIC"),
        providerMinBalance: getEnvOrExit("TASK_PROVIDER_MIN_BALANCE", "1000000000"),
    }
}
