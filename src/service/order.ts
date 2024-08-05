import {getTonProvider, TonProvider} from "../util/ton";
import {Address, OpenedContract} from "@ton/ton";
import {Cell} from "@ton/core";
import {OrderState, Valid} from "../type/common";
import {now, sleep} from "../util/common";
import {sequelize} from "../db";
import {Order} from "../dao/order";
import {Transaction} from "../dao/transaction";
import {Op, or, Transaction as DBTransaction} from "sequelize";
import {logger} from "../util/logger";
import {LAST_ORDER_UPDATE_ID, TON_BAG_ADDRESS} from "./constants";
import {Config} from "../dao/config";
import {StorageContract} from "../wrapper/StorageContract";

/**
 * Save orders
 */
export async function analysisOrders() {
    const ton = await getTonProvider();
    while (true) {
        const orderTx = await Transaction.model.findAll({
            where: {
                address: TON_BAG_ADDRESS,
                need_save_order: Valid.TRUE
            }
        });
        if (orderTx.length === 0) {
            await sleep(10);
            continue;
        }
        for (const tx of orderTx) {
            const orderAddress = JSON.parse(tx.detail).outMessage.dest;
            await parseAndSaveOrder(ton, orderAddress, tx.id);
        }
    }
}

/**
 * Update order state
 */
export async function updateOrderState() {
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
                            [Op.gte]: now()
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
            await sleep(10);
            continue;
        }
        for (const order of orders) {
            const contract: OpenedContract<StorageContract> = provider.getStorageContract(order.address);
            const orderState = await contract.getOrderState();
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
 * Parse and save order from contract address
 * @param ton TonProvider
 * @param address order contract address
 * @param id transaction.id
 */
async function parseAndSaveOrder(ton: TonProvider, address: string, id: number) {
    const existDbOrder = await Order.model.findOne({
        where: {
            address
        }
    });
    if (existDbOrder) {
        await Transaction.model.update({
            need_save_order: Valid.FALSE
        }, {
            where: {
                id
            },
        });
        return;
    }
    const contract: OpenedContract<StorageContract> = ton.getStorageContract(address);
    const order = await contract.getOrderState();
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



