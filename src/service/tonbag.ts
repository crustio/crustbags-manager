import {logger} from "../util/logger";
import {now, sleep} from "../util/common";
import {Task} from "../dao/task";
import {TaskState} from "../type/common";
import {Order} from "../dao/order";
import {getTonProvider} from "../util/ton";
import {mnemonicToWalletKey} from "@ton/crypto";
import {configs} from "../config";
import {Address, OpenedContract, WalletContractV4} from "@ton/ton";
import {StorageContract} from "../wrapper/StorageContract";
const node = require('../merkle/node')

export async function registerStorageProvider() {
    while (true) {
        if (!await checkBalance()) {
            logger.error("Provider balance is not enough, waiting for balance...");
            await sleep(10);
            continue;
        }
        const tasks = await Task.model.findAll({
            where: {
                task_state: TaskState.download_torrent_success
            },
            limit: 10
        });
        if (tasks.length === 0) {
            logger.info("No task to register...");
            await sleep(10);
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
    const storageContract = provider.getStorageContract(order.address);
    const walletContract = provider.getTonClient().open(wallet);
    const sender = walletContract.sender(key.secretKey);
    let registerSuccess = await checkRegisterSuccess(wallet.address, order.address, false);
    if (registerSuccess) {
        return await Task.model.update({
            task_state: TaskState.submit_storage_proof,
            provider_address: wallet.address.toString()
        }, {
            where: {
                id: task.id
            }
        });
    }
    await storageContract.sendRegisterAsStorageProvider(sender);
    registerSuccess = await checkRegisterSuccess(wallet.address, order.address);
    if (registerSuccess) {
        await Task.model.update({
            task_state: TaskState.submit_storage_proof,
            provider_address: sender.address.toString()
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
async function checkRegisterSuccess(address: Address, orderAddress: string, retry: boolean = true): Promise<boolean> {
    const provider = await getTonProvider();
    const storageContract = provider.getStorageContract(orderAddress);
    console.log(`userAddress: ${address.toString()}`)
    let nextProof = await storageContract.getNextProof(address);
    if (retry) {
        let retryTimes = 0;
        while (nextProof == -1n && retryTimes < 10) {
            nextProof = await storageContract.getNextProof(address);
            retryTimes++;
        }
    }
    return nextProof != -1n;
}

async function getProviderAddress(): Promise<Address> {
    const key = await mnemonicToWalletKey(configs.task.providerMnemonic.split(" "));
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    return wallet.address;
}

async function checkBalance(): Promise<boolean> {
    const provider = await getTonProvider();
    const address = await getProviderAddress();
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

export async function uploadStorageProofs() {
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
            await sleep(10);
            continue;
        }
        for (const task of tasks) {
            try {
                await submitStorageProof(task);
            } catch (e) {
                logger.error(`upload task failed: ${e.message}`);
                await sleep(1);
            }
        }
        await sleep(2);
    }
}

async function submitStorageProof(task: any) {
    const order = (await Order.model.findAll({
        where: {
            id: task.order_id
        }
    }))[0];
    const provider = await getTonProvider();
    const storageContract = provider.getStorageContract(order.address);
    const started = await storageContract.getStarted();
    if (!started) {
        logger.error(`Storage contract address: ${order.address} is not started`);
        return;
    }
    const key = await mnemonicToWalletKey(configs.task.providerMnemonic.split(" "));
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    const walletContract = provider.getTonClient().open(wallet);
    const sender = walletContract.sender(key.secretKey);
    const nextProof: bigint = await storageContract.getNextProof(wallet.address);
    if (nextProof == -1n) {
        logger.error(`No proof found for address: ${wallet.address}`);
        return;
    }

    const periodFinish: bigint = await storageContract.getPeriodFinish();
    // proof final and update state
    if (periodFinish < BigInt(now())) {
        if (BigInt(task.last_proof_time) < periodFinish) {
            // final proof for this period
            const torrentHash = order.torrent_hash;
            const proofs: bigint[] = await node.getProofs(torrentHash, Number(nextProof));
            await storageContract.sendSubmitStorageProof(sender, proofs);
        }
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

    const torrentHash = order.torrent_hash;
    const proofs: bigint[] = await node.getProofs(torrentHash, Number(nextProof));
    //  save last proof time before upload
    const lastProofTime = await storageContract.getStorageProviderLastProofTime(wallet.address);
    if (lastProofTime) {
        await Task.model.update({
            last_proof_time: lastProofTime,
        }, {
            where: {
                id: task.id
            }
        });
    }
    await storageContract.sendSubmitStorageProof(sender, proofs);
    await Task.model.update({
        task_state: TaskState.proof_success_wait_for_update_state,
    }, {
        where: {
            id: task.id
        }
    });
}



export async function updateStorageProviderState() {
    while (true) {
        const tasks = await Task.model.findAll({
            where: {
                task_state: TaskState.proof_success_wait_for_update_state
            },
            limit: 100
        });
        if (tasks.length === 0) {
            await sleep(5);
            continue;
        }
        for (const task of tasks) {
            try {
                await updateProviderState(task);
            } catch (e) {
                logger.error(`upload task failed: ${e.message}`);
                await sleep(2);
            }
        }
        await sleep(1);
    }
}

async function updateProviderState(task: any) {
    const order = (await Order.model.findAll({
        where: {
            id: task.order_id
        }
    }))[0];
    const provider = await getTonProvider();
    const storageContract = provider.getStorageContract(order.address);
    let retry = 0;
    while (retry < 5) {
        const lastProofTime = await storageContract.getStorageProviderLastProofTime(Address.parse(task.provider_address));
        if (lastProofTime != null && lastProofTime > task.last_proof_time) {
            await Task.model.update({
                task_state: TaskState.submit_storage_proof
            }, {
                where: {
                    id: task.id
                }
            });
            return;
        }
        await sleep(1);
        retry++;
    }
    await Task.model.update({
        task_state: TaskState.submit_storage_proof
    }, {
        where: {
            id: task.id
        }
    });
}

export async function claimRewards() {
    while (true) {
        const tasks = await Task.model.findAll({
            where: {
                task_state: TaskState.period_finish
            },
            limit: 100
        });
        if (tasks.length === 0) {
            await sleep(10);
            continue;
        }
        for (const task of tasks) {
            try {
                await claimReward(task);
            } catch (e) {
                logger.error(`Claim reward failed: ${e.message}`);
                await sleep(2);
            }
        }
        await sleep(1);
    }
}

async function claimReward(task: any) {
    const order = (await Order.model.findAll({
        where: {
            id: task.order_id
        }
    }))[0];
    const provider = await getTonProvider();
    const storageContract = provider.getStorageContract(order.address);
    const key = await mnemonicToWalletKey(configs.task.providerMnemonic.split(" "));
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    const walletContract = provider.getTonClient().open(wallet);
    const sender = walletContract.sender(key.secretKey);
    let earned = await storageContract.getEarned(wallet.address);
    let update;
    if (earned > 0n) {
        await storageContract.sendClaimStorageRewards(sender);
        let retry = 0, claimSuccess = false;
        while (earned != 0n && retry < 10) {
            earned = await storageContract.getEarned(sender.address);
            if (earned == 0n) {
                claimSuccess = true;
                break;
            }
            retry++;
        }
        update = {
            task_state: claimSuccess ? TaskState.task_finish : TaskState.period_finish,
            total_rewards: claimSuccess ? earned : 0
        }
    } else {
        update = {
            task_state: TaskState.task_finish
        }
    }
    await Task.model.update(update, {
        where: {
            id: task.id,
        }
    });
}
