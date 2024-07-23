import {getTonProvider, TonProvider} from "../util/ton";
import {Address, CommonMessageInfoInternal, fromNano, Transaction as TonTransaction, WalletContractV4} from "@ton/ton";
import {configs} from "../config";
import {logger} from "../util/logger";
import {now, sleep} from "../util/common";
import {TransactionDescriptionGeneric} from "@ton/core/src/types/TransactionDescription";
import {TransactionComputeVm} from "@ton/core/src/types/TransactionComputePhase";
import {sequelize} from "../db";
import {Transaction} from "../dao/transaction";
import {Op, Transaction as DBTransaction} from "sequelize";
import {exit_success, op_place_storage_order} from "../wrapper/constants";
import {OrderState, TaskState, Valid} from "../type/common";
import {Order} from "../dao/order";
import {Cell} from "@ton/core";
import {Config} from "../dao/config";
import {Task} from "../dao/task";
import {mnemonicToWalletKey} from "@ton/crypto";
import {StorageContract} from "../wrapper/StorageContract";

const LAST_ORDER_UPDATE_ID = "LAST_ORDER_UPDATE_ID";
const LAST_TASK_GENERATE_ORDER_ID = "LAST_TASK_GENERATE_ORDER_ID";
const TON_BAG_ADDRESS = configs.ton.tonbag_address;

export async function jobs() {
    const queryTx = indexPlaceOrderTransactions();
    const analysisTx = analysisOrders();
    const updateOrder = updateOrderState();
    const generate = generateTasks();
    const register = registerStorageProvider();
    const uploadProof = uploadStorageProofs();
    const claim = claimRewards();
    const jobs = [analysisTx, queryTx, updateOrder, generate, register, uploadProof, claim];
    return Promise.all(jobs).catch(e => {
        logger.error(`Error in jobs: ${e.stack}`);
        throw new Error(e);
    });
}

async function registerStorageProvider() {
    while (true) {
        if (!await checkBalance()) {
            logger.error("Provider balance is not enough, waiting for balance...");
            await sleep(60 * 1000);
            continue;
        }
        const tasks = await Task.model.findAll({
            where: {
                task_state: TaskState.unregister_storage_provider
            },
            limit: 10
        });
        if (tasks.length === 0) {
            logger.info("Provider balance is not enough, waiting for balance...");
            await sleep(60 * 1000);
            continue;
        }
        for (const task of tasks) {
            await registerProvider(task);
        }
    }
}

async function registerProvider(task: any) {
    const order = (await Order.model.findAll({
        where: {
            id: task.order_id
        }
    }))[0];
    const provider = await getTonProvider();
    const key = await mnemonicToWalletKey(configs.task.providerMnemonic.split(" "));
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    const storageContract = provider.getTonClient().open(StorageContract.createFromAddress(Address.parse(order.address)));
    const walletContract = provider.getTonClient().open(wallet);
    const sender = walletContract.sender(key.secretKey);
    await storageContract.sendRegisterAsStorageProvider(sender);
    const registerSuccess = await checkRegisterSuccess(sender.address);
    if (registerSuccess) {
        await Task.model.update({
            task_state: TaskState.submit_storage_proof
        }, {
            where: {
                id: task.id
            }
        });
    }
}

/**
 * Check register success(get next proof for 10 times)
 */
async function checkRegisterSuccess(address: Address): Promise<boolean> {
    const provider = await getTonProvider();
    const storageContract = provider.getTonClient().open(StorageContract.createFromAddress(address));
    let nextProof = await storageContract.getNextProof(address);
    let retryTimes = 0;
    while (nextProof == -1n && retryTimes > 10) {
        nextProof = await storageContract.getNextProof(address);
        retryTimes++;
    }
    return nextProof == -1n;
}

async function getProviderAddress(): Promise<Address> {
    const key = await mnemonicToWalletKey(configs.task.providerMnemonic.split(" "));
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    return wallet.address;
}

