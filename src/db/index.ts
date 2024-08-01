const { Sequelize } = require('sequelize');
import {configs, isDev} from "../config";

export const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: `${configs.dbPath}/db.sqlite`,
    logging: isDev
});



