import {getTonProvider, TonProvider} from "../util/ton";
import {Config} from "../dao/config";
import {Order} from "../dao/order";
import {Op, or, Transaction as DBTransaction} from "sequelize";
import {OrderState, TaskState} from "../type/common";
import {logger} from "../util/logger";
import {sleep} from "../util/common";
import {sequelize} from "../db";
import {Task} from "../dao/task";
import {LAST_TASK_GENERATE_ORDER_ID} from "./constants";
import {configs} from "../config";

export async function generateTasks() {
    while(true) {
        const provider = await getTonProvider();
        const lastOrderId = await Config.get(LAST_TASK_GENERATE_ORDER_ID, "0");
        const orders = await Order.model.findAll({
            where: {
                id: {
                    [Op.gt]: lastOrderId
                },
                order_state: {
                    [Op.gte]: OrderState.not_started
                },
                file_size_in_bytes: {
                    [Op.lte]: configs.task.maxFileSize.toString()
                },
                total_rewards: {
                    [Op.gte]: configs.task.minReward.toString()
                },
                order_price: {
                    [Op.gte]: configs.task.orderMinPrice.toString()
                }
            },
            limit: 10,
            order: [
                ['id', 'ASC']
            ],
        });
        if (orders.length === 0) {
            logger.info(`No task order found...`);
            await sleep(10);
            continue;
        }
        for (const order of orders) {
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
    const existTask = await Task.model.findAll({
        where: {
            order_id: order.id
        }
    });
    if (existTask.length > 0) {
        return;
    }
    // get order current state
    const orderAddress = order.address
    const providerAddress = await provider.getProviderAddress();
    const contract = provider.getStorageContract(orderAddress);
    const inStorageProviderList = await contract.getInStorageProviderList(providerAddress);
    if (inStorageProviderList) {
        // query last proof time
        const lastProofTime = await contract.getStorageProviderLastProofTime(providerAddress);
        await Task.model.create({
            order_id: order.id,
            provider_address: providerAddress.toString(),
            last_proof_time: lastProofTime,
            task_state: TaskState.unregister_storage_provider,
        }, {
            transaction
        });
        return;
    }
    const residueCount = await contract.getResidueProviderCount();
    if (residueCount <= 0) {
        logger.debug("No residue provider count for order: ", order.address);
        return;
    }
    const orderState = await provider.getStorageContract(orderAddress).getOrderState();
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