async function checkBalance(): Promise<boolean> {
    const provider = await getTonProvider();
    const address = await getProviderAddress()
    if (!await provider.getTonClient().isContractDeployed(address)) {
        logger.error("Provider wallet not deployed");
        return false;
    }
    const balance = await provider.getTonClient().getBalance(address);
    const providerMinBalance = BigInt(configs.task.providerMinBalance);
    if (balance < providerMinBalance) {
        logger.error(`Provider balance ${balance} is not enough: ${providerMinBalance}`);
        return false;
    }
    return true;
}

async function uploadStorageProofs() {
    while (true) {
        const tasks = await Task.model.findAll({
            where: {
                task_state: TaskState.submit_storage_proof
            },
            order: [
                ['last_proof_time', 'ASC']
            ],
            limit: 100
        });
        if (tasks.length === 0) {
            await sleep(60 * 1000);
            continue;
        }
        for (const task of tasks) {
            await submitStorageProof(task);
        }
    }
}

async function submitStorageProof(task: any) {
    const order = (await Order.model.findAll({
        where: {
            id: task.order_id
        }
    }))[0];
    const provider = await getTonProvider();
    const storageContract = provider.getTonClient().open(StorageContract.createFromAddress(order.address));
    const started = await storageContract.getStarted();
    if (!started) {
        logger.error(`Storage contract address: ${order.address} is not started`);
        return;
    }
    const periodFinish = await storageContract.getPeriodFinish();
    if (periodFinish < BigInt(now())) {
        await Task.model.update({
            task_state: TaskState.period_finish
        }, {
            where: {
                id: task.id
            }
        });
        logger.error(`Storage contract address: ${order.address} is expired`);
        return;
    }
    const key = await mnemonicToWalletKey(configs.task.providerMnemonic.split(" "));
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    const walletContract = provider.getTonClient().open(wallet);
    const sender = walletContract.sender(key.secretKey);
    const nextProof = await storageContract.getNextProof(wallet.address);
    if (nextProof == -1n) {
        logger.error(`No proof found for address: ${wallet.address}`);
        return;
    }
    const torrentHash = order.torrent_hash;
    // TODO: get merkle root by torrent hash
    const merkleRoot: bigint = 0n;
    await storageContract.sendSubmitStorageProof(sender, merkleRoot);
    const lastProofTime = await storageContract.getStorageProviderLastProofTime(wallet.address);
    if (lastProofTime) {
        await Task.model.update({
            task_state: TaskState.submit_storage_proof,
            last_proof_time: lastProofTime
        }, {
            where: {
                id: task.id
            }
        });
    }
}

async function claimRewards() {
    while (true) {
        const tasks = await Task.model.findAll({
            where: {
                task_state: TaskState.period_finish
            },
            limit: 100
        });
        if (tasks.length === 0) {
            await sleep(60 * 1000);
            continue;
        }
        for (const task of tasks) {
            await claimReward(task);
        }
    }
}

async function claimReward(task: any) {
    const order = (await Order.model.findAll({
        where: {
            id: task.order_id
        }
    }))[0];
    const provider = await getTonProvider();
    const storageContract = provider.getTonClient().open(StorageContract.createFromAddress(order.address));
    const key = await mnemonicToWalletKey(configs.task.providerMnemonic.split(" "));
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    const walletContract = provider.getTonClient().open(wallet);
    const sender = walletContract.sender(key.secretKey);
    let earned = await storageContract.getEarned(sender.address);
    let update: any = {
        task_state: TaskState.task_finish
    }
    if (earned > 0n) {
        await storageContract.sendClaimStorageRewards(sender);
        let retry = 0, claimSuccess = false;
        while (earned != 0n || retry < 10) {
            earned = await storageContract.getEarned(sender.address);
            retry++;
        }
        update = {
            task_state: claimSuccess ? TaskState.task_finish : TaskState.period_finish,
            total_rewards: claimSuccess ? earned : 0
        }
    }
    await Task.model.update(update, {
        where: {
            id: task.id,
        }
    });
}

