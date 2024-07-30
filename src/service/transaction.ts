import {Address, CommonMessageInfoInternal, Transaction as TonTransaction} from "@ton/ton";
import {configs} from "../config";
import {getTonProvider, TonProvider} from "../util/ton";
import {logger} from "../util/logger";
import {sleep} from "../util/common";
import {TransactionDescriptionGeneric} from "@ton/core/src/types/TransactionDescription";
import {TransactionComputeVm} from "@ton/core/src/types/TransactionComputePhase";
import {exit_success, op_place_storage_order} from "../wrapper/constants";
import {Valid} from "../type/common";
import {Transaction} from "../dao/transaction";
import {TON_BAG_ADDRESS} from "./constants";


/**
 * Query all place order transactions from TON bag contract
 */
export async function indexPlaceOrderTransactions() {
    const address = Address.parse(TON_BAG_ADDRESS);
    const ton = await getTonProvider();
    while (true) {
        const state = await ton.getContractState(address);
        // check contract state
        if (state.state !== 'active') {
            logger.error(`Contract is not active: ${state.state}`);
            return;
        }
        // no transaction waiting
        if (state.lastTransaction == null) {
            logger.info(`No last transactions found for contract ${TON_BAG_ADDRESS}`);
            await sleep(10);
            continue;
        }
        const tx = await ton.getTransaction(address, state.lastTransaction.lt, state.lastTransaction.hash);
        if (tx.status == "expire") {
            logger.info(`No transactions found for contract ${TON_BAG_ADDRESS}`);
        } else if (tx.status == "failed") {
            logger.error(`Failed to get transaction ${state.lastTransaction.lt} ${state.lastTransaction.hash}`);
        } else {
            await queryTransactions(address, ton, tx.tx);
        }
        await sleep(10);
    }
}

/**
 * Query transactions from last transaction
 * @param address tonbag address
 * @param ton   ton provider
 * @param lastTransaction last transaction
 */
async function queryTransactions(address: Address, ton: TonProvider, lastTransaction: TonTransaction) {
    const exist = await saveTransaction(lastTransaction);
    if (exist) {
        logger.info("Last transaction exist....");
        return;
    }
    let {prevTransactionLt, prevTransactionHash} = lastTransaction;
    while (prevTransactionLt > 0n) {
        const result = await ton.getTransaction(address, `${prevTransactionLt}`, TonProvider.convertNumberHashToBase64(prevTransactionHash));
        if (result.status == "expire" || result.status == "failed") {
            logger.error(`Failed to get transaction ${prevTransactionLt} ${prevTransactionHash}`);
            return;
        }
        const exist = await saveTransaction(result.tx);
        if (exist) {
            return;
        }
        prevTransactionLt = result.tx.prevTransactionLt;
        prevTransactionHash = result.tx.prevTransactionHash;
        await sleep(0.5);
    }
}

/**
 * Save transaction to database
 * @param tx transaction
 */
async function saveTransaction(tx: TonTransaction): Promise<boolean> {
    const exist = await Transaction.model.findAll({
        where: {
            address: TON_BAG_ADDRESS,
            tx_hash: TonProvider.formatHexStr(tx.hash().toString("hex")),
            lt: `${tx.lt}`
        }
    });
    if (exist.length > 0) {
        return true;
    }
    await Transaction.model.create(parseTransaction(tx));
    return false;
}

function parseTransaction(tx: TonTransaction): {
    tx_hash: string;
    lt: string;
    op_code: string;
    address: string;
    exit_code: number;
    detail: string;
    need_save_order: number;
} {
    const exit_code = parseExitCode(tx);
    const op_code = parseOpCode(tx);
    const order_index = (op_code === op_place_storage_order.toString(16) && exit_code === exit_success) ?
        Valid.TRUE : Valid.FALSE;
    return {
        tx_hash: TonProvider.formatHexStr(tx.hash().toString("hex")),
        lt: `${tx.lt}`,
        address: TON_BAG_ADDRESS,
        exit_code,
        op_code,
        detail: parseDetail(tx),
        need_save_order: order_index
    }
}

function parseDetail(tx: TonTransaction): string {
    let result = {};
    if (tx.inMessage) {
        const info = tx.inMessage.info;
        if (info.type === "internal") {
            const internal = info as CommonMessageInfoInternal;
            result = {
                ...result,
                inMessage: {
                    dest: internal.dest.toString(),
                    value: internal.value.coins
                }
            }
        }
    }
    if (tx.outMessagesCount > 0) {
        const info = tx.outMessages.values()[0].info;
        if (info.type === "internal") {
            const internal = info as CommonMessageInfoInternal;
            result = {
                ...result,
                outMessage: {
                    dest: internal.dest.toString(),
                    value: internal.value.coins
                }
            }
        }
    }
    return JSON.stringify(result, (k, v) => typeof v === 'bigint' ? v.toString() : v);
}

function parseExitCode(tx: TonTransaction): number {
    if (tx.description.type === "generic" && ((tx.description as any) as TransactionDescriptionGeneric).computePhase.type === "vm") {
        return (((tx.description as any) as TransactionDescriptionGeneric).computePhase as TransactionComputeVm).exitCode;
    }
    return -1;
}

function parseOpCode(tx: TonTransaction): string {
    if (tx.inMessage) {
        const cell = tx.inMessage.body;
        const cs = cell.beginParse();
        const remaining = cs.remainingBits;
        if (remaining >= 32) {
            const op = cs.loadUint(32);
            if (op) {
                return op.toString(16);
            }
        }
    }
    return "-1";
}
