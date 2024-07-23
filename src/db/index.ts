const { Sequelize } = require('sequelize');
import {configs, isDev} from "../config";

export const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: `${configs.dbPath}/db.sqlite`,
    logging: isDev
});


export async function initDb() {
    await sequelize.sync();
}

export async function disconnect() {
    await sequelize.close();
}