async function generateTasks() {
    while(true) {
        const provider = await getTonProvider();
        const lastOrderId = await Config.get(LAST_TASK_GENERATE_ORDER_ID, "0");
        const lastOrder = await Order.model.findAll({
            where: {
                id: {
                    [Op.gt]: lastOrderId
                },
                order_state: {
                    [Op.gte]: OrderState.not_started
                }
            },
            limit: 10,
            order: [
                ['id', 'ASC']
            ],
        });
        if (lastOrder.length === 0) {
            logger.info(`No task order found...`);
            await sleep(60 * 1000);
            continue;
        }
        for (const order of lastOrder) {
            await sequelize.transaction(async (tx: DBTransaction) => {
                await generateTask(provider, order, tx);
                await Config.updateConfig(LAST_TASK_GENERATE_ORDER_ID, `${order.id}`, tx);
            })
        }
    }
}

/**
 * Generate task by order
 * @param provider
 * @param order
 * @param transaction
 */
async function generateTask(provider: TonProvider, order: any, transaction: DBTransaction): Promise<void> {
    // get order current state
    const orderState = await parseOrder(provider, order.address);
    if (orderState.order_state > OrderState.invalid) {
        // generate task
        await Task.model.create({
            order_id: order.id,
            task_state: TaskState.unregister_storage_provider,
        }, {
            transaction
        });
    }
}

/**
 * Save orders
 */
async function analysisOrders() {
    const ton = await getTonProvider();
    while (true) {
        const orderTx = await Transaction.model.findAll({
            where: {
                address: TON_BAG_ADDRESS,
                need_save_order: Valid.TRUE
            }
        });
        if (orderTx.length === 0) {
            await sleep(10 * 1000);
            continue;
        }
        for (const tx of orderTx) {
            const orderAddress = JSON.parse(tx.detail).outMessage.dest;
            await parseAndSaveOrder(ton, orderAddress, tx.id);
        }
    }
}

/**
 * Parse and save order from contract address
 * @param ton TonProvider
 * @param address order contract address
 * @param id transaction.id
 */
async function parseAndSaveOrder(ton: TonProvider, address: string, id: number) {
    const order = await parseOrder(ton, address);
    if (order == null) {
        return;
    }
    await sequelize.transaction(async (transaction: DBTransaction) => {
        await Order.model.create(order, {transaction});
        await Transaction.model.update({
            need_save_order: Valid.FALSE
        }, {
            where: {
                id
            },
            transaction
        })
    });
}

/**
 * Parse order from contract address
 * @param ton
 * @param address
 */
async function parseOrder(ton: TonProvider, address: string): Promise<any|null> {
    const orderState = await ton.getContractState(Address.parse(address));
    if (orderState.state !== "active") {
        logger.error(`Order contract is not active: ${orderState.state}`);
        return null;
    }
    const cells = Cell.fromBoc(orderState.data!);
    const cell = cells[0];
    const orderInfo = loadOrderInfo(cell);
    const rewardsParams = loadRewardsParams(cell);
    return {
        address,
        ...orderInfo,
        started: rewardsParams.started,
        total_rewards: rewardsParams.total_rewards,
        period_finish: rewardsParams.period_finish,
        order_detail: JSON.stringify(rewardsParams),
        order_state: parseOrderState(rewardsParams.started, rewardsParams.period_finish)
    };
}


/**
 * Update order state
 */
