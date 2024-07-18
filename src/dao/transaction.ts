import {sequelize} from "../db";
import {DataTypes} from "sequelize";
import {ModelStatic} from "sequelize/types/model";
export class Transaction {
    static model: ModelStatic<any> = sequelize.define(
        'transactions', {
            id: {
                type: DataTypes.BIGINT,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            address: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            tx_hash: {
                type: DataTypes.BIGINT,
                allowNull: false,
            },
            lt: {
                type: DataTypes.INTEGER,
                allowNull: false
            },
            op_code: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            exit_code: {
                type: DataTypes.INTEGER,
                allowNull: false
            },
            order_index: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            detail: {
                type: DataTypes.TEXT,
                allowNull: false
            }
        }, {
            indexes: [
                {
                    fields: ['lt']
                },
                {
                    fields: ["op_code"]
                },
                {
                    fields: ["tx_hash", "lt"],
                    unique: true
                }
            ]
        }
    )
}
