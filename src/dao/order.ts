import {sequelize} from "../db";
import {DataTypes} from "sequelize";
import {ModelStatic} from "sequelize/types/model";
import {OrderState} from "../type/common";
export class Order {
    static model: ModelStatic<any> = sequelize.define(
        'orders', {
            id: {
                type: DataTypes.BIGINT,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false,
            },
            address: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true
            },
            torrent_hash: {
              type: DataTypes.STRING,
              allowNull: false,
            },
            owner_address: {
              type: DataTypes.STRING,
              allowNull: false,
            },
            file_merkle_hash: {
                type: DataTypes.TEXT,
                allowNull: false
            },
            file_size_in_bytes: {
                type: DataTypes.BIGINT,
                allowNull: false
            },
            storage_period_in_sec: {
                type: DataTypes.BIGINT,
                allowNull: false
            },
            max_storage_proof_span_in_sec: {
                type: DataTypes.BIGINT,
                allowNull: false
            },
            treasury_info: {
                type: DataTypes.TEXT,
                allowNull: false
            },
            started: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            total_rewards: {
                type: DataTypes.BIGINT,
                allowNull: false
            },
            period_finish: {
                type: DataTypes.BIGINT,
                allowNull: false,
                defaultValue: 0
            },
            order_detail: {
                type: DataTypes.TEXT,
                allowNull: false,
                defaultValue: "{}"
            },
            order_state: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: OrderState.not_started,
            },
        }, {
            indexes: [
                {
                    fields: ['torrent_hash']
                },
                {
                    fields: ["started"]
                },
                {
                    fields: ["owner_address"]
                },
                {
                    fields: ["total_rewards"]
                },
                {
                    fields: ["period_finish"]
                },
                {
                    fields: ["order_state"]
                }
            ]
        }
    )
}