async function updateOrderState() {
    while(true) {
        const provider = await getTonProvider();
        const lastOrderId = await Config.getInt(LAST_ORDER_UPDATE_ID, 0);
        const orders = await Order.model.findAll({
            where: {
                id: {
                    [Op.gt]: lastOrderId
                },
                [Op.or]: {
                    [Op.and]: {
                        started: 1,
                        period_finish: {
                            [Op.lt]: Date.now()
                        }
                    },
                    started: 0
                }
            },
            order: [
                ['id', 'ASC']
            ],
            limit: 10
        });
        if (orders.length === 0) {
            await Config.updateConfig(LAST_ORDER_UPDATE_ID, `0`);
            await sleep(10 * 1000);
            continue;
        }
        for (const order of orders) {
            const orderState: any|null = await parseOrder(provider, order.address);
            if (orderState == null) {
                await Order.model.update({
                    order_state: OrderState.invalid
                }, {
                    where: {
                        id: order.id
                    }
                });
            } else {
                await Order.model.update(orderState, {
                    where: {
                        id: order.id
                    }
                });
            }
            await Config.updateConfig(LAST_ORDER_UPDATE_ID, `${order.id}`);
        }
    }
}

/**
 * Load order info from contract base cell
 * @param cell
 */
function loadOrderInfo(cell: Cell): {
    torrent_hash: string;
    owner_address: string;
    file_merkle_hash: string;
    file_size_in_bytes: number;
    storage_period_in_sec: number;
    max_storage_proof_span_in_sec: number;
    treasury_info: string
} {
    const cs = cell.beginParse();
    const orderInfo = cs.loadRef();
    const orderDs = orderInfo.beginParse();
    const torrent_hash_bit = orderDs.loadUintBig(256);
    const torrent_hash = torrent_hash_bit.toString(16);
    const owner_address = orderDs.loadAddress().toString();
    const file_merkle_hash_bit = orderDs.loadUintBig(256);
    const file_merkle_hash = file_merkle_hash_bit.toString(16);
    const file_size_in_bytes = orderDs.loadUint(64);
    const storage_period_in_sec = orderDs.loadUint(64);
    const max_storage_proof_span_in_sec = orderDs.loadUint(64);
    const treasuryCell = orderDs.loadRef();
    const ds = treasuryCell.beginParse();
    const treasury_info = {
        treasury_address: ds.loadAddress().toString(),
        treasury_fee_rate: ds.loadUint(16)
    }
    return {
        torrent_hash,
        owner_address,
        file_merkle_hash,
        file_size_in_bytes,
        storage_period_in_sec,
        max_storage_proof_span_in_sec,
        treasury_info: JSON.stringify(treasury_info)
    }
}

function loadRewardsParams(cell: Cell): {
    started: number;
    total_storage_providers: number;
    total_rewards: number;
    total_rewards_per_sec_scaled: number;
    undistributed_rewards_scaled: number;
    per_sec_per_provider_total_rewards_settled_scaled: number;
    period_finish: number;
    last_settle_time: number
} {
    const cs = cell.beginParse();
    const orderInfo = cs.loadRef();
    const rewardsParams = cs.loadRef();
    const ds = rewardsParams.beginParse();
    return {
        started: ds.loadUint(1),
        total_storage_providers: ds.loadUint(32),
        total_rewards: ds.loadUint(192),
        total_rewards_per_sec_scaled: ds.loadUint(192),
        undistributed_rewards_scaled: ds.loadUint(192),
        per_sec_per_provider_total_rewards_settled_scaled: ds.loadUint(192),
        period_finish: ds.loadUint(32),
        last_settle_time: ds.loadUint(32)
    }
}

function parseOrderState(started: number, period_finish: number): OrderState {
    if (started === 0) {
        return OrderState.not_started;
    }
    return period_finish > now() ? OrderState.started : OrderState.invalid;
}

/**
 * Query all place order transactions from TON bag contract
 */
async function indexPlaceOrderTransactions() {
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
            logger.info(`No transactions found for contract ${TON_BAG_ADDRESS}`);
            await sleep(10 * 1000);
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
        await sleep(10 * 1000);
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
        await sleep(500);
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


