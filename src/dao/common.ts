import {sequelize} from "../db";
import {Order} from "./order";
import {Config} from "./config";
import {Task} from "./task";
import {Transaction} from "./transaction";

const models: any[] = [Order, Config, Task, Transaction]

export async function initDb() {
    await sequelize.sync();
    for (const model of models) {
        await model.model.sync({alter: true});
    }
}

export async function disconnect() {
    await sequelize.close();
}
