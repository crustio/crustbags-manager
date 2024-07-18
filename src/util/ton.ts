import {Config, getHttpEndpoint} from "@orbs-network/ton-access";
import {Address, TonClient, Transaction} from "@ton/ton";
import {env} from "../config";
import {fetchWithRetry} from "./common";
import {AxiosError} from "axios";

export type TransactionResult = {
    tx?: Transaction,
    e?: Error,
    status: "ok" | "expire" | "failed"
}

export class TonProvider {

    private readonly client: TonClient;
    private constructor(client: TonClient) {
        this.client = client;
    }

    static async init(config?: Config): Promise<TonProvider> {
        const endpoint = await getHttpEndpoint(config);
        const client = new TonClient({endpoint});
        return new TonProvider(client);
    }

    getTonClient(): TonClient {
        return this.client;
    }

    async getContractState(address: Address): Promise<{
        balance: bigint;
        state: "active" | "uninitialized" | "frozen";
        code: Buffer | null;
        data: Buffer | null;
        lastTransaction: {
            lt: string;
            hash: string;
        } | null;
        blockId: {
            workchain: number;
            shard: string;
            seqno: number;
        };
        timestampt: number;
    }> {
        return await this.client.getContractState(address);
    }

    async getTransaction(address: Address, lt: string, hash: string): Promise<TransactionResult> {
        try {
            const result = await fetchWithRetry(this.client.getTransaction(address, lt, hash));
            return {
                tx: result,
                status: "ok"
            };
        } catch (e) {
            if (this.overdueTransactionByRPCResponse(e)) {
                return {
                    status: "expire"
                };
            }
            return {
                e,
                status: "failed"
            };
        }
    }

    private overdueTransactionByRPCResponse(err: Error): boolean {
        if (err.name === "AxiosError") {
            const axiosError = err as AxiosError;
            if (axiosError.response?.status === 500 && axiosError.response?.data) {
                const data = axiosError.response?.data as any;
                if (data.error && `${data.error}`.indexOf("LITE_SERVER_UNKNOWN") >= 0) {
                    return true;
                }
            }
        }
        return false;
    }


    static convertNumberHashToBase64(hash: string|bigint): string {
        if (typeof hash === 'bigint') {
            let hexStr = hash.toString(16);
            while (hexStr.length < 64) {
                hexStr = `0${hexStr}`;
            }
            return Buffer.from(hexStr, "hex").toString('base64');
        }
        return Buffer.from(TonProvider.formatHexStr(hash), "hex").toString('base64');
    }

    static formatHexStr(hex: string): string {
        let hexStr = hex;
        while (hexStr.length < 64) {
            hexStr = `0${hexStr}`;
        }
        return hexStr;
    }

}

export const TONProvider = async(): Promise<TonProvider> => {
    return env.env === "dev" ? await TonProvider.init({
        network: "testnet"
    }) : await TonProvider.init({
        network: "mainnet",
        host: env.ton.host
    });
}
